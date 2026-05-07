const express = require('express');
const { db } = require('../db/database');
const router = express.Router();

const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

router.post('/:sessionId', async (req, res) => {
  const dbResult = await db.execute({
    sql: `SELECT s.student_name, s.level, s.transcript,
                 t.language_forms, t.vocabulary
          FROM sessions s
          JOIN tasks t ON t.id = s.task_id
          WHERE s.id = ?`,
    args: [req.params.sessionId],
  });
  const row = dbResult.rows[0] ?? null;

  if (!row) return res.status(404).json({ error: 'Session not found' });

  const transcript     = JSON.parse(row.transcript     || '[]');
  const languageForms  = JSON.parse(row.language_forms || '[]');
  const vocabulary     = JSON.parse(row.vocabulary     || '[]');
  const userMessages   = transcript.filter(m => m.role === 'user').map(m => m.message).filter(Boolean);

  if (userMessages.length === 0) {
    return res.json({ sentences: [], overall: '이번 세션에서 음성이 감지되지 않았어요. 마이크가 잘 작동하는지 확인하고, 다음번에는 더 크게 말해 보세요!' });
  }

  const vocabStr = vocabulary.map(v => typeof v === 'object' ? v.word : v).join(', ');
  const formsStr = languageForms.length
    ? languageForms.map((f, i) => `${i + 1}. ${f}`).join('\n')
    : null;

  const prompt = `You are a warm and expert EFL teacher giving written feedback to a Korean high school English learner after a conversation practice session.

STUDENT: ${row.student_name} (${row.level} level)
${formsStr ? `LANGUAGE PATTERNS THEY WERE PRACTICING:\n${formsStr}` : 'No specific language form target — give general grammar feedback.'}
${vocabStr ? `VOCABULARY THEY WERE PRACTICING: ${vocabStr}` : ''}

STUDENT'S UTTERANCES (numbered):
${userMessages.map((m, i) => `${i + 1}. "${m}"`).join('\n')}

Task: Select UP TO 3 utterances that are most worth commenting on. Prioritise:
1. Utterances that attempt the target language patterns
2. Utterances with notable grammar or phrasing (correct OR incorrect)
3. Utterances that use target vocabulary

For each selected utterance give honest, balanced feedback. All explanatory text (what_worked, needs_improvement, overall) must be written IN KOREAN. Only "original" and "corrected" stay in English.

- what_worked: Write IN KOREAN — find something genuinely positive about the utterance (effort, vocabulary choice, meaning, structure, fluency).
  EXCEPTION: if the utterance is 3 words or fewer, a single word, or a one-syllable filler ("yeah", "ok", "um"), do NOT write positive feedback. Instead write in Korean: "이 표현은 너무 짧아요. 다음번에는 완전한 문장으로 말해 보세요."
- needs_improvement: Write IN KOREAN — ONE specific, actionable improvement. Always required (never null). Even for a good sentence, find a natural refinement: a more precise word, a more idiomatic phrasing, a grammar nuance the student can actually learn from.
- corrected: the natural correct/improved version — ALWAYS in English only.

Also write "overall" IN KOREAN: 2 sentences that (1) acknowledge genuine effort and (2) name ONE concrete thing to work on next time. Be specific and honest — no empty praise.

IMPORTANT: "original" and "corrected" must always be in English only. Everything else must be in Korean.

Return ONLY valid JSON (no other text):
{
  "sentences": [
    {
      "original": "exact student utterance in English",
      "what_worked": "긍정적인 피드백 — 한국어로",
      "needs_improvement": "개선 포인트 — 한국어로",
      "corrected": "natural improved version in English"
    }
  ],
  "overall": "전체 피드백 2문장 — 한국어로"
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
          maxOutputTokens: 2000,
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
    await db.execute({ sql: 'UPDATE sessions SET feedback = ? WHERE id = ?', args: [JSON.stringify(parsed), req.params.sessionId] });
    res.json(parsed);
  } catch (e) {
    console.error('[Feedback] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
