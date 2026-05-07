const express = require('express');
const { db } = require('../db/database');
const router = express.Router();

router.post('/login', async (req, res) => {
  const { code } = req.body;
  if (!code) return res.status(400).json({ error: 'code required' });
  const result = await db.execute({ sql: 'SELECT * FROM teachers WHERE code = ?', args: [code.trim().toUpperCase()] });
  const teacher = result.rows[0] ?? null;
  if (!teacher) return res.status(401).json({ error: 'Invalid code' });
  res.json(teacher);
});

router.post('/register', async (req, res) => {
  const { name, code } = req.body;
  if (!name || !code) return res.status(400).json({ error: 'name and code required' });
  try {
    const result = await db.execute({ sql: 'INSERT INTO teachers (name, code) VALUES (?, ?)', args: [name, code.trim().toUpperCase()] });
    res.json({ id: Number(result.lastInsertRowid), name, code });
  } catch {
    res.status(409).json({ error: 'Code already in use' });
  }
});

router.get('/:teacherId/tasks', async (req, res) => {
  const result = await db.execute({ sql: 'SELECT * FROM tasks WHERE teacher_id = ? ORDER BY created_at DESC', args: [req.params.teacherId] });
  res.json(result.rows.map(parseTask));
});

router.post('/:teacherId/tasks', async (req, res) => {
  const { title, topic, objectives, vocabulary, language_forms, persona_name, persona_description } = req.body;
  const ins = await db.execute({
    sql: `INSERT INTO tasks (teacher_id, title, topic, objectives, vocabulary, language_forms, persona_name, persona_description)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      req.params.teacherId, title, topic,
      JSON.stringify(objectives || []),
      JSON.stringify(vocabulary || []),
      JSON.stringify(language_forms || []),
      persona_name || 'Alex',
      persona_description || '',
    ],
  });
  const sel = await db.execute({ sql: 'SELECT * FROM tasks WHERE id = ?', args: [Number(ins.lastInsertRowid)] });
  res.status(201).json(parseTask(sel.rows[0]));
});

router.put('/:teacherId/tasks/:taskId', async (req, res) => {
  const { title, topic, objectives, vocabulary, language_forms, persona_name, persona_description, active } = req.body;
  await db.execute({
    sql: `UPDATE tasks SET title=?, topic=?, objectives=?, vocabulary=?, language_forms=?, persona_name=?, persona_description=?, active=?
          WHERE id=? AND teacher_id=?`,
    args: [
      title, topic,
      JSON.stringify(objectives || []),
      JSON.stringify(vocabulary || []),
      JSON.stringify(language_forms || []),
      persona_name, persona_description,
      active ?? 1,
      req.params.taskId, req.params.teacherId,
    ],
  });
  res.json({ ok: true });
});

router.delete('/:teacherId/tasks/:taskId', async (req, res) => {
  await db.execute({ sql: 'DELETE FROM tasks WHERE id=? AND teacher_id=?', args: [req.params.taskId, req.params.teacherId] });
  res.json({ ok: true });
});

router.get('/:teacherId/tasks/:taskId/sessions', async (req, res) => {
  const result = await db.execute({
    sql: `SELECT s.* FROM sessions s
          JOIN tasks t ON t.id = s.task_id
          WHERE s.task_id = ? AND t.teacher_id = ?
          ORDER BY s.started_at DESC`,
    args: [req.params.taskId, req.params.teacherId],
  });
  res.json(result.rows.map(s => ({
    ...s,
    transcript: JSON.parse(s.transcript || '[]'),
    interests:  JSON.parse(s.interests  || '[]'),
    feedback:   s.feedback ? JSON.parse(s.feedback) : null,
  })));
});

function parseTask(t) {
  return {
    ...t,
    objectives:     JSON.parse(t.objectives     || '[]'),
    vocabulary:     JSON.parse(t.vocabulary     || '[]'),
    language_forms: JSON.parse(t.language_forms || '[]'),
  };
}

module.exports = router;
