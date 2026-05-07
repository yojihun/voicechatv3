import { useState } from 'react';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentHome from './pages/StudentHome';
import VoiceChat from './pages/VoiceChat';
import './App.css';

export default function App() {
  const [mode, setMode] = useState(null);          // 'teacher' | 'student'
  const [teacher, setTeacher] = useState(null);
  const [chatSession, setChatSession] = useState(null); // { sessionId, signedUrl, task, student }

  if (chatSession) {
    return <VoiceChat session={chatSession} onEnd={() => setChatSession(null)} />;
  }

  if (mode === 'teacher') {
    return <TeacherDashboard teacher={teacher} setTeacher={setTeacher} onBack={() => { setMode(null); setTeacher(null); }} />;
  }

  if (mode === 'student') {
    return <StudentHome onStartChat={setChatSession} onBack={() => setMode(null)} />;
  }

  return (
    <div className="landing">
      <div className="landing-card">
        <div className="landing-logo">
          <span className="material-symbols-outlined fill">record_voice_over</span>
        </div>
        <h1 className="landing-title">VoiceChat EFL</h1>
        <p className="landing-sub">AI-powered English conversation practice</p>
        <div className="landing-actions">
          <button className="landing-btn student" onClick={() => setMode('student')}>
            <span className="material-symbols-outlined">headset_mic</span>
            I'm a Student
          </button>
          <button className="landing-btn teacher" onClick={() => setMode('teacher')}>
            <span className="material-symbols-outlined">school</span>
            I'm a Teacher
          </button>
        </div>
      </div>
    </div>
  );
}
