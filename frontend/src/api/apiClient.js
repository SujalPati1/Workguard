import axios from "axios";

const apiClient = axios.create({
  baseURL: "http://localhost:5000/api",
  headers: {
    "Content-Type": "application/json",
  },
});

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach((prom) => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });

  isRefreshing = false;
  failedQueue = [];
};

// Request interceptor: Add access token to headers
apiClient.interceptors.request.use(
  (config) => {
    const accessToken = localStorage.getItem("wg_accessToken");
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor: Handle token refresh
apiClient.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    if (
      error.response?.status === 401 &&
      !originalRequest._retry
    ) {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then((token) => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return apiClient(originalRequest);
          })
          .catch((err) => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = localStorage.getItem("wg_refreshToken");

        if (!refreshToken) {
          throw new Error("No refresh token available");
        }

        const response = await axios.post(
          "http://localhost:5000/auth/refresh",
          { refreshToken }
        );

        const { accessToken, refreshToken: newRefreshToken } = response.data;

        localStorage.setItem("wg_accessToken", accessToken);
        localStorage.setItem("wg_refreshToken", newRefreshToken);

        apiClient.defaults.headers.common.Authorization =
          `Bearer ${accessToken}`;
        originalRequest.headers.Authorization = `Bearer ${accessToken}`;

        processQueue(null, accessToken);

        return apiClient(originalRequest);
      } catch (err) {
        processQueue(err, null);

        // Clear session and redirect to login
        localStorage.removeItem("wg_accessToken");
        localStorage.removeItem("wg_refreshToken");
        localStorage.removeItem("wg_employee");

        window.location.href = "/login";

        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;

