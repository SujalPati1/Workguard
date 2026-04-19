/**
 * attendanceApi.js
 * Low-level fetch wrapper for /attendance/* endpoints.
 * Reads the JWT access-token from localStorage and attaches it to every
 * request so the now-protected session routes accept the calls.
 */

const BASE = import.meta.env.VITE_API_URL + "/attendance";

/** Read the stored access token — returns null when not logged in. */
const getAuthHeader = () => {
  const token = localStorage.getItem("wg_accessToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const request = async (url, options = {}) => {
  try {
    const res = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...getAuthHeader(), // ← attach JWT on every request
        ...(options.headers || {}),
      },
      ...options,
    });

    const body = await res.json().catch(() => null);
    if (!res.ok) {
      const error = new Error(body?.message || `API Error: ${res.status}`);
      error.status = res.status;
      error.body = body;
      throw error;
    }

    return body;
  } catch (error) {
    console.error("Attendance API error:", error.message);
    throw error;
  }
};

export const startSessionApi = (payload) =>
  request(`${BASE}/start`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const checkpointApi = (payload) =>
  request(`${BASE}/checkpoint`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const resumeSessionApi = (payload) =>
  request(`${BASE}/resume`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const stopSessionApi = (payload) =>
  request(`${BASE}/stop`, {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getTodayReportApi = (empId) =>
  request(`${BASE}/report/today/${empId}`);

export const getSessionApi = (sessionId) =>
  request(`${BASE}/${sessionId}`);
