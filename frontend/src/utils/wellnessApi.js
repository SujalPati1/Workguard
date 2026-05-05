/**
 * wellnessApi.js
 * API wrapper for /api/wellness/* endpoints.
 * All wellness data is strictly employee-facing.
 */

const BASE = `${import.meta.env.VITE_API_URL}/api/wellness`;

const getAuthHeader = () => {
  const token = localStorage.getItem("wg_accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const request = async (url, options = {}) => {
  const res = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
      ...getAuthHeader(),
      ...(options.headers || {}),
    },
    ...options,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const error = new Error(body?.message || `API Error: ${res.status}`);
    error.status = res.status;
    throw error;
  }
  return body;
};

/**
 * Log a single biometric event.
 * @param {{ empId, sessionId, eventType, currentScore }} payload
 * Returns: { success, newScore, pointsDelta }
 */
export const logWellnessEventApi = (payload) =>
  request(`${BASE}/event`, {
    method: "POST",
    body:   JSON.stringify(payload),
  });

/**
 * Persist the final wellness score when a session ends.
 * @param {{ sessionId, finalScore }} payload
 */
export const finalizeWellnessApi = (payload) =>
  request(`${BASE}/session/finalize`, {
    method: "POST",
    body:   JSON.stringify(payload),
  });

/**
 * Fetch the full event timeline for a session (for graph plotting).
 * @param {string} sessionId
 */
export const getSessionWellnessApi = (sessionId) =>
  request(`${BASE}/session/${sessionId}`);

/**
 * List all past sessions with their finalWellnessScore (for session list UI).
 * @param {string} empId
 */
export const getWellnessSessionsApi = (empId) =>
  request(`${BASE}/sessions/${empId}`);
