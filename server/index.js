require('dotenv').config();
const express = require('express');
const cors = require('cors');

const teacherRoutes = require('./routes/teachers');
const sessionRoutes = require('./routes/sessions');
const analyzeRoute = require('./routes/analyze');
const feedbackRoute = require('./routes/feedback');
const sttRoute = require('./routes/stt');
const ttsRoute = require('./routes/tts');
const chatRoute = require('./routes/chat');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

app.use('/api/teachers', teacherRoutes);
app.use('/api', sessionRoutes);
app.use('/api/tasks/analyze', analyzeRoute);
app.use('/api/feedback', feedbackRoute);
app.use('/api/stt', sttRoute);
app.use('/api/tts', ttsRoute);
app.use('/api/chat', chatRoute);

app.get('/health', (_, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
