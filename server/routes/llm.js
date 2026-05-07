const express = require('express');
const db = require('../db/database');
const { buildSystemPrompt } = require('../utils/promptBuilder');
const router = express.Router();

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_API = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent`;

const MAX_TOKENS = { beginner: 60, elementary: 80, intermediate: 100, 'upper-intermediate': 120, advanced: 150 };

// ElevenLabs calls /chat/completions (OpenAI-compatible path); also keep / for direct testing
router.post(['/chat/completions', '/'], async (req, res) => {
  // ElevenLabs forwards customLlmExtraBody as elevenlabs_extra_body in the LLM request
  const extra = req.body.elevenlabs_extra_body ?? {};
  const { messages = [] } = req.body;
  const session_id = req.body.session_id ?? extra.session_id ?? null;
  const speech_speed = req.body.speech_speed ?? extra.speech_speed ?? 'normal';
  const turnCount = messages.filter(m => m.role === 'user').length;

  console.log(`[LLM] body keys: ${Object.keys(req.body).join(', ')}`);
  console.log(`[LLM] session_id=${session_id ?? 'NONE'} turn=${turnCount} speed=${speech_speed}`);

  let systemPromptText = null;
  let level = 'intermediate';

  if (session_id) {
    try {
      const row = db.prepare(`
        SELECT s.student_name, s.level, s.interests, s.learning_style, s.outline,
               t.title, t.topic, t.objectives, t.vocabulary, t.language_forms,
               t.persona_name, t.persona_description
        FROM sessions s
        JOIN tasks t ON t.id = s.task_id
        WHERE s.id = ?
      `).get(session_id);

      if (row) {
        level = row.level || 'intermediate';

        // Find the current beat from the Gemini-generated outline
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

        console.log(`[LLM] Session found: student=${row.student_name} level=${level} topic="${row.topic}" beat=${currentBeat?.turn ?? 'none'} goal="${currentBeat?.goal ?? 'fallback'}"`);

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
        );
      } else {
        console.warn(`[LLM] No session found for id=${session_id} — using fallback prompt`);
      }
    } catch (e) {
      console.error('[LLM] Session lookup error:', e.message);
    }
  } else {
    console.warn('[LLM] No session_id in request — using fallback prompt');
  }

  if (!systemPromptText) {
    systemPromptText = 'You are Alex, a warm and friendly English conversation partner for EFL learners. Keep responses concise and always ask one follow-up question.';
  }

  if (!process.env.GEMINI_API_KEY) {
    console.error('[LLM] GEMINI_API_KEY not set');
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server' });
  }

  // Convert OpenAI-format messages → Gemini contents (drop system messages — we supply our own)
  let geminiContents = messages
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: typeof m.content === 'string' ? m.content : '' }],
    }))
    .filter(m => m.parts[0].text.trim());

  // Gemini requires conversation to start with a 'user' turn
  if (!geminiContents.length || geminiContents[0].role !== 'user') {
    geminiContents.unshift({ role: 'user', parts: [{ text: 'Hello' }] });
  }

  let geminiRes;
  try {
    geminiRes = await fetch(`${GEMINI_API}?alt=sse&key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: systemPromptText }] },
        contents: geminiContents,
        generationConfig: {
          maxOutputTokens: MAX_TOKENS[level] ?? 150,
          temperature: 0.7,
          candidateCount: 1,
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
    });
  } catch (e) {
    console.error('[LLM] Gemini fetch error:', e.message);
    return res.status(502).json({ error: 'Could not reach Gemini API' });
  }

  if (!geminiRes.ok) {
    const text = await geminiRes.text();
    console.error('[LLM] Gemini error:', geminiRes.status, text);
    return res.status(502).json({ error: 'Gemini API error', detail: text });
  }

  // Stream back in OpenAI SSE format (what ElevenLabs expects)
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const reader = geminiRes.body.getReader();
  const decoder = new TextDecoder();
  const id = `chatcmpl-${Date.now()}`;
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6).trim();
        if (!raw) continue;
        try {
          const parsed = JSON.parse(raw);
          const parts = parsed.candidates?.[0]?.content?.parts ?? [];
          const text = parts.filter(p => !p.thought).map(p => p.text || '').join('');
          if (text) {
            res.write(`data: ${JSON.stringify({
              id,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model: GEMINI_MODEL,
              choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
            })}\n\n`);
          }
        } catch (_) {}
      }
    }
  } catch (e) {
    console.error('[LLM] Stream error:', e.message);
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

module.exports = router;
