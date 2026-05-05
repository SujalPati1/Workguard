import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { refreshAccessToken, getCurrentUser, logoutEmployee } from "../api/authApi";
import { getConsent } from "../api/consentApi";
import { checkpointApi } from "../utils/attendanceApi";
import { getLivenessStatusApi, heartbeatApi, markLivenessMissedApi } from "../utils/dailyApi";

// Total liveness checks required per day (divides the work shift into 3 parts)
const TOTAL_LIVENESS_REQUIRED = 3;

// Detect if we are running inside Electron (has the preload API)
const isElectron = () => typeof window !== 'undefined' && !!window.electronAPI;

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

  // ===== CONSENT STATE =====
  const [consent, setConsent] = useState(null);

  // ===== ENGINE TELEMETRY STATE =====
  // Subscribed once here so ANY page can read live engine data.
  const [engineTelemetry, setEngineTelemetry] = useState(null);

  // ===== LIVENESS & DAILY ACTIVITY STATE =====
  const [livenessModalOpen, setLivenessModalOpen]   = useState(false);
  const [livenessChecksDone, setLivenessChecksDone] = useState(0);
  const [livenessSlots, setLivenessSlots]           = useState([]);
  const [currentLivenessSlot, setCurrentLivenessSlot] = useState(null);
  const [livenessResponseWindowMs, setLivenessResponseWindowMs] = useState(600000); // 10 min default
  const lastLivenessCheckAtRef = useRef(0);
  // Track the employee's accumulated platform time (synced via heartbeat/refresh)
  const platformTimeRef = useRef(0);
  // Tracks which slots have already been triggered this app-session to prevent repeat fires
  const firedSlotsRef = useRef(new Set());

  // ===== WORK SESSION STATE =====
  const [workSessionState, setWorkSessionState] = useState(() => {
    try {
      const saved = localStorage.getItem("wg_workSession");
      return saved ? JSON.parse(saved) : {
        running: false, sessionId: null,
        activeSec: 0, idleSec: 0, waitingSec: 0, breakSec: 0,
        focusMode: false, workStatus: "WORKING", startTime: null,
      };
    } catch {
      return {
        running: false, sessionId: null,
        activeSec: 0, idleSec: 0, waitingSec: 0, breakSec: 0,
        focusMode: false, workStatus: "WORKING", startTime: null,
      };
    }
  });

  const workSessionRef = useRef(workSessionState);
  useEffect(() => {
    workSessionRef.current = workSessionState;
    localStorage.setItem("wg_workSession", JSON.stringify(workSessionState));
  }, [workSessionState]);

  // lastActivityRef is kept for WAITING/BREAK boundary detection
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

  // ===== ENGINE TELEMETRY SUBSCRIPTION =====
  // Subscribe once globally. Drives idle/active via engine 'status' field.
  // Engine status: 'Focused'/'Drowsy'/'Distracted' → ACTIVE
  //               'Absent' → IDLE (face not visible)
  //               'No Camera' → time is tracked by interval fallback below
  const engineIdleRef = useRef(false); // tracks whether engine says user is absent
  useEffect(() => {
    if (!isElectron()) return;
    const unsub = window.electronAPI.onTelemetry((data) => {
      setEngineTelemetry(data);
      // Update idle flag so the interval below can read it
      engineIdleRef.current = (data.status === 'Absent');
    });
    return () => { if (unsub) unsub(); };
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
    lastLivenessCheckAtRef.current = 0;
  }, [updateWorkSession]);

  const startEngineForSession = useCallback((sessionId) => {
    if (isElectron()) {
      // Respect consent: start with camera and tracking only if they enabled it
      window.electronAPI.engine.start({ 
        withCamera: !!consent?.cameraEnabled,
        withTracking: !!consent?.trackingEnabled 
      });
      window.electronAPI.engine.setSessionCtx({
        sessionId,
        empId: employee?.empId,
        currentLivenessSlot: currentLivenessSlot,
        accessToken: localStorage.getItem("wg_accessToken"),
      });
    }
  }, [consent, employee, currentLivenessSlot]);

  // Update the Electron session context whenever the current liveness slot changes
  useEffect(() => {
    if (isElectron() && workSessionState.sessionId && currentLivenessSlot) {
      window.electronAPI.engine.setSessionCtx({
        sessionId: workSessionState.sessionId,
        empId: employee?.empId,
        currentLivenessSlot: currentLivenessSlot,
        accessToken: localStorage.getItem("wg_accessToken"),
      });
    }
  }, [currentLivenessSlot, workSessionState.sessionId, employee]);

  const triggerLivenessModal = useCallback((slotIndex, empId, token) => {
    // Mark slot as fired so the scheduler doesn't repeat
    if (slotIndex) {
      firedSlotsRef.current.add(slotIndex);
      setCurrentLivenessSlot(slotIndex);
    }
    // Pre-set the Electron context NOW (before user clicks Verify)
    // so when engine starts, it already knows empId + slotIndex
    if (isElectron() && empId && token) {
      window.electronAPI.engine.setSessionCtx({
        sessionId: null,
        empId,
        currentLivenessSlot: slotIndex,
        accessToken: token,
      });
    }
    setLivenessModalOpen(true);
  }, []);

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
    setLivenessModalOpen(false);
    lastLivenessCheckAtRef.current = 0;

    // Stop the Python engine and clear telemetry
    if (isElectron()) {
      window.electronAPI.engine.stop();
      window.electronAPI.engine.setSessionCtx(null);
      setEngineTelemetry(null);
      engineIdleRef.current = false;
    }
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
  // Uses engine telemetry 'status' for idle detection when inside Electron.
  // Falls back to mouse/keyboard idle threshold in browser dev mode.
  useEffect(() => {
    if (!workSessionState.running) return;

    const idleThresholdMs = workSessionState.focusMode ? 30 * 60 * 1000 : 10 * 60 * 1000;

    const tick = setInterval(() => {
      const status = workSessionRef.current.workStatus;

      if (status === "WAITING") {
        setWorkSessionState(prev => ({ ...prev, waitingSec: prev.waitingSec + 1 }));
      } else if (status === "BREAK") {
        setWorkSessionState(prev => ({ ...prev, breakSec: prev.breakSec + 1 }));
      } else {
        // Use engine telemetry for idle when in Electron, else use mouse activity
        const engineSaysIdle = isElectron() && engineIdleRef.current;
        const fallbackIdle   = !isElectron() && (Date.now() - lastActivityRef.current) > idleThresholdMs;
        if (engineSaysIdle || fallbackIdle) {
          setWorkSessionState(prev => ({ ...prev, idleSec: prev.idleSec + 1 }));
        } else {
          setWorkSessionState(prev => ({ ...prev, activeSec: prev.activeSec + 1 }));
        }
      }
    }, 1000);

    return () => clearInterval(tick);
  }, [workSessionState.running, workSessionState.focusMode, workSessionState.workStatus]);


  // ===== DAILY LIVENESS SCHEDULER =====
  // Fetches liveness status from the server on login/session start and
  // triggers verification popups based on the 3-slot daily schedule.
  // This runs INDEPENDENTLY of work sessions.
  const initialLivenessFiredRef = useRef(false);

  // Fetch liveness status from server when employee is authenticated
  const refreshLivenessStatus = useCallback(async () => {
    if (!employee?.empId) return;
    try {
      const res = await getLivenessStatusApi(employee.empId);
      if (res.success) {
        const slots = res.livenessSlots || [];
        setLivenessSlots(slots);
        setLivenessChecksDone(res.totalLivenessPassed || 0);

        if (res.totalPlatformTime !== undefined) {
          platformTimeRef.current = res.totalPlatformTime;
        }

        // Store the response window duration
        if (res.livenessResponseWindowMs) {
          setLivenessResponseWindowMs(res.livenessResponseWindowMs);
        }

        // Pre-mark already-resolved slots so scheduler never re-triggers them
        slots.forEach(s => {
          if (s.status === 'PASSED' || s.status === 'MISSED') {
            firedSlotsRef.current.add(s.slotIndex);
          }
        });

        // Set the next pending slot (for context tracking)
        const nextPending = slots.find(s => s.status === 'PENDING');
        if (nextPending) {
          setCurrentLivenessSlot(nextPending.slotIndex);
        } else {
          setCurrentLivenessSlot(null);
        }
      }
    } catch (err) {
      console.error("[Session] Failed to fetch liveness status:", err);
    }
  }, [employee?.empId]);

  // Fetch liveness status on employee login
  useEffect(() => {
    if (employee?.empId) {
      refreshLivenessStatus();
    }
  }, [employee?.empId, refreshLivenessStatus]);

  // ===== HEARTBEAT (every 2 minutes while app is open) =====================
  // Accumulates platform time in the DB so attendance is based on app-open time,
  // NOT on whether a work session is running.
  useEffect(() => {
    if (!employee?.empId) return;

    // Send one heartbeat immediately on login to ensure a DailyActivity record exists
    heartbeatApi(employee.empId).then(res => {
      if (res?.success) platformTimeRef.current = res.totalPlatformTime;
    }).catch(err =>
      console.warn("[Heartbeat] Initial ping failed:", err)
    );

    const interval = setInterval(() => {
      heartbeatApi(employee.empId).then(res => {
        if (res?.success) platformTimeRef.current = res.totalPlatformTime;
      }).catch(err =>
        console.warn("[Heartbeat] Ping failed:", err)
      );
    }, 120_000); // every 2 minutes

    return () => clearInterval(interval);
  }, [employee?.empId]);

  // ===== PLATFORM-TIME LIVENESS SCHEDULER ===================================
  // Reads the exact triggerPlatformSeconds from each slot.
  // Fires the popup when the accumulated platform time passes that trigger.
  // This means if the app goes to sleep, platform time stops, so liveness checks stop too.
  useEffect(() => {
    if (!employee?.empId || livenessSlots.length === 0) return;

    const interval = setInterval(() => {
      if (livenessModalOpen) return; // Don't stack modals

      for (const slot of livenessSlots) {
        // Skip if already fired in this app session, or already resolved in DB
        if (firedSlotsRef.current.has(slot.slotIndex)) continue;
        if (slot.status === 'PASSED' || slot.status === 'MISSED') {
          firedSlotsRef.current.add(slot.slotIndex);
          continue;
        }
        
        // Fire when accumulated platform time passes the slot's target platform seconds
        if (
          slot.triggerPlatformSeconds !== undefined &&
          platformTimeRef.current >= slot.triggerPlatformSeconds
        ) {
          const token = localStorage.getItem("wg_accessToken");
          triggerLivenessModal(slot.slotIndex, employee.empId, token);
          break; // One at a time
        }
      }
    }, 15_000); // check every 15 seconds

    return () => clearInterval(interval);
  }, [employee?.empId, livenessSlots, livenessModalOpen, triggerLivenessModal]);

  // ===== GLOBAL AUTO-CHECKPOINT (every 30 s) =====
  // Also lives in the context so checkpoints keep firing on every page.
  useEffect(() => {
    if (!workSessionState.running || !workSessionState.sessionId) return;

    const save = setInterval(async () => {
      try {
        const currentSession = workSessionRef.current;
        await checkpointApi({
          sessionId:      currentSession.sessionId,
          activeSeconds:  currentSession.activeSec,
          idleSeconds:    currentSession.idleSec,
          waitingSeconds: currentSession.waitingSec,
          breakSeconds:   currentSession.breakSec,
          workStatus:     currentSession.workStatus,
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
    setConsent(null);

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
          // Fetch user's latest consent dynamically on session start
          try {
            const consentData = await getConsent();
            if (consentData.success && consentData.data) {
              setConsent(consentData.data);
            }
          } catch (e) {
            console.error("Failed to load consent on app load", e);
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

  // Called by App.jsx when liveness is verified (biometric passed)
  const handleLivenessVerified = useCallback(() => {
    setLivenessModalOpen(false);
    setLivenessChecksDone((n) => n + 1);

    // Refresh slots from server to pick up the latest statuses
    refreshLivenessStatus();

    if (isElectron()) {
      const sessionIsRunning = workSessionRef.current?.running;
      if (sessionIsRunning && consent?.cameraEnabled) {
        window.electronAPI.engine.livenessDone({ keepCamera: true });
      } else {
        window.electronAPI.engine.livenessDone({ keepCamera: false });
        if (!sessionIsRunning) {
          window.electronAPI.engine.stop();
        }
      }
    }
  }, [consent, refreshLivenessStatus]);

  // Called by App.jsx when the 10-minute response window expires
  const handleLivenessTimeout = useCallback((slotIndex) => {
    setLivenessModalOpen(false);
    console.warn(`[Session] Liveness slot ${slotIndex} timed out — marking MISSED.`);

    // Tell the server this slot was missed
    if (slotIndex && employee?.empId) {
      markLivenessMissedApi({ empId: employee.empId, slotIndex }).catch(err =>
        console.error("[Session] markMissed failed:", err)
      );
      // Refresh so the UI reflects the MISSED status
      refreshLivenessStatus();
    }

    if (isElectron()) {
      window.electronAPI.engine.livenessDone({ keepCamera: false });
      if (!workSessionRef.current?.running) {
        window.electronAPI.engine.stop();
      }
    }
  }, [employee?.empId, refreshLivenessStatus]);

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

        // Consent
        consent,
        setConsent,

        // Live engine telemetry (null when engine not running)
        engineTelemetry,

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

        // Liveness & Engine controls
        startEngineForSession,
        triggerLivenessModal,
        livenessModalOpen,
        livenessChecksDone,
        livenessSlots,
        currentLivenessSlot,
        livenessResponseWindowMs,
        refreshLivenessStatus,
        handleLivenessVerified,
        handleLivenessTimeout,

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

