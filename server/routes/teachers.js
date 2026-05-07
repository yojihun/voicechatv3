const express = require('express');
const db = require('../db/database');
const router = express.Router();

// Login with teacher code
router.post('/login', (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });
  const teacher = db.prepare('SELECT * FROM teachers WHERE code = ?').get(code.trim().toUpperCase());
  if (!teacher) return res.status(401).json({ error: 'Invalid code' });
  res.json(teacher);
});

// Register a new teacher (dev/testing)
router.post('/register', (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code required' });
  try {
    const result = db.prepare('INSERT INTO teachers (name, code) VALUES (?, ?)').run(name, code.trim().toUpperCase());
    res.json({ id: result.lastInsertRowid, name, code });
  } catch {
    res.status(409).json({ error: 'Code already in use' });
  }
});

// Get all tasks for a teacher
router.get('/:teacherId/tasks', (req, res) => {
  const tasks = db.prepare('SELECT * FROM tasks WHERE teacher_id = ? ORDER BY created_at DESC').all(req.params.teacherId);
  res.json(tasks.map(parseTask));
});

// Create a task
router.post('/:teacherId/tasks', (req, res) => {
  const { title, topic, objectives, vocabulary, language_forms, persona_name, persona_description } = req.body;
  const result = db.prepare(`
    INSERT INTO tasks (teacher_id, title, topic, objectives, vocabulary, language_forms, persona_name, persona_description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    req.params.teacherId, title, topic,
    JSON.stringify(objectives || []),
    JSON.stringify(vocabulary || []),
    JSON.stringify(language_forms || []),
    persona_name || 'Alex',
    persona_description || ''
  );
  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(parseTask(task));
});

// Update a task
router.put('/:teacherId/tasks/:taskId', (req, res) => {
  const { title, topic, objectives, vocabulary, language_forms, persona_name, persona_description, active } = req.body;
  db.prepare(`
    UPDATE tasks SET title=?, topic=?, objectives=?, vocabulary=?, language_forms=?, persona_name=?, persona_description=?, active=?
    WHERE id=? AND teacher_id=?
  `).run(
    title, topic,
    JSON.stringify(objectives || []),
    JSON.stringify(vocabulary || []),
    JSON.stringify(language_forms || []),
    persona_name, persona_description,
    active ?? 1,
    req.params.taskId, req.params.teacherId
  );
  res.json({ ok: true });
});

// Delete a task
router.delete('/:teacherId/tasks/:taskId', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id=? AND teacher_id=?').run(req.params.taskId, req.params.teacherId);
  res.json({ ok: true });
});

// Get all sessions for a task (teacher view)
router.get('/:teacherId/tasks/:taskId/sessions', (req, res) => {
  const sessions = db.prepare(`
    SELECT s.* FROM sessions s
    JOIN tasks t ON t.id = s.task_id
    WHERE s.task_id = ? AND t.teacher_id = ?
    ORDER BY s.started_at DESC
  `).all(req.params.taskId, req.params.teacherId);
  res.json(sessions.map(s => ({
    ...s,
    transcript: JSON.parse(s.transcript || '[]'),
    interests:  JSON.parse(s.interests  || '[]'),
    feedback:   s.feedback ? JSON.parse(s.feedback) : null,
  })));
});

function parseTask(t) {
  return {
    ...t,
    objectives: JSON.parse(t.objectives || '[]'),
    vocabulary: JSON.parse(t.vocabulary || '[]'),
    language_forms: JSON.parse(t.language_forms || '[]'),
  };
}

module.exports = router;
