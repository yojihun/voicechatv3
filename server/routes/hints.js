const express = require('express');
const { db } = require('../db/database');
const router = express.Router();

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const HINT_CONFIG = {
  beginner:    { type: 'starters', cefr: 'A1', instruction: 'Generate 3 very simple sentence starters (3–6 words, end with "...") the student could say aloud. Use only A1 vocabulary.' },
  elementary:  { type: 'starters', cefr: 'A2', instruction: 'Generate 3 simple sentence starters (4–8 words, end with "...") the student could say aloud. Use A2 vocabulary.' },
  intermediate: { type: 'vocab',   cefr: 'B1', instruction: 'Generate 4 useful English words or short phrases (1–3 words each) the student could include in their answer. Mix content words and connectors.' },
};

router.post('/', async (req, res) => {
  const { session_id, ai_text } = req.body;
  if (!session_id || !ai_text) return res.json({ hints: [], type: null });

  let level = 'intermediate';
  try {
    const row = await db.execute({ sql: 'SELECT level FROM sessions WHERE id = ?', args: [session_id] });
    level = row.rows[0]?.level || 'intermediate';
  } catch (_) {}

  const cfg = HINT_CONFIG[level];
  if (!cfg) return res.json({ hints: [], type: null });

  const prompt = `A Korean high school EFL student (${cfg.cefr} level) needs to respond to this message from their AI conversation partner:
"${ai_text}"

${cfg.instruction}
Return ONLY valid JSON: {"hints": [...]}`;

  try {
    const geminiRes = await fetch(`${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.8,
          maxOutputTokens: 150,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!geminiRes.ok) return res.json({ hints: [], type: null });

    const data = await geminiRes.json();
    const text = data.candidates?.[0]?.content?.parts?.find(p => !p.thought)?.text;
    if (!text) return res.json({ hints: [], type: null });

    const parsed = JSON.parse(text);
    res.json({ hints: Array.isArray(parsed.hints) ? parsed.hints.slice(0, 4) : [], type: cfg.type });
  } catch (_) {
    res.json({ hints: [], type: null });
  }
});

module.exports = router;
