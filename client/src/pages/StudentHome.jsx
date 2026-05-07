import { useState, useEffect } from 'react';
import { getActiveTasks, startSession } from '../api/client';

const LEVELS = [
  { value: 'beginner',           label: 'Beginner',            cefr: 'A1' },
  { value: 'elementary',         label: 'Elementary',          cefr: 'A2' },
  { value: 'intermediate',       label: 'Intermediate',        cefr: 'B1' },
  { value: 'upper-intermediate', label: 'Upper-Intermediate',  cefr: 'B2' },
  { value: 'advanced',           label: 'Advanced',            cefr: 'C1+' },
];

const VOICES = [
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel',  gender: 'female', accent: 'American',   age: 'warm' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric',    gender: 'male',   accent: 'American',   age: 'friendly' },
  { id: 'pFZP5JQG7iQjIQuC4Bku', name: 'Lily',    gender: 'female', accent: 'British',    age: 'expressive' },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel',  gender: 'male',   accent: 'British',    age: 'authoritative' },
  { id: 'XrExE9yKIg1WjnnlVkGX', name: 'Matilda', gender: 'female', accent: 'Australian', age: 'warm' },
  { id: 'ZQe5CZNOzWyzPSCn5a3c', name: 'James',   gender: 'male',   accent: 'Australian', age: 'calm' },
];

const STYLES = [
  { value: 'visual',      label: 'Visual',       icon: 'visibility',     desc: 'I learn from descriptions and imagery' },
  { value: 'auditory',    label: 'Auditory',      icon: 'hearing',        desc: 'I learn by listening and talking' },
  { value: 'reading',     label: 'Reading',       icon: 'menu_book',      desc: 'I learn by reading and writing' },
  { value: 'kinesthetic', label: 'Kinesthetic',   icon: 'sports_handball',desc: 'I learn through examples and experience' },
];

export default function StudentHome({ onStartChat, onBack }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [tasks, setTasks] = useState([]);
  const [selectedTask, setSelectedTask] = useState(null);
  const [levelIdx, setLevelIdx] = useState(2); // default: Intermediate
  const [voiceId, setVoiceId] = useState(VOICES[0].id);
  const [speechSpeed, setSpeechSpeed] = useState(0.9);
  const [interests, setInterests] = useState('');
  const [learningStyle, setLearningStyle] = useState('auditory');
  const [error, setError] = useState('');

  const level = LEVELS[levelIdx].value;

  useEffect(() => {
    getActiveTasks().then(setTasks).catch(() => {});
  }, []);

  useEffect(() => {
    setSpeechSpeed(levelIdx <= 1 ? 0.75 : 0.9);
  }, [levelIdx]);

  async function handleStart() {
    setStep(4);
    setError('');
    try {
      const { session_id, first_message } = await startSession({
        task_id: selectedTask.id,
        student_name: name,
        level,
        interests: interests.split(',').map(s => s.trim()).filter(Boolean),
        learning_style: learningStyle,
      });
      onStartChat({
        sessionId: session_id, firstMessage: first_message,
        task: selectedTask, studentName: name, speechSpeed, voiceId,
      });
    } catch (e) {
      setError(e.message);
      setStep(3);
    }
  }

  if (step === 4) return (
    <div className="page-center">
      <div className="loading-state">
        <span className="material-symbols-outlined spin" style={{ fontSize: 48, color: 'var(--primary)' }}>sync</span>
        <p>Setting up your conversation…</p>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );

  return (
    <div className="page-center">
      <button className="back-btn" onClick={step === 1 ? onBack : () => setStep(s => s - 1)}>← Back</button>

      <div className="student-card">
        {step === 1 && (
          <>
            <h2>What's your name?</h2>
            <input className="input lg" autoFocus placeholder="Your name"
              value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && name.trim() && setStep(2)} />
            <button className="btn primary" disabled={!name.trim()} onClick={() => setStep(2)}>
              Continue →
            </button>
          </>
        )}

        {step === 2 && (
          <>
            <h2>Choose a task, {name}</h2>
            <p className="step-sub">Your teacher has set up these conversation tasks</p>
            <div className="task-picker">
              {tasks.length === 0 && <p className="empty-msg">No tasks available yet.</p>}
              {tasks.map(t => (
                <button key={t.id}
                  className={`task-option ${selectedTask?.id === t.id ? 'selected' : ''}`}
                  onClick={() => setSelectedTask(t)}
                >
                  <div className="task-option-title">{t.title}</div>
                  {t.topic && <div className="task-option-topic">{t.topic}</div>}
                  <div className="task-option-teacher">by {t.teacher_name}</div>
                </button>
              ))}
            </div>
            <button className="btn primary" disabled={!selectedTask} onClick={() => setStep(3)}>
              Continue →
            </button>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Tell us about yourself</h2>
            <p className="step-sub">This helps personalise the conversation for you</p>

            <div className="profile-section">
              <label className="profile-label">Your English Level</label>
              <div className="level-slider-wrap">
                <input
                  type="range" min={0} max={4} step={1} value={levelIdx}
                  onChange={e => setLevelIdx(Number(e.target.value))}
                  className="level-slider"
                />
                <div className="level-track">
                  {LEVELS.map((l, i) => (
                    <span key={i} className={`level-tick ${i === levelIdx ? 'active' : ''}`}>{l.cefr}</span>
                  ))}
                </div>
                <div className="level-badge">
                  <strong>{LEVELS[levelIdx].label}</strong>
                  <span className="level-cefr-tag">{LEVELS[levelIdx].cefr}</span>
                </div>
              </div>
            </div>

            <div className="profile-section">
              <label className="profile-label">Choose an AI Voice</label>
              <div className="voice-grid">
                {VOICES.map(v => (
                  <button key={v.id}
                    className={`voice-card ${voiceId === v.id ? 'active' : ''}`}
                    onClick={() => setVoiceId(v.id)}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 24, flexShrink: 0 }}>
                      {v.gender === 'female' ? 'face_3' : 'face'}
                    </span>
                    <div className="voice-card-info">
                      <span className="voice-name">{v.name}</span>
                      <span className="voice-meta">{v.accent} · {v.age}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="profile-section">
              <label className="profile-label">
                AI Speaking Speed
                <span className="speed-pct-badge">{Math.round(speechSpeed * 100)}%</span>
              </label>
              <div className="level-slider-wrap">
                <input
                  type="range" min={0.7} max={1.0} step={0.025} value={speechSpeed}
                  onChange={e => setSpeechSpeed(Number(e.target.value))}
                  className="level-slider"
                  style={{ '--val': `${((speechSpeed - 0.7) / 0.3) * 100}%` }}
                />
                <div className="level-track">
                  <span className={`level-tick ${speechSpeed <= 0.79 ? 'active' : ''}`}>Slow</span>
                  <span className={`level-tick ${speechSpeed >= 0.84 && speechSpeed <= 0.96 ? 'active' : ''}`}>Normal</span>
                  <span className={`level-tick ${speechSpeed >= 0.97 ? 'active' : ''}`}>Fast</span>
                </div>
              </div>
            </div>

            <div className="profile-section">
              <label className="profile-label">Your Interests <span className="label-hint">(optional)</span></label>
              <input className="input" placeholder="e.g. music, sports, technology, travel"
                value={interests} onChange={e => setInterests(e.target.value)} />
            </div>

            <div className="profile-section">
              <label className="profile-label">How do you learn best?</label>
              <div className="style-grid">
                {STYLES.map(s => (
                  <button key={s.value}
                    className={`style-card ${learningStyle === s.value ? 'active' : ''}`}
                    onClick={() => setLearningStyle(s.value)}
                  >
                    <span className="material-symbols-outlined">{s.icon}</span>
                    <span className="style-label">{s.label}</span>
                    <span className="style-desc">{s.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {error && <p className="error">{error}</p>}
            <button className="btn primary" onClick={handleStart}>
              <span className="material-symbols-outlined">mic</span>
              Start Conversation
            </button>
          </>
        )}
      </div>
    </div>
  );
}
