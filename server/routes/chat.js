const express = require('express');
const { db } = require('../db/database');
const { buildSystemPrompt } = require('../utils/promptBuilder');
const router = express.Router();

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const MAX_TOKENS = { beginner: 60, elementary: 80, intermediate: 100, 'upper-intermediate': 120, advanced: 150 };

router.post('/', async (req, res) => {
  const { session_id, messages = [], speech_speed = 'normal', silence_count = 0 } = req.body;
  const turnCount = messages.filter(m => m.role === 'user').length;

  let systemPromptText = null;
  let level = 'intermediate';

  if (session_id) {
    try {
      const dbResult = await db.execute({
        sql: `SELECT s.student_name, s.level, s.interests, s.learning_style, s.outline, s.scenario,
                     t.title, t.topic, t.objectives, t.vocabulary, t.language_forms,
                     t.persona_name, t.persona_description
              FROM sessions s
              JOIN tasks t ON t.id = s.task_id
              WHERE s.id = ?`,
        args: [session_id],
      });
      const row = dbResult.rows[0] ?? null;

      if (row) {
        level = row.level || 'intermediate';

        let currentBeat = null;
        if (row.outline) {
          try {
            const outline = JSON.parse(row.outline);
            const beats = outline.beats || [];
            currentBeat = beats.find(b => b.turn === turnCount)
              ?? beats[beats.length - 1]
              ?? null;
          } catch (_) {}
        }

        let scenario = null;
        if (row.scenario) {
          try { scenario = JSON.parse(row.scenario); } catch (_) {}
        }

        systemPromptText = buildSystemPrompt(
          {
            title: row.title, topic: row.topic,
            objectives: row.objectives, vocabulary: row.vocabulary,
            language_forms: row.language_forms,
            persona_name: row.persona_name, persona_description: row.persona_description,
          },
          {
            student_name: row.student_name, level: row.level,
            interests: row.interests, learning_style: row.learning_style,
          },
          turnCount,
          speech_speed,
          currentBeat,
          scenario,
          silence_count,
        );
      }
    } catch (e) {
      console.error('[Chat] Session lookup error:', e.message);
    }
  }

  if (!systemPromptText) {
    systemPromptText = 'You are Alex, a warm and friendly English conversation partner for EFL learners. Keep responses concise and always ask one follow-up question. Your response is read aloud by a text-to-speech engine — never use emoji, asterisks, bullet points, markdown, or any non-spoken character. Write exactly as you would speak.';
  }

  const geminiContents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : '' }],
    }))
    .filter(m => m.parts[0].text.trim());

  if (!geminiContents.length || geminiContents[0].role !== 'user') {
    geminiContents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  try {
    const geminiRes = await fetch(`${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPromptText }] },
        contents: geminiContents,
        generationConfig: {
          maxOutputTokens: MAX_TOKENS[level] ?? 100,
          temperature: 0.7,
          candidateCount: 1,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('[Chat] Gemini error:', err);
      return res.status(502).json({ error: 'AI response failed' });
    }

    const data = await geminiRes.json();
    const parts = data.candidates?.[0]?.content?.parts ?? [];
    const rawText = parts.filter(p => !p.thought).map(p => p.text || '').join('').trim();

    if (!rawText) return res.status(502).json({ error: 'Empty response from AI' });

    const COMPLETE_MARKER = '<<TASK_COMPLETE>>';
    const taskComplete = rawText.includes(COMPLETE_MARKER);
    const text = rawText.replace(COMPLETE_MARKER, '').trim();

    res.json({ text, task_complete: taskComplete });
  } catch (e) {
    console.error('[Chat] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
