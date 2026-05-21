import { useEffect, useRef, useState } from 'react';
import { endSession, getFeedback, getHints } from '../api/client';

const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

const PREP_MS = { beginner: 3000, elementary: 2500, intermediate: 2000, 'upper-intermediate': 400, advanced: 400 };
const VAD_THRESHOLD = 18;  // average freq-bin amplitude (0-255) to trigger speech
const SILENCE_MS = 1200;   // ms of quiet after speech before stopping recording

// ── Transcript helpers ────────────────────────────────────────────────
const FUNCTION_WORDS = new Set([
  'a','an','the',
  'i','you','he','she','it','we','they','me','him','her','us','them',
  'my','your','his','its','our','their',
  'this','that','these','those',
  'is','are','was','were','be','been','being','am',
  'have','has','had','do','does','did',
  'will','would','could','should','may','might','shall','can','must',
  'and','but','or','nor','so',
  'at','by','for','from','in','of','on','to','with','as','into',
  'about','if','then','than','just','very','also','too','here','there',
]);

function b2MajorWords(text) {
  const parts = [];
  let ellipsis = false;
  for (const tok of text.split(/\s+/)) {
    const clean = tok.replace(/[^a-zA-Z]/g, '').toLowerCase();
    if (!clean || FUNCTION_WORDS.has(clean)) {
      ellipsis = true;
    } else {
      if (ellipsis) { parts.push('…'); ellipsis = false; }
      parts.push(tok);
    }
  }
  if (ellipsis) parts.push('…');
  return parts.join(' ');
}

function isRepeatRequest(text) {
  const t = text.toLowerCase();
  return /say (that |it )?again/i.test(t)
    || /can you repeat/i.test(t)
    || /could you (say|repeat)/i.test(t)
    || /what did you say/i.test(t)
    || /\bpardon\b/.test(t)
    || /i didn.?t (catch|hear|get that)/i.test(t)
    || /one more time/i.test(t)
    || /repeat that/i.test(t)
    || /what.?s that/i.test(t)
    || /what was that/i.test(t);
}

export default function VoiceChat({ session, onEnd }) {
  const {
    sessionId, task, studentName, speechSpeed = 'normal',
    voiceId, firstMessage, scenario, level = 'intermediate',
  } = session;

  const [status, setStatus] = useState('connecting');
  const [prepCountdown, setPrepCountdown] = useState(0);
  const [transcript, setTranscript] = useState([]);
  const [error, setError] = useState('');
  const [screen, setScreen] = useState('chat');
  const [feedback, setFeedback] = useState(null);
  const [showSuggestion, setShowSuggestion] = useState(false);
  const [showGoal, setShowGoal] = useState(false);
  const [showComplete, setShowComplete] = useState(false);
  const [hints, setHints] = useState([]);
  const [hintsType, setHintsType] = useState(null);
  const [activeHint, setActiveHint] = useState(null);
  const [revealedAgentTurns, setRevealedAgentTurns] = useState(new Set());

  const taskCompleteRef  = useRef(false);
  const messagesRef      = useRef([]);
  const transcriptRef    = useRef([]);
  const currentAudioRef  = useRef(null);  // { pause() } wrapper
  const transcriptEndRef = useRef(null);
  const silenceCountRef  = useRef(0);
  const statusRef        = useRef('connecting');

  // VAD
  const streamRef        = useRef(null);
  const audioCtxRef      = useRef(null);
  const analyserRef      = useRef(null);
  const vadTimerRef      = useRef(null);
  const prepTimerRef     = useRef(null);
  const cdIntervalRef    = useRef(null);
  const recorderRef      = useRef(null);
  const chunksRef        = useRef([]);
  const silenceTimerRef  = useRef(null);
  const noSpeechTimerRef = useRef(null);

  const personaName = task?.persona_name || 'Alex';
  const objectives  = task?.objectives ?? [];

  function setStatusSync(s) {
    statusRef.current = s;
    setStatus(s);
  }

  // ── Mic init ─────────────────────────────────────────────────────────
  async function initMic() {
    if (streamRef.current) return;
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    streamRef.current = stream;
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioCtxRef.current = ctx;
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    analyserRef.current = analyser;
  }

  function stopVAD() {
    clearInterval(vadTimerRef.current);
    clearTimeout(silenceTimerRef.current);
    clearTimeout(prepTimerRef.current);
    clearInterval(cdIntervalRef.current);
    clearTimeout(noSpeechTimerRef.current);
    vadTimerRef.current   = null;
    silenceTimerRef.current = null;
    noSpeechTimerRef.current = null;
  }

  function cleanupAudio() {
    stopVAD();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    analyserRef.current = null;
  }

  // ── Greeting ──────────────────────────────────────────────────────────
  useEffect(() => {
    async function greet() {
      const text = firstMessage || `Hi ${studentName}! I'm ${personaName}. Great to meet you!`;
      messagesRef.current    = [{ role: 'assistant', content: text }];
      transcriptRef.current  = [{ role: 'agent', message: text }];
      setTranscript([{ role: 'agent', message: text }]);
      // Init mic alongside TTS — both need to be close to the user gesture that launched chat
      const micP = initMic().catch(() => null);
      try { await playTTS(text); } catch (_) {}
      await micP;
      startTurnListen();
    }
    greet();
    return () => {
      currentAudioRef.current?.pause();
      cleanupAudio();
    };
  }, []);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript]);

  // ── TTS ──────────────────────────────────────────────────────────────
  async function playTTS(text) {
    setStatusSync('speaking');
    stopVAD();
    const res = await fetch(`${BASE}/tts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice_id: voiceId, speed: speechSpeed }),
    });
    if (!res.ok) throw new Error('TTS failed');
    const blob = await res.blob();
    const url  = URL.createObjectURL(blob);
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      let done = false;
      const finish = () => { if (!done) { done = true; URL.revokeObjectURL(url); resolve(); } };
      // Expose a controlled pause that also resolves the promise (skip)
      currentAudioRef.current = { pause: () => { audio.pause(); finish(); } };
      audio.onended = finish;
      audio.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Audio playback failed')); };
      audio.play().catch(reject);
    });
  }

  // ── VAD turn ─────────────────────────────────────────────────────────
  function startTurnListen() {
    if (taskCompleteRef.current) return;
    stopVAD();
    setShowSuggestion(false);

    const delay = PREP_MS[level] ?? 1500;
    setStatusSync('preparing');

    if (delay >= 1000) {
      const secs = Math.round(delay / 1000);
      setPrepCountdown(secs);
      let rem = secs;
      cdIntervalRef.current = setInterval(() => {
        rem -= 1;
        setPrepCountdown(rem);
        if (rem <= 0) clearInterval(cdIntervalRef.current);
      }, 1000);
    }

    prepTimerRef.current = setTimeout(() => {
      clearInterval(cdIntervalRef.current);
      setPrepCountdown(0);
      beginListening();
    }, delay);
  }

  async function beginListening() {
    setStatusSync('listening');

    if (!analyserRef.current) {
      try { await initMic(); } catch (_) {
        setError('Microphone access denied — please allow mic and try again.');
        return;
      }
    }
    if (audioCtxRef.current?.state === 'suspended') {
      await audioCtxRef.current.resume().catch(() => {});
    }

    const analyser = analyserRef.current;
    const bufLen   = analyser.frequencyBinCount;
    const data     = new Uint8Array(bufLen);

    // Show suggestion prompt if student hasn't spoken after 8 s
    noSpeechTimerRef.current = setTimeout(() => {
      if (statusRef.current === 'listening') setShowSuggestion(true);
    }, 8000);

    vadTimerRef.current = setInterval(() => {
      const st = statusRef.current;
      if (st !== 'listening' && st !== 'recording') { clearInterval(vadTimerRef.current); return; }

      analyser.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < bufLen; i++) sum += data[i];
      const rms = sum / bufLen;

      if (rms > VAD_THRESHOLD && st === 'listening') {
        // Speech start → begin recording
        clearTimeout(noSpeechTimerRef.current);
        chunksRef.current = [];
        const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
        const recorder  = new MediaRecorder(streamRef.current, { mimeType });
        recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
        recorderRef.current = recorder;
        recorder.start(100);
        setStatusSync('recording');
      } else if (st === 'recording' && rms <= VAD_THRESHOLD && !silenceTimerRef.current) {
        // Possible end of speech — debounce
        silenceTimerRef.current = setTimeout(() => {
          silenceTimerRef.current = null;
          if (statusRef.current === 'recording') finishRecording();
        }, SILENCE_MS);
      } else if (st === 'recording' && rms > VAD_THRESHOLD && silenceTimerRef.current) {
        // Speech resumed — cancel silence timer
        clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = null;
      }
    }, 60);
  }

  function finishRecording() {
    clearInterval(vadTimerRef.current);
    vadTimerRef.current = null;
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') { startTurnListen(); return; }
    setStatusSync('processing');
    const mimeType = recorder.mimeType || 'audio/webm';
    recorder.onstop = () => sendRecording(mimeType);
    recorder.stop();
  }

  async function sendRecording(mimeType) {
    setError('');
    setHints([]);
    setHintsType(null);
    setActiveHint(null);
    const blob = new Blob(chunksRef.current, { type: mimeType });

    try {
      const form = new FormData();
      form.append('audio', blob, mimeType.includes('mp4') ? 'recording.mp4' : 'recording.webm');
      (task?.vocabulary ?? []).forEach(v => form.append('keyterms', typeof v === 'object' ? v.word : v));

      const sttRes = await fetch(`${BASE}/stt`, { method: 'POST', body: form });
      if (!sttRes.ok) throw new Error('Transcription failed');
      const { text: userText } = await sttRes.json();

      if (!userText?.trim()) {
        silenceCountRef.current += 1;
        if (silenceCountRef.current >= 2) setShowSuggestion(true);
        startTurnListen();
        return;
      }

      const wordCount = userText.trim().split(/\s+/).length;
      if (wordCount < 4) {
        silenceCountRef.current += 1;
        if (silenceCountRef.current >= 2) setShowSuggestion(true);
      } else {
        silenceCountRef.current = 0;
        setShowSuggestion(false);
      }

      // Reveal full text of last agent turn on repetition request
      if (isRepeatRequest(userText)) {
        for (let j = transcriptRef.current.length - 1; j >= 0; j--) {
          if (transcriptRef.current[j].role === 'agent') {
            setRevealedAgentTurns(prev => new Set([...prev, j]));
            break;
          }
        }
      }

      const userEntry = { role: 'user', message: userText };
      messagesRef.current   = [...messagesRef.current,   { role: 'user',      content: userText }];
      transcriptRef.current = [...transcriptRef.current, userEntry];
      setTranscript(prev => [...prev, userEntry]);

      const chatRes = await fetch(`${BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId, messages: messagesRef.current,
          speech_speed: speechSpeed, silence_count: silenceCountRef.current,
        }),
      });
      if (!chatRes.ok) throw new Error('AI response failed');
      const { text: aiText, task_complete } = await chatRes.json();

      const aiEntry = { role: 'agent', message: aiText };
      messagesRef.current   = [...messagesRef.current,   { role: 'assistant', content: aiText }];
      transcriptRef.current = [...transcriptRef.current, aiEntry];
      setTranscript(prev => [...prev, aiEntry]);

      const [, hintsData] = await Promise.all([
        playTTS(aiText),
        getHints(sessionId, aiText).catch(() => null),
      ]);

      if (hintsData?.hints?.length) {
        setHints(hintsData.hints);
        setHintsType(hintsData.type);
      }

      if (task_complete && !taskCompleteRef.current) {
        taskCompleteRef.current = true;
        setShowComplete(true);
        setTimeout(() => { setShowComplete(false); handleEnd(); }, 1800);
      } else {
        startTurnListen();
      }
    } catch (e) {
      setError(e.message);
      startTurnListen();
    }
  }

  // ── End session ───────────────────────────────────────────────────────
  async function handleEnd() {
    cleanupAudio();
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

  // ── Transcript visibility by level ────────────────────────────────────
  function agentDisplayText(text, index) {
    if (revealedAgentTurns.has(index)) return text;               // one-time full reveal
    if (level === 'advanced')          return null;               // C1-C2: hide
    if (level === 'upper-intermediate') return b2MajorWords(text); // B2: content words only
    if (level === 'intermediate') {                                // B1: first sentence
      const m = text.match(/^[^.!?]*[.!?]/);
      return m ? m[0] : text;
    }
    if (level === 'elementary') {                                  // A2: first two sentences
      const m = text.match(/^(?:[^.!?]*[.!?]){1,2}/);
      return m ? m[0] : text;
    }
    return text;                                                   // A1: full text
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

  if (screen === 'feedback') return (
    <div className="feedback-page">
      <div className="feedback-header">
        <h2>학습 피드백</h2>
        <p className="feedback-student">{studentName}</p>
      </div>
      {feedback?.overall && (
        <div className="feedback-overall">
          <span className="material-symbols-outlined fill feedback-star">star</span>
          <p>{feedback.overall}</p>
        </div>
      )}
      {feedback?.sentences?.length > 0 && (
        <div className="feedback-sentences">
          <h3>내가 한 말</h3>
          {feedback.sentences.map((s, i) => (
            <div key={i} className="feedback-item">
              <div className="feedback-original">
                <span className="feedback-label">내 말</span>
                <p className="feedback-quote">"{s.original}"</p>
              </div>
              {s.what_worked && (
                <div className="feedback-row positive">
                  <span className="material-symbols-outlined fill feedback-icon">check_circle</span>
                  <p>{s.what_worked}</p>
                </div>
              )}
              {s.needs_improvement && (
                <div className="feedback-row improve">
                  <span className="material-symbols-outlined fill feedback-icon">lightbulb</span>
                  <p>{s.needs_improvement}</p>
                </div>
              )}
              {s.corrected && (
                <div className="feedback-corrected">
                  <span className="feedback-label">이렇게 말해보세요</span>
                  <p className="feedback-corrected-text">"{s.corrected}"</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <button className="btn primary feedback-done-btn" onClick={onEnd}>
        <span className="material-symbols-outlined">home</span>
        홈으로
      </button>
    </div>
  );

  // ── Chat screen ───────────────────────────────────────────────────────
  const isPreparing = status === 'preparing';
  const isListening = status === 'listening';
  const isRecording = status === 'recording';
  const isSpeaking  = status === 'speaking';

  return (
    <div className="voice-chat">
      {showComplete && (
        <div className="task-complete-overlay">
          <span className="material-symbols-outlined fill task-complete-icon">task_alt</span>
          <p className="task-complete-label">Task Complete!</p>
        </div>
      )}

      <div className="vc-header">
        <div className="vc-persona">
          <div className="vc-avatar">
            <span className="material-symbols-outlined fill">face</span>
          </div>
          <div>
            <div className="vc-persona-name">{personaName}</div>
            <div className="vc-task-name">{task?.title}</div>
            {objectives.length > 0 && (
              <div className="vc-task-obj">{objectives.slice(0, 2).join(' · ')}</div>
            )}
          </div>
        </div>
        <div className="vc-header-right">
          {scenario?.student_goal && (
            <button className="goal-chip" onClick={() => setShowGoal(v => !v)}>
              <span className="material-symbols-outlined sm">flag</span>
              Goal
            </button>
          )}
          <button className="btn danger sm" onClick={handleEnd}>End</button>
        </div>
      </div>

      {showGoal && scenario && (
        <div className="goal-panel">
          <div className="goal-panel-row">
            <span className="goal-panel-label">Your role</span>
            <span>{scenario.student_role}</span>
          </div>
          <div className="goal-panel-row">
            <span className="goal-panel-label">Situation</span>
            <span>{scenario.situation}</span>
          </div>
          <div className="goal-panel-row">
            <span className="goal-panel-label">Goal</span>
            <span className="goal-panel-goal">{scenario.student_goal}</span>
          </div>
        </div>
      )}

      <div className="vc-transcript">
        {transcript.length === 0 && (
          <p className="vc-waiting">{personaName} will say hello — just wait a moment.</p>
        )}
        {transcript.map((m, i) => {
          if (m.role === 'agent') {
            const display = agentDisplayText(m.message, i);
            if (!display) return null;
            return (
              <div key={i} className="vc-bubble agent">
                <span className="vc-bubble-name">{personaName}</span>
                <p>{display}</p>
              </div>
            );
          }
          return (
            <div key={i} className="vc-bubble user">
              <span className="vc-bubble-name">{studentName}</span>
              <p>{m.message}</p>
            </div>
          );
        })}
        <div ref={transcriptEndRef} />
      </div>

      <div className="vc-controls">
        {hints.length > 0 && (
          <div className="hints-section">
            <span className="hints-label">
              <span className="material-symbols-outlined sm">lightbulb</span>
              {hintsType === 'starters' ? 'Try saying:' : 'Useful words:'}
            </span>
            <div className="hints-chips">
              {hints.map((h, i) => (
                <button
                  key={i}
                  className={`hint-chip ${hintsType} ${activeHint === i ? 'active' : ''}`}
                  onClick={() => setActiveHint(activeHint === i ? null : i)}
                >
                  {h}
                </button>
              ))}
            </div>
            {activeHint !== null && hintsType === 'starters' && (
              <div className="hint-spotlight">{hints[activeHint]}</div>
            )}
          </div>
        )}

        {showSuggestion && (
          <div className="suggestion-bubble">
            <span className="material-symbols-outlined fill">lightbulb</span>
            <div className="suggestion-text">
              <strong>Need a starter?</strong>
              <span>Try: "I think…" · "In my opinion…" · "I'm not sure, but…" · "Can you say that again?"</span>
            </div>
            <button className="suggestion-close" onClick={() => setShowSuggestion(false)}>✕</button>
          </div>
        )}

        {error && <p className="error" style={{ textAlign: 'center', marginBottom: 8 }}>{error}</p>}

        <div
          className={`vad-indicator ${status}`}
          onClick={() => isSpeaking && currentAudioRef.current?.pause()}
          style={{ cursor: isSpeaking ? 'pointer' : 'default' }}
        >
          <div className="vad-circle">
            {isPreparing && prepCountdown > 0 && <span className="vad-countdown">{prepCountdown}</span>}
            {isPreparing && prepCountdown === 0 && (
              <span className="material-symbols-outlined spin" style={{ fontSize: 36 }}>sync</span>
            )}
            {isListening && (
              <span className="material-symbols-outlined fill" style={{ fontSize: 36 }}>mic_none</span>
            )}
            {isRecording && (
              <span className="material-symbols-outlined fill" style={{ fontSize: 36 }}>mic</span>
            )}
            {status === 'processing' && (
              <span className="material-symbols-outlined spin" style={{ fontSize: 36 }}>sync</span>
            )}
            {(isSpeaking || status === 'connecting') && (
              <span className="material-symbols-outlined fill" style={{ fontSize: 36 }}>volume_up</span>
            )}
          </div>
          <span className="vad-label">
            {isPreparing && prepCountdown > 0 ? 'Get ready…'
              : isPreparing                   ? 'Almost ready…'
              : isListening                   ? 'Listening…'
              : isRecording                   ? 'I hear you…'
              : status === 'processing'       ? 'Thinking…'
              : isSpeaking                    ? 'Tap to skip'
              : 'Connecting…'}
          </span>
        </div>
      </div>
    </div>
  );
}
