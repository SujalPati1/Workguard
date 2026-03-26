const BASE = import.meta.env.VITE_API_URL + "/attendance";

const request = async (url, options = {}) => {
  try {
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      credentials: "include", // important for auth cookies
      ...options,
    });

    if (!res.ok) {
      throw new Error(`API Error: ${res.status}`);
    }

    return await res.json();
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
