import apiClient from "./apiClient";

export const getConsent = async () => {
  const response = await apiClient.get("/consent");
  return response.data;
};

export const saveConsent = async (consentPayload) => {
  const response = await apiClient.post("/consent/save", consentPayload);
  return response.data;
};

