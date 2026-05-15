/**
 * reportApi.js
 * All API calls for the WorkReport page.
 * Uses the shared axios apiClient (auto token refresh + auth header).
 */
import apiClient from "./apiClient";

const BASE = "/report"; // apiClient baseURL is http://localhost:5000/api

/**
 * Get today's aggregated work report for the logged-in employee.
 * No empId needed — backend identifies the user from the JWT token.
 * @returns {Promise<Object>}
 */
export const getTodayReportApi = async () => {
  const response = await apiClient.get(`${BASE}/today`);
  return response.data;
};

/**
 * Get attendance summary for the last N months.
 * No empId needed — backend identifies the user from the JWT token.
 * @param {number} months  - default 3
 * @returns {Promise<Object>}
 */
export const getAttendanceSummaryApi = async (months = 3) => {
  const response = await apiClient.get(
    `${BASE}/summary?months=${months}`
  );
  return response.data;
};

/**
 * Get paginated session history.
 * No empId needed — backend identifies the user from the JWT token.
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export const getSessionHistoryApi = async (page = 1, limit = 10) => {
  const response = await apiClient.get(
    `${BASE}/history?page=${page}&limit=${limit}`
  );
  return response.data;
};
