import { useState, useEffect } from 'react';
import { teacherLogin, teacherRegister, getTasks, createTask, deleteTask, getTaskSessions, analyzeTaskText } from '../api/client';

export default function TeacherDashboard({ teacher, setTeacher, onBack }) {
  const [view, setView] = useState(teacher ? 'tasks' : 'login');
  const [code, setCode] = useState('');
  const [regName, setRegName] = useState('');
  const [regCode, setRegCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [showNewTask, setShowNewTask] = useState(false);

  useEffect(() => { if (teacher) loadTasks(); }, [teacher]);

  async function loadTasks() {
    const data = await getTasks(teacher.id);
    setTasks(data);
  }

  async function handleLogin(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try { const t = await teacherLogin(code); setTeacher(t); setView('tasks'); }
    catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleRegister(e) {
    e.preventDefault(); setError(''); setLoading(true);
    try {
      await teacherRegister(regName, regCode);
      const t = await teacherLogin(regCode);
      setTeacher(t); setView('tasks');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  async function handleViewSessions(task) {
    setSelectedTask(task);
    const data = await getTaskSessions(teacher.id, task.id);
    setSessions(data);
    setView('sessions');
  }

  async function handleDeleteTask(taskId) {
    if (!confirm('Delete this task?')) return;
    await deleteTask(teacher.id, taskId);
    loadTasks();
  }

  if (view === 'login') return (
    <div className="page-center">
      <button className="back-btn" onClick={onBack}>← Back</button>
      <div className="auth-card">
        <h2>Teacher Login</h2>
        <form onSubmit={handleLogin}>
          <input className="input" placeholder="Your access code" value={code}
            onChange={e => setCode(e.target.value)} autoFocus />
          {error && <p className="error">{error}</p>}
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Signing in…' : 'Enter'}
          </button>
        </form>
        <p className="auth-alt">No code yet? <button className="link-btn" onClick={() => setView('register')}>Register</button></p>
      </div>
    </div>
  );

  if (view === 'register') return (
    <div className="page-center">
      <button className="back-btn" onClick={() => setView('login')}>← Back</button>
      <div className="auth-card">
        <h2>Create Teacher Account</h2>
        <form onSubmit={handleRegister}>
          <input className="input" placeholder="Your name" value={regName} onChange={e => setRegName(e.target.value)} />
          <input className="input" placeholder="Create an access code" value={regCode} onChange={e => setRegCode(e.target.value)} />
          {error && <p className="error">{error}</p>}
          <button className="btn primary" type="submit" disabled={loading}>
            {loading ? 'Creating…' : 'Create'}
          </button>
        </form>
      </div>
    </div>
  );

  if (view === 'sessions') return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={() => setView('tasks')}>← Tasks</button>
        <h2>Sessions — {selectedTask.title}</h2>
      </div>
      {sessions.length === 0 ? (
        <p className="empty-msg">No sessions yet for this task.</p>
      ) : (
        <div className="sessions-list">
          {sessions.map(s => (
            <div key={s.id} className="session-card">
              <div className="session-header">
                <strong>{s.student_name}</strong>
                <span className="badge">{s.level}</span>
                <span className="session-time">{new Date(s.started_at).toLocaleString()}</span>
              </div>
              <div className="transcript">
                {s.transcript.map((m, i) => (
                  <div key={i} className={`transcript-line ${m.role}`}>
                    <span className="t-role">{m.role === 'user' ? s.student_name : 'AI'}</span>
                    <span className="t-text">{m.message}</span>
                  </div>
                ))}
              </div>
              {s.feedback && <SessionFeedback feedback={s.feedback} studentName={s.student_name} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <button className="back-btn" onClick={onBack}>← Home</button>
        <h2>Tasks — {teacher.name}</h2>
        <button className="btn primary sm" onClick={() => setShowNewTask(true)}>+ New Task</button>
      </div>

      {showNewTask && (
        <NewTaskForm teacherId={teacher.id}
          onSave={() => { setShowNewTask(false); loadTasks(); }}
          onCancel={() => setShowNewTask(false)} />
      )}

      <div className="tasks-grid">
        {tasks.map(t => (
          <div key={t.id} className="task-card">
            <div className="task-card-header">
              <h3>{t.title}</h3>
              <button className="icon-btn danger" onClick={() => handleDeleteTask(t.id)}>
                <span className="material-symbols-outlined sm">delete</span>
              </button>
            </div>
            {t.topic && <p className="task-topic">{t.topic}</p>}
            {t.objectives.length > 0 && (
              <ul className="task-objectives">
                {t.objectives.slice(0, 2).map((o, i) => <li key={i}>{o}</li>)}
                {t.objectives.length > 2 && <li>+{t.objectives.length - 2} more</li>}
              </ul>
            )}
            <button className="btn outline sm" onClick={() => handleViewSessions(t)}>
              <span className="material-symbols-outlined sm">manage_search</span>
              View Sessions
            </button>
          </div>
        ))}
        {tasks.length === 0 && !showNewTask && (
          <p className="empty-msg">No tasks yet. Create one to get started.</p>
        )}
      </div>
    </div>
  );
}

function NewTaskForm({ teacherId, onSave, onCancel }) {
  const [form, setForm] = useState({
    title: '', topic: '', objectives: '', vocabulary: '', language_forms: '',
  });
  const [aiText, setAiText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [showAiPanel, setShowAiPanel] = useState(false);
  const [aiError, setAiError] = useState('');

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  async function handleAiGenerate() {
    if (!aiText.trim()) return;
    setAiLoading(true); setAiError('');
    try {
      const result = await analyzeTaskText(aiText);
      setForm(f => ({
        ...f,
        title:          result.title        || f.title,
        topic:          result.topic        || f.topic,
        objectives:     (result.objectives  || []).join('\n'),
        vocabulary:     (result.vocabulary  || []).join('\n'),
        language_forms: (result.language_forms || []).join('\n'),
      }));
      setShowAiPanel(false);
      setAiText('');
    } catch (e) {
      setAiError('AI analysis failed — try again or fill in manually.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    await createTask(teacherId, {
      title:          form.title,
      topic:          form.topic,
      objectives:     form.objectives.split('\n').map(s => s.trim()).filter(Boolean),
      vocabulary:     form.vocabulary.split(/[\n,]+/).map(s => s.trim()).filter(Boolean),
      language_forms: form.language_forms.split('\n').map(s => s.trim()).filter(Boolean),
      persona_name:   'Alex',
      persona_description: '',
    });
    onSave();
  }

  return (
    <form className="new-task-form" onSubmit={handleSubmit}>
      <div className="task-form-header">
        <h3>New Task</h3>
        <button type="button" className="btn outline sm ai-gen-btn"
          onClick={() => setShowAiPanel(v => !v)}>
          <span className="material-symbols-outlined sm">auto_awesome</span>
          Generate from text
        </button>
      </div>

      {showAiPanel && (
        <div className="ai-panel">
          <label className="profile-label">Paste a textbook paragraph or any text</label>
          <textarea className="input" rows={5} value={aiText}
            onChange={e => setAiText(e.target.value)}
            placeholder="Paste any text here — a textbook passage, article, dialogue, or your own notes. AI will extract vocabulary, language forms, and learning objectives." />
          {aiError && <p className="error">{aiError}</p>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn primary sm" onClick={handleAiGenerate} disabled={aiLoading || !aiText.trim()}>
              {aiLoading
                ? <><span className="material-symbols-outlined sm spin">sync</span> Analysing…</>
                : <><span className="material-symbols-outlined sm">auto_awesome</span> Analyse</>}
            </button>
            <button type="button" className="btn outline sm" onClick={() => setShowAiPanel(false)}>Cancel</button>
          </div>
        </div>
      )}

      <div className="form-row">
        <label>Title *<input className="input" value={form.title} onChange={set('title')} required /></label>
        <label>Topic<input className="input" value={form.topic} onChange={set('topic')} placeholder="e.g. Daily routines" /></label>
      </div>

      <label>Learning Objectives <span className="label-hint">(one per line)</span>
        <textarea className="input" rows={3} value={form.objectives} onChange={set('objectives')}
          placeholder={"Students can describe their daily routine\nStudents can ask about someone's job"} />
      </label>

      <label>Vocabulary <span className="label-hint">(words and phrases — comma or line separated)</span>
        <textarea className="input" rows={3} value={form.vocabulary} onChange={set('vocabulary')}
          placeholder={"commute, daily routine, get up early\nwork from home, take a break"} />
      </label>

      <label>Language Forms <span className="label-hint">(grammar patterns to practice, one per line)</span>
        <textarea className="input" rows={3} value={form.language_forms} onChange={set('language_forms')}
          placeholder={"look forward to doing\npast continuous (was/were + V-ing)\nbe + adjective + to-infinitive"} />
      </label>

      <div className="form-actions">
        <button type="button" className="btn outline" onClick={onCancel}>Cancel</button>
        <button type="submit" className="btn primary" disabled={!form.title.trim()}>Save Task</button>
      </div>
    </form>
  );
}

function SessionFeedback({ feedback, studentName }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sf-wrap">
      <button className="sf-toggle" onClick={() => setOpen(v => !v)}>
        <span className="material-symbols-outlined sm">auto_awesome</span>
        AI Feedback
        <span className="material-symbols-outlined sm sf-chevron" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}>expand_more</span>
      </button>
      {open && (
        <div className="sf-body">
          {feedback.overall && (
            <div className="sf-overall">
              <span className="material-symbols-outlined fill sf-star">star</span>
              <p>{feedback.overall}</p>
            </div>
          )}
          {feedback.sentences?.map((s, i) => (
            <div key={i} className="sf-item">
              <p className="sf-original">"{s.original}"</p>
              {s.what_worked && (
                <div className="sf-row positive">
                  <span className="material-symbols-outlined fill sf-icon">check_circle</span>
                  <span>{s.what_worked}</span>
                </div>
              )}
              {s.needs_improvement && (
                <div className="sf-row improve">
                  <span className="material-symbols-outlined fill sf-icon">lightbulb</span>
                  <span>{s.needs_improvement}</span>
                </div>
              )}
              {s.corrected && (
                <p className="sf-corrected">→ "{s.corrected}"</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
