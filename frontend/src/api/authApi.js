import apiClient from "./apiClient";

const API_HOST = "http://localhost:5000";

// Register new user
export const registerEmployee = async (empId, email, password, fullName, department) => {
  const response = await apiClient.post(`${API_HOST}/auth/register`, {
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
  const response = await apiClient.post(`${API_HOST}/auth/login`, {
    email,
    password,
    empId,
  });
  console.log(response.data)
  return response.data;
};

// Refresh access token
export const refreshAccessToken = async (refreshToken) => {
  const response = await apiClient.post(
    `${API_HOST}/auth/refresh`,
    { refreshToken },
    {
      headers: {
        Authorization: undefined, // Don't include old token
      },
    }
  );
  return response.data;
};

// Logout user
export const logoutEmployee = async (accessToken) => {
  const response = await apiClient.post(
    `${API_HOST}/auth/logout`,
    {},
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  return response.data;
};

// Get current user
export const getCurrentUser = async (accessToken) => {
  const response = await apiClient.get(
    `${API_HOST}/auth/me`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );
  return response.data;
};

