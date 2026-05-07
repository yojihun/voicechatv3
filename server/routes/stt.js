const express = require('express');
const multer = require('multer');
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const SCRIBE_API = 'https://api.elevenlabs.io/v1/speech-to-text';

router.post('/', upload.single('audio'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No audio file' });

  const form = new FormData();
  form.append('model_id', 'scribe_v1');
  form.append('language_code', 'en');
  form.append(
    'audio',
    new Blob([req.file.buffer], { type: req.file.mimetype }),
    req.file.originalname || 'recording.webm',
  );

  // Keyterm prompting from task vocabulary (passed as repeated fields)
  const keyterms = req.body.keyterms;
  if (keyterms) {
    const list = Array.isArray(keyterms) ? keyterms : [keyterms];
    list.forEach(k => form.append('keyterm', k));
  }

  try {
    const scribeRes = await fetch(SCRIBE_API, {
      method: 'POST',
      headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
      body: form,
    });

    if (!scribeRes.ok) {
      const err = await scribeRes.text();
      console.error('[STT] Scribe error:', err);
      return res.status(502).json({ error: 'Transcription failed' });
    }

    const data = await scribeRes.json();
    res.json({ text: data.text || '' });
  } catch (e) {
    console.error('[STT] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
