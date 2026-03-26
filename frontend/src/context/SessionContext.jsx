import React, { createContext, useContext, useState, useCallback, useEffect } from "react";
import { refreshAccessToken, getCurrentUser, logoutEmployee } from "../api/authApi";

const SessionContext = createContext(null);

export const SessionProvider = ({ children }) => {
  const [employee, setEmployee] = useState(() => {
    try {
      const saved = localStorage.getItem("wg_employee");
      return saved ? JSON.parse(saved) : null;
    } catch (err) {
      console.error("Error loading employee from storage:", err);
      return null;
    }
  });

  const [accessToken, setAccessToken] = useState(() => {
    return localStorage.getItem("wg_accessToken") || null;
  });

  const [refreshToken, setRefreshToken] = useState(() => {
    return localStorage.getItem("wg_refreshToken") || null;
  });

  const [isLoading, setIsLoading] = useState(false);

  // Login - store tokens and employee data
  const login = useCallback((empData, accessTok, refreshTok) => {
    setEmployee(empData);
    setAccessToken(accessTok);
    setRefreshToken(refreshTok);

    // Persist to localStorage
    localStorage.setItem("wg_employee", JSON.stringify(empData));
    localStorage.setItem("wg_accessToken", accessTok);
    localStorage.setItem("wg_refreshToken", refreshTok);
  }, []);

  // Logout - clear all tokens and employee data
  const logout = useCallback(async () => {
    if (accessToken) {
      try {
        await logoutEmployee(accessToken);
      } catch (err) {
        console.warn("Logout API call failed, proceeding to clear local session", err);
      }
    }

    setEmployee(null);
    setAccessToken(null);
    setRefreshToken(null);

    // Clear from localStorage
    localStorage.removeItem("wg_employee");
    localStorage.removeItem("wg_accessToken");
    localStorage.removeItem("wg_refreshToken");
  }, [accessToken]);

  // Refresh access token
  const refreshAccessTokenFn = useCallback(async () => {
    if (!refreshToken) {
      logout();
      return false;
    }

    try {
      setIsLoading(true);
      const result = await refreshAccessToken(refreshToken);

      if (result.success) {
        setAccessToken(result.accessToken);
        setRefreshToken(result.refreshToken);

        localStorage.setItem("wg_accessToken", result.accessToken);
        localStorage.setItem("wg_refreshToken", result.refreshToken);

        return true;
      } else {
        logout();
        return false;
      }
    } catch (err) {
      console.error("Token refresh failed:", err);
      logout();
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [refreshToken, logout]);

  // Check and restore session on app load
  useEffect(() => {
    const checkSession = async () => {
      const storedAccessToken = localStorage.getItem("wg_accessToken");
      const storedRefreshToken = localStorage.getItem("wg_refreshToken");
      const storedEmployee = localStorage.getItem("wg_employee");

      if (storedEmployee && storedAccessToken && storedRefreshToken) {
        setEmployee(JSON.parse(storedEmployee));
        setAccessToken(storedAccessToken);
        setRefreshToken(storedRefreshToken);

        try {
          const me = await getCurrentUser(storedAccessToken);
          if (me.success && me.employee) {
            setEmployee(me.employee);
            localStorage.setItem("wg_employee", JSON.stringify(me.employee));
          } else {
            const refreshed = await refreshAccessTokenFn();
            if (refreshed) {
              const me2 = await getCurrentUser(localStorage.getItem("wg_accessToken"));
              if (me2.success && me2.employee) {
                setEmployee(me2.employee);
                localStorage.setItem("wg_employee", JSON.stringify(me2.employee));
              }
            } else {
              await logout();
            }
          }
        } catch (err) {
          console.warn("Session restore failed, trying refresh:", err);
          const refreshed = await refreshAccessTokenFn();
          if (refreshed) {
            try {
              const me2 = await getCurrentUser(localStorage.getItem("wg_accessToken"));
              if (me2.success && me2.employee) {
                setEmployee(me2.employee);
                localStorage.setItem("wg_employee", JSON.stringify(me2.employee));
              }
            } catch (err2) {
              console.error("Failed to load user after refresh", err2);
              await logout();
            }
          } else {
            await logout();
          }
        }
      }
    };

    checkSession();
  }, [logout, refreshAccessTokenFn]);

  return (
    <SessionContext.Provider
      value={{
        employee,
        accessToken,
        refreshToken,
        isLoading,
        login,
        logout,
        refreshAccessToken: refreshAccessTokenFn,
        isAuthenticated: !!employee && !!accessToken,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error("useSession must be used within SessionProvider");
  }
  return context;
};

