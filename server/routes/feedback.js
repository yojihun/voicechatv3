const express = require('express');
const db = require('../db/database');
const router = express.Router();

const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

router.post('/:sessionId', async (req, res) => {
  const row = db.prepare(`
    SELECT s.student_name, s.level, s.transcript,
           t.language_forms, t.vocabulary
    FROM sessions s
    JOIN tasks t ON t.id = s.task_id
    WHERE s.id = ?
  `).get(req.params.sessionId);

  if (!row) return res.status(404).json({ error: 'Session not found' });

  const transcript     = JSON.parse(row.transcript     || '[]');
  const languageForms  = JSON.parse(row.language_forms || '[]');
  const vocabulary     = JSON.parse(row.vocabulary     || '[]');
  const userMessages   = transcript.filter(m => m.role === 'user').map(m => m.message).filter(Boolean);

  if (userMessages.length === 0) {
    return res.json({ sentences: [], overall: "We didn't catch any speech this session. Make sure your microphone is working and try speaking clearly next time!" });
  }

  const vocabStr  = vocabulary.map(v => typeof v === 'object' ? v.word : v).join(', ');
  const formsStr  = languageForms.length
    ? languageForms.map((f, i) => `${i + 1}. ${f}`).join('\n')
    : null;

  const needsKorean = ['beginner', 'elementary'].includes(row.level);

  const prompt = `You are a warm and expert EFL teacher giving written feedback to a Korean English learner after a conversation practice session.

STUDENT: ${row.student_name} (${row.level} level)
${formsStr ? `LANGUAGE PATTERNS THEY WERE PRACTICING:\n${formsStr}` : 'No specific language form target — give general grammar feedback.'}
${vocabStr ? `VOCABULARY THEY WERE PRACTICING: ${vocabStr}` : ''}

STUDENT'S UTTERANCES (numbered):
${userMessages.map((m, i) => `${i + 1}. "${m}"`).join('\n')}

Task: Select UP TO 3 utterances that are most worth commenting on. Prioritise:
1. Utterances that attempt the target language patterns
2. Utterances with notable grammar or phrasing (correct OR incorrect)
3. Utterances that use target vocabulary

For each selected utterance give honest, encouraging feedback:
- what_worked: find something genuinely positive — effort, vocabulary choice, meaning, structure, fluency. Even if the sentence is wrong, praise the attempt.
- needs_improvement: ONE specific, clear correction (null if the sentence is already correct or near-correct)
- corrected: the natural correct/improved version (null if already correct)${needsKorean ? `
- what_worked_ko: Korean translation of what_worked
- needs_improvement_ko: Korean translation of needs_improvement (null if needs_improvement is null)` : ''}

Also write a 2-sentence overall encouragement. Be warm and motivating.${needsKorean ? ' Then translate it into Korean for overall_ko.' : ''}

IMPORTANT: "original" and "corrected" must always be written in English only.

Return ONLY valid JSON (no other text):
{
  "sentences": [
    {
      "original": "exact student utterance",
      "what_worked": "specific positive observation",${needsKorean ? `
      "what_worked_ko": "Korean translation of what_worked",` : ''}
      "needs_improvement": "specific correction note, or null",${needsKorean ? `
      "needs_improvement_ko": "Korean translation of needs_improvement, or null",` : ''}
      "corrected": "improved version, or null"
    }
  ],
  "overall": "2-sentence warm encouragement for the student"${needsKorean ? `,
  "overall_ko": "Korean translation of overall"` : ''}
}`;

  try {
    const geminiRes = await fetch(`${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.4,
          maxOutputTokens: needsKorean ? 2500 : 1500,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('[Feedback] Gemini error:', err);
      return res.status(502).json({ error: 'Feedback generation failed' });
    }

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.find(p => !p.thought)?.text;
    if (!text) return res.status(502).json({ error: 'No response from AI' });

    const parsed = JSON.parse(text);
    db.prepare('UPDATE sessions SET feedback = ? WHERE id = ?').run(JSON.stringify(parsed), req.params.sessionId);
    res.json(parsed);
  } catch (e) {
    console.error('[Feedback] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
