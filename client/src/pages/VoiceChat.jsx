import { useEffect, useRef, useState } from 'react';
import { endSession, getFeedback } from '../api/client';

const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

export default function VoiceChat({ session, onEnd }) {
  const { sessionId, task, studentName, speechSpeed = 'normal', voiceId, firstMessage } = session;

  const [status, setStatus] = useState('connecting');  // connecting|idle|recording|processing|speaking
  const [transcript, setTranscript] = useState([]);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState('chat');         // chat|loading|feedback
  const [feedback, setFeedback] = useState(null);
  const [lang, setLang] = useState('en');

  const messagesRef = useRef([]);    // [{role:'user'|'assistant', content}]
  const transcriptRef = useRef([]);  // [{role:'user'|'agent', message}]
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const currentAudioRef = useRef(null);
  const transcriptEndRef = useRef(null);

  const personaName = task?.persona_name || 'Alex';

  // AI speaks first
  useEffect(() => {
    async function greet() {
      const text = firstMessage || `Hi ${studentName}! I'm ${personaName}. Great to meet you!`;
      const aiEntry = { role: 'agent', message: text };
      messagesRef.current = [{ role: 'assistant', content: text }];
      transcriptRef.current = [aiEntry];
      setTranscript([aiEntry]);
      try { await playTTS(text); } catch (_) {}
      setStatus('idle');
    }
    greet();
    return () => currentAudioRef.current?.pause();
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // ── TTS ──────────────────────────────────────────────────────────────
  async function playTTS(text) {
    setStatus('speaking');
    const res = await fetch(`${BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_id: voiceId, speed: speechSpeed }),
    });
    if (!res.ok) throw new Error('TTS failed');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.onended = () => { URL.revokeObjectURL(url); resolve(); };
      audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Audio playback failed')); };
      audio.play().catch(reject);
    });
  }

  // ── Recording ────────────────────────────────────────────────────────
  async function startRecording() {
    if (status !== 'idle') return;
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = e => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorderRef.current = recorder;
      recorder.start(100);
      setStatus('recording');
    } catch (_) {
      setError('Microphone access denied — please allow mic and try again.');
    }
  }

  async function stopRecording() {
    if (status !== 'recording') return;
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;

    await new Promise(resolve => {
      recorder.onstop = resolve;
      recorder.stop();
      recorder.stream.getTracks().forEach(t => t.stop());
    });

    setStatus('processing');
    const mimeType = recorder.mimeType || 'audio/webm';
    const blob = new Blob(audioChunksRef.current, { type: mimeType });

    try {
      const form = new FormData();
      form.append('audio', blob, mimeType.includes('mp4') ? 'recording.mp4' : 'recording.webm');
      const vocab = task?.vocabulary ?? [];
      vocab.forEach(v => form.append('keyterms', typeof v === 'object' ? v.word : v));

      const sttRes = await fetch(`${BASE}/stt`, { method: 'POST', body: form });
      if (!sttRes.ok) throw new Error('Transcription failed');
      const { text: userText } = await sttRes.json();

      if (!userText?.trim()) { setStatus('idle'); return; }

      const userEntry = { role: 'user', message: userText };
      messagesRef.current = [...messagesRef.current, { role: 'user', content: userText }];
      transcriptRef.current = [...transcriptRef.current, userEntry];
      setTranscript(prev => [...prev, userEntry]);

      const chatRes = await fetch(`${BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, messages: messagesRef.current, speech_speed: speechSpeed }),
      });
      if (!chatRes.ok) throw new Error('AI response failed');
      const { text: aiText } = await chatRes.json();

      const aiEntry = { role: 'agent', message: aiText };
      messagesRef.current = [...messagesRef.current, { role: 'assistant', content: aiText }];
      transcriptRef.current = [...transcriptRef.current, aiEntry];
      setTranscript(prev => [...prev, aiEntry]);

      await playTTS(aiText);
      setStatus('idle');
    } catch (e) {
      setError(e.message);
      setStatus('idle');
    }
  }

  // ── End session ───────────────────────────────────────────────────────
  async function handleEnd() {
    currentAudioRef.current?.pause();
    await endSession(sessionId, { transcript: transcriptRef.current, conversation_id: null });

    const userCount = transcriptRef.current.filter(m => m.role === 'user').length;
    if (userCount === 0) { onEnd(); return; }

    setScreen('loading');
    try {
      const data = await getFeedback(sessionId);
      setFeedback(data);
      setScreen('feedback');
    } catch (_) { onEnd(); }
  }

  // ── Feedback screen ───────────────────────────────────────────────────
  if (screen === 'loading') return (
    <div className="page-center">
      <div className="loading-state">
        <span className="material-symbols-outlined spin" style={{ fontSize: 48, color: 'var(--primary)' }}>auto_awesome</span>
        <p>Preparing your feedback…</p>
      </div>
    </div>
  );

  if (screen === 'feedback') {
    const hasKorean = !!feedback?.overall_ko;
    const ko = lang === 'ko' && hasKorean;
    return (
      <div className="feedback-page">
        <div className="feedback-header">
          <h2>Session Feedback</h2>
          <p className="feedback-student">Great work, {studentName}!</p>
          {hasKorean && (
            <div className="feedback-lang-toggle">
              <button className={`chip ${!ko ? 'active' : ''}`} onClick={() => setLang('en')}>English</button>
              <button className={`chip ${ko ? 'active' : ''}`} onClick={() => setLang('ko')}>한국어</button>
            </div>
          )}
        </div>

        {feedback?.overall && (
          <div className="feedback-overall">
            <span className="material-symbols-outlined fill feedback-star">star</span>
            <p>{ko ? feedback.overall_ko : feedback.overall}</p>
          </div>
        )}

        {feedback?.sentences?.length > 0 && (
          <div className="feedback-sentences">
            <h3>{ko ? '내가 한 말' : 'What you said'}</h3>
            {feedback.sentences.map((s, i) => (
              <div key={i} className="feedback-item">
                <div className="feedback-original">
                  <span className="feedback-label">{ko ? '내 말' : 'You said'}</span>
                  <p className="feedback-quote">"{s.original}"</p>
                </div>
                {s.what_worked && (
                  <div className="feedback-row positive">
                    <span className="material-symbols-outlined fill feedback-icon">check_circle</span>
                    <p>{ko && s.what_worked_ko ? s.what_worked_ko : s.what_worked}</p>
                  </div>
                )}
                {s.needs_improvement && (
                  <div className="feedback-row improve">
                    <span className="material-symbols-outlined fill feedback-icon">lightbulb</span>
                    <p>{ko && s.needs_improvement_ko ? s.needs_improvement_ko : s.needs_improvement}</p>
                  </div>
                )}
                {s.corrected && (
                  <div className="feedback-corrected">
                    <span className="feedback-label">{ko ? '이렇게 말해보세요' : 'Try saying'}</span>
                    <p className="feedback-corrected-text">"{s.corrected}"</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <button className="btn primary feedback-done-btn" onClick={onEnd}>
          <span className="material-symbols-outlined">home</span>
          {ko ? '홈으로' : 'Back to Home'}
        </button>
      </div>
    );
  }

  // ── Chat screen ───────────────────────────────────────────────────────
  const isRecording = status === 'recording';
  const isBusy = status === 'processing' || status === 'speaking' || status === 'connecting';

  return (
    <div className="voice-chat">
      <div className="vc-header">
        <div className="vc-persona">
          <div className="vc-avatar">
            <span className="material-symbols-outlined fill">face</span>
          </div>
          <div>
            <div className="vc-persona-name">{personaName}</div>
            <div className="vc-task-name">{task?.title}</div>
          </div>
        </div>
        <button className="btn danger sm" onClick={handleEnd}>End Chat</button>
      </div>

      <div className="vc-transcript">
        {transcript.length === 0 && (
          <p className="vc-waiting">{personaName} will say hello — just wait a moment.</p>
        )}
        {transcript.map((m, i) => (
          <div key={i} className={`vc-bubble ${m.role === 'user' ? 'user' : 'agent'}`}>
            <span className="vc-bubble-name">{m.role === 'user' ? studentName : personaName}</span>
            <p>{m.message}</p>
          </div>
        ))}
        <div ref={transcriptEndRef} />
      </div>

      <div className="vc-controls">
        {error && <p className="error" style={{ textAlign: 'center', marginBottom: 8 }}>{error}</p>}
        <button
          className={`ptt-btn ${isRecording ? 'recording' : ''} ${isBusy ? 'busy' : ''}`}
          onPointerDown={startRecording}
          onPointerUp={stopRecording}
          onPointerLeave={stopRecording}
          disabled={isBusy}
        >
          <span className="material-symbols-outlined fill ptt-icon">
            {isRecording ? 'mic' : isBusy ? 'hourglass_empty' : 'mic_none'}
          </span>
          <span className="ptt-label">
            {isRecording ? 'Release to send'
              : status === 'processing' ? 'Thinking…'
              : status === 'speaking'   ? 'Speaking…'
              : status === 'connecting' ? 'Connecting…'
              : 'Hold to speak'}
          </span>
        </button>
      </div>
    </div>
  );
}
