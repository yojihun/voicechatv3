const express = require('express');
const { db } = require('../db/database');
const router = express.Router();

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

router.get('/tasks', async (req, res) => {
  const result = await db.execute({
    sql: `SELECT t.id, t.title, t.topic, t.objectives, t.persona_name, t.teacher_id,
                 tc.name as teacher_name
          FROM tasks t
          JOIN teachers tc ON tc.id = t.teacher_id
          WHERE t.active = 1
          ORDER BY t.created_at DESC`,
    args: [],
  });
  res.json(result.rows.map(t => ({
    ...t,
    objectives:     JSON.parse(t.objectives     || '[]'),
    vocabulary:     JSON.parse(t.vocabulary     || '[]'),
    language_forms: JSON.parse(t.language_forms || '[]'),
  })));
});

async function generateOutline(task, student) {
  const objectives  = JSON.parse(task.objectives     || '[]');
  const vocabulary  = JSON.parse(task.vocabulary     || '[]');
  const langForms   = JSON.parse(task.language_forms || '[]');
  const interests   = JSON.parse(student.interests   || '[]');
  const level       = student.level || 'intermediate';
  const persona     = task.persona_name || 'Alex';

  const vocabStr  = vocabulary.map(v => typeof v === 'object' ? `"${v.word}" (${v.definition})` : `"${v}"`).join(', ');
  const formsStr  = langForms.join(', ');
  const levelNote = {
    beginner:     'Simple short sentences. Ask only yes/no or choice questions. One idea at a time.',
    intermediate: 'Clear natural sentences. Open questions that invite 1–2 sentence answers.',
    advanced:     'Rich language. Intellectually stimulating questions that require explanation.',
  }[level] || 'Natural conversational English.';

  const prompt = `You are an expert EFL curriculum designer. Your job is to create a TBLT (Task-Based Language Teaching) role-play scenario AND a structured 8-turn conversation outline for ${persona}, an AI English conversation partner, to guide a Korean EFL student through a lesson task.

STUDENT: ${student.student_name}, ${level} level${interests.length ? `, interests: ${interests.join(', ')}` : ''}
TASK TOPIC: ${task.topic || task.title}
OBJECTIVES: ${objectives.join('; ') || 'build conversational fluency'}
TARGET VOCABULARY: ${vocabStr || 'none specified'}
LANGUAGE FORMS TO ELICIT: ${formsStr || 'none specified'}
LANGUAGE LEVEL NOTE: ${levelNote}

STEP 1 — Create a role-play scenario:
- Design a real-world situation grounded in the task topic
- The student plays a role that requires them to use the target language to accomplish a concrete goal
- ${persona} plays a character who helps drive the conversation toward that goal
- The scenario should feel natural for a Korean high school student
- Keep descriptions concise (1–2 sentences each)

STEP 2 — Design exactly 8 beats that fit within the role-play:
- Beats 1–2: warmup — ${persona} establishes the scenario and builds rapport using student's interests, no heavy lesson content yet
- Beat 3: bridge into the main task/goal
- Beats 4–8: task engagement — advance the role-play, cover objectives, introduce vocabulary, elicit language forms
- Distribute vocabulary: one vocab word per beat
- Each language form gets a dedicated beat with a question whose natural answer requires that form
- "ai_cue" must be a SPECIFIC sentence ${persona} says inside the role-play — not a description

Return ONLY valid JSON, no other text:
{
  "scenario": {
    "student_role": "one sentence describing the student's character and situation",
    "ai_role": "one sentence describing who ${persona} is in this scenario",
    "situation": "one sentence describing the context/setting",
    "student_goal": "one short sentence stating what the student must accomplish"
  },
  "beats": [
    {
      "turn": 1,
      "phase": "warmup",
      "goal": "one-sentence description of what this turn achieves",
      "ai_cue": "the exact thing ${persona} says to open this turn",
      "vocab_target": null,
      "form_target": null
    }
  ]
}`;

  const res = await fetch(`${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.8,
        maxOutputTokens: 4000,
        thinkingConfig: { thinkingBudget: 0 },
      },
    }),
  });

  if (!res.ok) throw new Error(`Gemini planning HTTP ${res.status}`);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty planning response from Gemini');
  return JSON.parse(text);
}

router.post('/start', async (req, res) => {
  const { task_id, student_name, level, interests, learning_style } = req.body;
  if (!task_id || !student_name) return res.status(400).json({ error: 'task_id and student_name required' });

  const taskResult = await db.execute({ sql: 'SELECT * FROM tasks WHERE id = ?', args: [task_id] });
  const task = taskResult.rows[0] ?? null;
  if (!task) return res.status(404).json({ error: 'Task not found' });

  const student = {
    student_name,
    level,
    interests:  JSON.stringify(interests || []),
    learning_style,
  };

  let outline = null;
  let scenario = null;
  try {
    const generated = await generateOutline(task, student);
    scenario = generated.scenario ?? null;
    outline = { beats: generated.beats };
    console.log(`[Session] Outline generated: ${outline.beats?.length} beats, scenario: ${!!scenario}, for "${task.topic}"`);
  } catch (e) {
    console.error('[Session] Outline generation failed (will use fallback prompt):', e.message);
  }

  const ins = await db.execute({
    sql: 'INSERT INTO sessions (task_id, student_name, level, interests, learning_style, outline, scenario) VALUES (?, ?, ?, ?, ?, ?, ?)',
    args: [task_id, student_name, level, JSON.stringify(interests || []), learning_style, outline ? JSON.stringify(outline) : null, scenario ? JSON.stringify(scenario) : null],
  });

  res.json({
    session_id:    Number(ins.lastInsertRowid),
    first_message: `Hi ${student_name}! I'm ${task.persona_name || 'Alex'}. Great to meet you!`,
    outline_beats: outline?.beats?.length ?? 0,
    scenario,
  });
});

router.post('/:sessionId/end', async (req, res) => {
  const { conversation_id, transcript } = req.body;
  await db.execute({
    sql: 'UPDATE sessions SET conversation_id=?, transcript=?, ended_at=CURRENT_TIMESTAMP WHERE id=?',
    args: [conversation_id || null, JSON.stringify(transcript || []), req.params.sessionId],
  });
  res.json({ ok: true });
});

module.exports = router;
