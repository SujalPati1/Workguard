import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { refreshAccessToken, getCurrentUser, logoutEmployee } from "../api/authApi";
import { checkpointApi } from "../utils/attendanceApi";

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

  // ===== WORK SESSION STATE =====
  // Load from localStorage to persist across page navigation
  const [workSessionState, setWorkSessionState] = useState(() => {
    try {
      const saved = localStorage.getItem("wg_workSession");
      return saved ? JSON.parse(saved) : {
        running: false,
        sessionId: null,
        activeSec: 0,
        idleSec: 0,
        waitingSec: 0,
        breakSec: 0,
        focusMode: false,
        workStatus: "WORKING",
        startTime: null,
      };
    } catch (err) {
      console.error("Error loading work session from storage:", err);
      return {
        running: false,
        sessionId: null,
        activeSec: 0,
        idleSec: 0,
        waitingSec: 0,
        breakSec: 0,
        focusMode: false,
        workStatus: "WORKING",
        startTime: null,
      };
    }
  });

  // ===== PERSIST WORK SESSION TO LOCALSTORAGE =====
  useEffect(() => {
    localStorage.setItem("wg_workSession", JSON.stringify(workSessionState));
  }, [workSessionState]);

  // ===== GLOBAL ACTIVITY TRACKING =====
  // Stored in a ref so the timer closure always reads the latest value
  // without needing to be in its dependency array.
  const lastActivityRef = useRef(Date.now());

  useEffect(() => {
    const touch = () => { lastActivityRef.current = Date.now(); };
    window.addEventListener("mousemove", touch);
    window.addEventListener("keydown",   touch);
    window.addEventListener("click",     touch);
    window.addEventListener("scroll",    touch);
    return () => {
      window.removeEventListener("mousemove", touch);
      window.removeEventListener("keydown",   touch);
      window.removeEventListener("click",     touch);
      window.removeEventListener("scroll",    touch);
    };
  }, []);

  // ===== WORK SESSION METHODS =====
  const updateWorkSession = useCallback((updates) => {
    setWorkSessionState((prev) => ({
      ...prev,
      ...updates,
    }));
  }, []);

  const startWorkSession = useCallback((sessionId, focusMode = false) => {
    updateWorkSession({
      running: true,
      sessionId,
      focusMode,
      startTime: Date.now(),
      activeSec: 0,
      idleSec: 0,
      waitingSec: 0,
      breakSec: 0,
      workStatus: "WORKING",
    });
  }, [updateWorkSession]);

  const pauseWorkSession = useCallback(() => {
    updateWorkSession({ running: false });
  }, [updateWorkSession]);

  const resumeWorkSession = useCallback(() => {
    updateWorkSession({ running: true });
  }, [updateWorkSession]);

  const stopWorkSession = useCallback(() => {
    updateWorkSession({
      running: false,
      sessionId: null,
      activeSec: 0,
      idleSec: 0,
      waitingSec: 0,
      breakSec: 0,
      focusMode: false,
      workStatus: "WORKING",
      startTime: null,
    });
  }, [updateWorkSession]);

  const incrementActiveTime = useCallback(() => {
    setWorkSessionState((prev) => ({
      ...prev,
      activeSec: prev.activeSec + 1,
    }));
  }, []);

  const incrementIdleTime = useCallback(() => {
    setWorkSessionState((prev) => ({
      ...prev,
      idleSec: prev.idleSec + 1,
    }));
  }, []);

  const incrementWaitingTime = useCallback(() => {
    setWorkSessionState((prev) => ({
      ...prev,
      waitingSec: prev.waitingSec + 1,
    }));  
  }, []);

  const incrementBreakTime = useCallback(() => {
    setWorkSessionState((prev) => ({
      ...prev,
      breakSec: prev.breakSec + 1,
    }));
  }, []);

  const setWorkStatus = useCallback((status) => {
    updateWorkSession({ workStatus: status });
  }, [updateWorkSession]);

  // ===== GLOBAL TIMER ENGINE =====
  // Lives in the context — survives page navigation, tab switches, and
  // anything short of a full page reload or explicit session stop.
  useEffect(() => {
    if (!workSessionState.running) return;

    const idleThreshold = workSessionState.focusMode ? 30 * 60 : 10 * 60; // seconds

    const tick = setInterval(() => {
      const idleNow = (Date.now() - lastActivityRef.current) / 1000;
      const status  = workSessionState.workStatus;

      if (status === "WAITING") {
        setWorkSessionState(prev => ({ ...prev, waitingSec: prev.waitingSec + 1 }));
      } else if (status === "BREAK") {
        setWorkSessionState(prev => ({ ...prev, breakSec: prev.breakSec + 1 }));
      } else if (idleNow > idleThreshold) {
        setWorkSessionState(prev => ({ ...prev, idleSec: prev.idleSec + 1 }));
      } else {
        setWorkSessionState(prev => ({ ...prev, activeSec: prev.activeSec + 1 }));
      }
    }, 1000);

    return () => clearInterval(tick);
  // Re-create the interval only when the session starts/stops or focus-mode changes.
  // workStatus and seconds are read from state snapshots inside the closure.
  }, [workSessionState.running, workSessionState.focusMode, workSessionState.workStatus]);

  // ===== GLOBAL AUTO-CHECKPOINT (every 30 s) =====
  // Also lives in the context so checkpoints keep firing on every page.
  useEffect(() => {
    if (!workSessionState.running || !workSessionState.sessionId) return;

    const save = setInterval(async () => {
      try {
        await checkpointApi({
          sessionId:      workSessionState.sessionId,
          activeSeconds:  workSessionState.activeSec,
          idleSeconds:    workSessionState.idleSec,
          waitingSeconds: workSessionState.waitingSec,
          breakSeconds:   workSessionState.breakSec,
          workStatus:     workSessionState.workStatus,
        });
      } catch (err) {
        console.error("[Context] Checkpoint error:", err);
      }
    }, 30000);

    return () => clearInterval(save);
  }, [workSessionState.running, workSessionState.sessionId]);

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

  // Logout - clear all tokens, employee data, and work session
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

    // Clear work session
    setWorkSessionState({
      running: false,
      sessionId: null,
      activeSec: 0,
      idleSec: 0,
      waitingSec: 0,
      breakSec: 0,
      focusMode: false,
      workStatus: "WORKING",
      startTime: null,
    });

    // Clear from localStorage
    localStorage.removeItem("wg_employee");
    localStorage.removeItem("wg_accessToken");
    localStorage.removeItem("wg_refreshToken");
    localStorage.removeItem("wg_workSession");
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
        // Auth state
        employee,
        accessToken,
        refreshToken,
        isLoading,
        login,
        logout,
        refreshAccessToken: refreshAccessTokenFn,
        isAuthenticated: !!employee && !!accessToken,

        // Work session state
        workSessionState,
        updateWorkSession,
        startWorkSession,
        pauseWorkSession,
        resumeWorkSession,
        stopWorkSession,
        incrementActiveTime,
        incrementIdleTime,
        incrementWaitingTime,
        incrementBreakTime,
        setWorkStatus,

        // Exposed so WorkSession page can also update activity on local events
        lastActivityRef,
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

