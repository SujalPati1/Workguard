/**
 * reportApi.js
 * All API calls for the WorkReport page.
 * Uses the shared axios apiClient (auto token refresh + auth header).
 */
import apiClient from "./apiClient";

const BASE = "/report"; // apiClient baseURL is http://localhost:5000/api

/**
 * Get today's aggregated work report for the logged-in employee.
 * @param {string} empId
 * @returns {Promise<Object>}
 */
export const getTodayReportApi = async (empId) => {
  const response = await apiClient.get(`${BASE}/today/${empId}`);
  return response.data;
};

/**
 * Get attendance summary for the last N months.
 * @param {string} empId
 * @param {number} months  - default 3
 * @returns {Promise<Object>}
 */
export const getAttendanceSummaryApi = async (empId, months = 3) => {
  const response = await apiClient.get(
    `${BASE}/summary/${empId}?months=${months}`
  );
  return response.data;
};

/**
 * Get paginated session history.
 * @param {string} empId
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export const getSessionHistoryApi = async (empId, page = 1, limit = 10) => {
  const response = await apiClient.get(
    `${BASE}/history/${empId}?page=${page}&limit=${limit}`
  );
  return response.data;
};
