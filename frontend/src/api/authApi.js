/**
 * authApi.js
 * Auth calls target /auth/... which is mounted at the express root (NOT /api).
 * We use plain axios here — NOT the shared apiClient — so the /api baseURL
 * and the token-refresh interceptors don't interfere.
 */
import axios from "axios";

// Auth routes live at root level: http://localhost:5000/auth/...
const authAxios = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000",
});

// Register new user
export const registerEmployee = async (empId, email, password, fullName, department) => {
  const response = await authAxios.post("/auth/register", {
    empId,
    email,
    password,
    fullName,
    department,
  });
  return response.data;
};

// Login user
export const loginEmployee = async (email, password, empId) => {
  const response = await authAxios.post("/auth/login", {
    email,
    password,
    empId,
  });
  return response.data;
};

// Refresh access token — intentionally uses no Authorization header
// so an expired access token does NOT interfere with the refresh call.
export const refreshAccessToken = async (refreshToken) => {
  const response = await authAxios.post("/auth/refresh", { refreshToken });
  return response.data;
};

// Logout user
export const logoutEmployee = async (accessToken) => {
  const response = await authAxios.post(
    "/auth/logout",
    {},
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.data;
};

// Get current user info
export const getCurrentUser = async (accessToken) => {
  const response = await authAxios.get(
    "/auth/me",
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  return response.data;
};
