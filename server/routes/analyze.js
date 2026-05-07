const express = require('express');
const router = express.Router();

const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

router.post('/', async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });

  const prompt = `You are an expert EFL curriculum designer for Korean learners. Analyze this text and extract teaching materials for a conversation practice task.

TEXT:
"""
${text.slice(0, 3000)}
"""

Extract the following:
1. topic — a short phrase describing what this lesson is about (for English conversation practice)
2. objectives — 3–4 things students should be able to DO after the lesson (use "can" statements: "Students can ask about...", "Students can describe...")
3. vocabulary — 8–12 useful words or phrases from the text that Korean EFL students should learn (just the words/phrases, not definitions)
4. language_forms — 3–5 example sentences showing the grammar patterns or conversational expressions students should practice. Give REAL example sentences, not grammar rule names. Example: "What do you do for a living?" not "present simple questions".

Return ONLY valid JSON:
{
  "topic": "...",
  "objectives": ["Students can ...", "Students can ..."],
  "vocabulary": ["word or phrase", "another phrase"],
  "language_forms": ["Example sentence.", "Another example sentence."]
}`;

  try {
    const geminiRes = await fetch(`${GEMINI_API}?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.3,
          maxOutputTokens: 1200,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });

    if (!geminiRes.ok) {
      const err = await geminiRes.text();
      console.error('[Analyze] Gemini error:', err);
      return res.status(502).json({ error: 'AI analysis failed' });
    }

    const data = await geminiRes.json();
    const responseText = data.candidates?.[0]?.content?.parts?.find(p => !p.thought)?.text;
    if (!responseText) return res.status(502).json({ error: 'No response from AI' });

    res.json(JSON.parse(responseText));
  } catch (e) {
    console.error('[Analyze] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
