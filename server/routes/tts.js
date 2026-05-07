const express = require('express');
const router = express.Router();

const TTS_API = 'https://api.elevenlabs.io/v1/text-to-speech';

// speed string → ElevenLabs speed value
const SPEED = { slow: 0.75, normal: 1.0, fast: 1.2 };

router.post('/', async (req, res) => {
  const { text, voice_id, speed = 'normal' } = req.body;
  if (!text) return res.status(400).json({ error: 'text required' });
  if (!voice_id) return res.status(400).json({ error: 'voice_id required' });

  try {
    const elevenRes = await fetch(`${TTS_API}/${voice_id}/stream`, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: 'eleven_flash_v2_5',
        voice_settings: {
          speed: SPEED[speed] ?? 1.0,
          stability: 0.5,
          similarity_boost: 0.8,
        },
      }),
    });

    if (!elevenRes.ok) {
      const err = await elevenRes.text();
      console.error('[TTS] ElevenLabs error:', err);
      return res.status(502).json({ error: 'TTS failed' });
    }

    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Transfer-Encoding', 'chunked');

    const reader = elevenRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(Buffer.from(value));
    }
    res.end();
  } catch (e) {
    console.error('[TTS] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
