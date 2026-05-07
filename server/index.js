require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const teacherRoutes = require('./routes/teachers');
const sessionRoutes = require('./routes/sessions');
const analyzeRoute = require('./routes/analyze');
const feedbackRoute = require('./routes/feedback');
const sttRoute = require('./routes/stt');
const ttsRoute = require('./routes/tts');
const chatRoute = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3002;

// On Vercel the deployment URL differs from the alias, so allow the configured
// origin or fall back to '*' (API keys protect the routes anyway).
const corsOrigin = process.env.CLIENT_ORIGIN || (process.env.VERCEL ? '*' : 'http://localhost:5173');
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.use('/api/teachers', teacherRoutes);
app.use('/api', sessionRoutes);
app.use('/api/tasks/analyze', analyzeRoute);
app.use('/api/feedback', feedbackRoute);
app.use('/api/stt', sttRoute);
app.use('/api/tts', ttsRoute);
app.use('/api/chat', chatRoute);

app.get('/health', (_, res) => res.json({ ok: true }));

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
}
