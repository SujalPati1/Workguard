/**
 * dailyApi.js
 * API wrapper for /api/daily/* endpoints.
 */

const BASE = import.meta.env.VITE_API_URL + "/api/daily";

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
    error.body   = body;
    throw error;
  }

  return body;
};

/** Get today's full DailyActivity record */
export const getDailyTodayApi = (empId) =>
  request(`${BASE}/today/${empId}`);

/** Get liveness schedule (triggerTimes, slot statuses) */
export const getLivenessStatusApi = (empId) =>
  request(`${BASE}/liveness-status/${empId}`);

/** Record a liveness verification (frontend fallback — normally done by Electron) */
export const recordLivenessApi = (payload) =>
  request(`${BASE}/liveness`, {
    method: "POST",
    body:   JSON.stringify(payload),
  });

/** Mark a liveness slot as MISSED (popup timed out) */
export const markLivenessMissedApi = (payload) =>
  request(`${BASE}/liveness/missed`, {
    method: "POST",
    body:   JSON.stringify(payload),
  });

/** Heartbeat — called every 2 min to accumulate platform time */
export const heartbeatApi = (empId) =>
  request(`${BASE}/heartbeat`, {
    method: "POST",
    body:   JSON.stringify({ empId }),
  });

/** Sync session productivity totals into DailyActivity */
export const syncDailyApi = (payload) =>
  request(`${BASE}/sync`, {
    method: "POST",
    body:   JSON.stringify(payload),
  });

/** Push biometric wellness snapshot every 60 s during an active session */
export const wellnessSyncApi = (payload) =>
  fetch(
    `${import.meta.env.VITE_API_URL}/api/telemetry/wellness`,
    {
      method:  "POST",
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(),
      },
      body: JSON.stringify(payload),
    }
  ).then((r) => r.json().catch(() => null));
