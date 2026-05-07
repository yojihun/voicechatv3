const BASE = (import.meta.env.VITE_API_URL || '') + '/api';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || res.statusText);
  }
  return res.json();
}

export const teacherLogin = (code) => request('/teachers/login', { method: 'POST', body: { code } });
export const teacherRegister = (name, code) => request('/teachers/register', { method: 'POST', body: { name, code } });
export const getTasks = (teacherId) => request(`/teachers/${teacherId}/tasks`);
export const createTask = (teacherId, task) => request(`/teachers/${teacherId}/tasks`, { method: 'POST', body: task });
export const updateTask = (teacherId, taskId, task) => request(`/teachers/${teacherId}/tasks/${taskId}`, { method: 'PUT', body: task });
export const deleteTask = (teacherId, taskId) => request(`/teachers/${teacherId}/tasks/${taskId}`, { method: 'DELETE' });
export const getTaskSessions = (teacherId, taskId) => request(`/teachers/${teacherId}/tasks/${taskId}/sessions`);

export const getActiveTasks = () => request('/tasks');
export const startSession = (body) => request('/start', { method: 'POST', body });
export const endSession = (sessionId, body) => request(`/${sessionId}/end`, { method: 'POST', body });

export const analyzeTaskText = (text) => request('/tasks/analyze', { method: 'POST', body: { text } });
export const getFeedback = (sessionId) => request(`/feedback/${sessionId}`, { method: 'POST' });
