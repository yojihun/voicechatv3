const express = require('express');
const router = express.Router();

const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent`;

router.post('/', async (req, res) => {
  const { text } = req.body;
  if (!text?.trim()) return res.status(400).json({ error: 'text required' });

  const prompt = `You are an expert EFL curriculum designer for Korean secondary school students. Analyze this text and extract structured teaching materials aligned with the 2022 Korean National English Curriculum (2022 영어과 교육과정).

TEXT:
"""
${text.slice(0, 3000)}
"""

Return ONLY valid JSON with these five fields:

1. "title" — a short lesson title (3–6 words) suitable for a task card. Should sound natural and appealing to a Korean high school student. Example: "Planning a Birthday Celebration", "Talking About Daily Routines", "Describing a Favourite Place"

2. "topic" — a concise phrase (1–5 words) naming the lesson topic

3. "objectives" — exactly 3–4 learning objectives. Each must be a specific, functional can-do statement grounded in the 2022 English curriculum's 의사소통 기능 (communication functions). Rules:
   - Use communication-function verbs: describe, explain, express (opinions/feelings/excitement), ask for and give (information), talk about (experiences/plans), compare, suggest, invite, narrate
   - Name the linguistic vehicle (a grammar form or key vocabulary from this text) when it makes the objective more specific
   - Format: "Students can [function verb] [specific content] [using X — only if it adds precision]"
   - GOOD: "Students can describe a past event using past continuous (was/were V-ing)"
   - GOOD: "Students can express anticipation or excitement using 'look forward to doing'"
   - GOOD: "Students can ask for and give information about someone's birthday plans"
   - BAD: "Students can talk about birthdays" (too vague — no function, no linguistic target)
   - BAD: "Students can discuss restaurants" (generic, non-functional)

4. "vocabulary" — 8–12 useful words or phrases from the text that Korean EFL students should actively learn. Just the items, no definitions.

5. "language_forms" — exactly 2–4 grammar patterns or fixed expressions from the text, each written as a concise formula or pattern label — NOT a full sentence:
   - "look forward to doing"  (NOT "She was looking forward to seeing her friends.")
   - "past continuous (was/were + V-ing)"  (NOT "They were meeting at Mamma Mia's.")
   - "be + adjective + to-infinitive"  (NOT "She was excited to see her friends.")
   - "so + adjective + that-clause"  (NOT "He was so tired that he fell asleep.")
   Only include patterns that naturally arise in conversation and are worth explicitly practising.

Return ONLY valid JSON, no other text:
{
  "title": "...",
  "topic": "...",
  "objectives": ["Students can ...", "Students can ..."],
  "vocabulary": ["word or phrase", "another phrase"],
  "language_forms": ["pattern formula", "another pattern"]
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
          maxOutputTokens: 1500,
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
