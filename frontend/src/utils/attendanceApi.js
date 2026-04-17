const BASE = import.meta.env.VITE_API_URL + "/attendance";

const request = async (url, options = {}) => {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      credentials: "include", // important for auth cookies
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
