import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { refreshAccessToken, getCurrentUser, logoutEmployee } from "../api/authApi";
import { getConsent } from "../api/consentApi";
import { checkpointApi } from "../utils/attendanceApi";
import { getLivenessStatusApi, heartbeatApi, markLivenessMissedApi, wellnessSyncApi } from "../utils/dailyApi";
import { logWellnessEventApi, finalizeWellnessApi } from "../utils/wellnessApi";

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

  const employeeRef = useRef(employee);
  useEffect(() => {
    employeeRef.current = employee;
  }, [employee]);

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

  // ===== WELLNESS SCORE STATE =====
  // Per-session score, starts at 100, adjusted by biometric alerts.
  // Completely separate from Idle logic. Employee-private.
  const sessionWellnessScoreRef = useRef(100); // ref for async access in callbacks (still kept for live UI display)
  const [sessionWellnessScore, setSessionWellnessScore] = useState(100);

  // Throttle state for wellness event firing — prevents high-freq engine data spam.
  // All timers and edge-detection state lives here as a single mutable object ref.
  const wellnessThrottleRef = useRef({
    lastStatus:              null,  // last engine status string seen
    lastYawnMs:              null,  // timestamp of last yawn event fired
    distractedAccumulatorMs: 0,     // accumulated distraction time (ms)
    focusedStartMs:          null,  // timestamp when current focus streak started
    lastStreakCount:         0,     // how many 5-min streaks have already been rewarded
    lastHeartbeatMs:         null,  // timestamp of last HEARTBEAT event fired (every 10 min)
  });

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
  // Multi-signal idle detection:
  //   Signal 1 (Visual)    — engine status === 'Absent'  (camera must be ON)
  //   Signal 2 (Physical)  — kinematic.is_idle === true  (always-on even if tracking off)
  //   Signal 3 (Contextual)— Social/Media category sustained > OFF_TASK_IDLE_SEC seconds
  // Generic 'Browsing' is treated as Active (benefit of the doubt for researchers).
  const OFF_TASK_IDLE_SEC = 300; // 5 minutes of Social/Media before marking Idle
  const SOCIAL_CATEGORIES = ['Social', 'Media']; // only explicit distractions, NOT 'Browsing'

  const engineIdleRef         = useRef(false); // final computed idle flag read by the timer
  const offTaskSecondsRef     = useRef(0);     // accumulated seconds in Social/Media
  const lastTelemetryTimeRef  = useRef(null);  // wall-clock of last telemetry frame

  // App Usage Tracking Refs
  const appUsageSummaryRef    = useRef({});
  const appUsageTimelineRef   = useRef([]);
  const activeAppRef          = useRef({ app: "Unknown", category: "Unknown", start: null });

  useEffect(() => {
    if (!isElectron()) return;
    const unsub = window.electronAPI.onTelemetry((data) => {
      setEngineTelemetry(data);

      const now = Date.now();
      // Compute elapsed seconds since last telemetry frame (capped at 5 s to avoid gaps after sleep)
      const elapsedSec = lastTelemetryTimeRef.current
        ? Math.min((now - lastTelemetryTimeRef.current) / 1000, 5)
        : 0;
      lastTelemetryTimeRef.current = now;

      // Signal 1 — Visual absence (camera required)
      const isAbsent = (data.status === 'Absent');

      // Signal 2 — Physical inactivity (always-on kinematics)
      const isPhysicallyIdle = (data.kinematic?.is_idle === true);

      // Signal 3 — Off-task app context (Social/Media only, not generic Browsing)
      const category = data.app_context?.category;
      if (SOCIAL_CATEGORIES.includes(category)) {
        offTaskSecondsRef.current += elapsedSec;
      } else {
        // Reset the grace-period timer as soon as they return to any work-related category
        offTaskSecondsRef.current = 0;
      }

      // --- High-fidelity App Usage Tracking ---
      const currentSession = workSessionRef.current;
      if (data.app_context && currentSession.running && currentSession.workStatus !== 'BREAK') {
        const { base_app, category: appCategory } = data.app_context;
        const now = new Date();
        const activeApp = activeAppRef.current;

        if (!activeApp.start) {
          // Initialize first app
          activeAppRef.current = { app: base_app, category: appCategory, start: now };
        } else if (activeApp.app !== base_app) {
          // App switched: close current segment and push to timeline
          const duration = Math.round((now.getTime() - activeApp.start.getTime()) / 1000);
          if (duration > 0) {
            appUsageTimelineRef.current.push({
              app: activeApp.app,
              category: activeApp.category,
              start: activeApp.start,
              end: now,
              duration
            });
          }
          // Start new segment
          activeAppRef.current = { app: base_app, category: appCategory, start: now };
        }

        // Accumulate seconds to the summary map
        if (elapsedSec > 0) {
          // We floor or ceil, let's round
          const sec = Math.round(elapsedSec);
          if (sec > 0) {
            appUsageSummaryRef.current[base_app] = (appUsageSummaryRef.current[base_app] || 0) + sec;
          }
        }
      }
      // ----------------------------------------
      const isOffTask = offTaskSecondsRef.current >= OFF_TASK_IDLE_SEC;

      // Final idle verdict: ANY one signal is sufficient
      engineIdleRef.current = isAbsent || isPhysicallyIdle || isOffTask;

      // ── Wellness Track (SEPARATE from Idle) ────────────────────────────────
      // Only log wellness events when a session is running and NOT on BREAK.
      // Break time is private — we do not monitor during breaks.
      //
      // THROTTLING RULES (prevents score-spamming from high-freq engine frames):
      //   • DROWSY / DISTRACTED : Edge-trigger only — fires ONCE when status changes
      //                           into that state. Not on every frame.
      //   • YAWN               : 10-second cooldown between successive yawn events.
      //   • BAD_POSTURE        : Accumulates time in bad posture; fires once per
      //                          60 continuous seconds, then resets.
      //   • FOCUSED (reward)   : +2 pts awarded once every 5 uninterrupted focused
      //                          minutes. Timer resets if focus breaks.
      const session = workSessionRef.current;
      const currentEmployee = employeeRef.current;

      if (session?.running && session?.workStatus !== 'BREAK' && session?.sessionId && currentEmployee?._id) {
        const wt     = wellnessThrottleRef.current;
        const nowMs  = Date.now();
        const currentStatus = data.status; // 'Focused','Drowsy','Distracted','Absent','No Camera'

        const fireWellnessEvent = (eventType) => {
          // PHASE 1A: currentScore is REMOVED — server is now authoritative.
          // PHASE 1 CLIENT TIMESTAMP: send the exact engine-side timestamp so
          // the graph plots the event at the correct moment, not at network-arrival time.
          logWellnessEventApi({
            empId:           currentEmployee._id,
            sessionId:       session.sessionId,
            eventType,
            clientTimestamp: new Date().toISOString(),
          }).then((res) => {
            if (res?.success && typeof res.newScore === 'number') {
              // Update local display score from server's authoritative response
              sessionWellnessScoreRef.current = res.newScore;
              setSessionWellnessScore(res.newScore);
            }
          }).catch(() => {}); // Non-fatal — wellness events must never crash sessions
        };

        // ── 1. DROWSY — edge-trigger (only once when transitioning INTO drowsy) ─
        if (currentStatus === 'Drowsy' && wt.lastStatus !== 'Drowsy') {
          fireWellnessEvent('DROWSY');
          wt.focusedStartMs = null; // break any focus streak
        }

        // ── 2. DISTRACTED — Accumulated Leaky Bucket (fires once per 60s sustained) ────
        // Avoids punishing "noisy focus" (e.g. 50s distracted, 2s focus, 10s distracted).
        // Distracted adds time. Focused subtracts time. If it hits 60s, fire penalty.
        if (currentStatus?.startsWith('Distracted')) {
          wt.distractedAccumulatorMs += (elapsedSec * 1000);
          if (wt.distractedAccumulatorMs >= 60_000) {
            fireWellnessEvent('DISTRACTED');
            wt.distractedAccumulatorMs = 0; // reset after firing
            wt.focusedStartMs = null;
          }
        } else if (currentStatus === 'Focused') {
          // Slowly drain the distraction bucket when focused (leaky bucket)
          wt.distractedAccumulatorMs = Math.max(0, wt.distractedAccumulatorMs - (elapsedSec * 1000));
        }

        // ── 3. YAWN — 10-second cooldown between distinct yawn events ────────────
        if (data.is_yawning === true && wt.lastStatus !== 'YAWNING') {
          // Only fire if at least 10s since last yawn
          if (!wt.lastYawnMs || (nowMs - wt.lastYawnMs) > 10_000) {
            fireWellnessEvent('YAWN');
            wt.lastYawnMs = nowMs;
            wt.focusedStartMs = null;
          }
        }

        // ── 5. FOCUS STREAK REWARD — +2 pts once every 5 continuous focused mins ─
        if (currentStatus === 'Focused' && !data.is_yawning) {
          if (!wt.focusedStartMs) wt.focusedStartMs = nowMs;
          const focusedMs = nowMs - wt.focusedStartMs;
          // Award every complete 5-minute streak, not on every frame
          const streaksEarned = Math.floor(focusedMs / (5 * 60 * 1000));
          if (streaksEarned > wt.lastStreakCount) {
            fireWellnessEvent('FOCUSED');
            wt.lastStreakCount = streaksEarned;
          }

          // ── PHASE 1C: Steady-State HEARTBEAT — graph anchor every 10 mins ───
          // Fires a zero-delta marker so the graph shows continuous activity
          // during perfectly focused periods (no empty flat lines).
          const HEARTBEAT_INTERVAL_MS = 10 * 60 * 1000;
          if (!wt.lastHeartbeatMs || (nowMs - wt.lastHeartbeatMs) >= HEARTBEAT_INTERVAL_MS) {
            fireWellnessEvent('HEARTBEAT');
            wt.lastHeartbeatMs = nowMs;
          }
        } else if (currentStatus !== 'Focused') {
          // Focus broken — reset the streak timer and counter
          wt.focusedStartMs  = null;
          wt.lastStreakCount = 0;
          // Also reset heartbeat timer so it fires fresh when focus resumes
          wt.lastHeartbeatMs = null;
        }

        // Always update the last known status for edge-detection next frame
        wt.lastStatus = currentStatus;
      }
    });
    return () => {
      if (unsub) unsub();
      // Reset timer state on unmount to prevent stale accumulation on re-mount
      offTaskSecondsRef.current    = 0;
      lastTelemetryTimeRef.current = null;
      wellnessThrottleRef.current  = {
        lastStatus: null, lastYawnMs: null,
        distractedAccumulatorMs: 0, focusedStartMs: null, lastStreakCount: 0,
      };
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
    lastLivenessCheckAtRef.current = 0;
    // Reset wellness score for every new session
    sessionWellnessScoreRef.current = 100;
    setSessionWellnessScore(100);
    // Reset all throttle state for clean slate
    wellnessThrottleRef.current = {
      lastStatus:              null,
      lastYawnMs:              null,
      distractedAccumulatorMs: 0,
      focusedStartMs:          null,
      lastStreakCount:         0,
      lastHeartbeatMs:         null,
    };
    engineIdleRef._lastStatus = undefined; // reset biometric state tracking
  }, [updateWorkSession]);

  /**
   * Syncs the local workSessionState with the database.
   * Prevents "Ghost Sessions" where local storage says 'running' but DB is closed.
   */
  const syncWorkSessionWithDb = useCallback(async (empId, activeConsent = null) => {
    if (!empId) return;
    try {
      const res = await resumeSessionApi({ empId });
      if (res?.success && res.session) {
        // DB says session is active - sync our local state to DB values
        const s = res.session;
        setWorkSessionState({
          running: true,
          sessionId: s._id,
          focusMode: s.focusMode,
          workStatus: s.workStatus,
          startTime: new Date(s.startTime).getTime(),
          activeSec: s.activeTime || 0,
          idleSec: s.idleTime || 0,
          waitingSec: s.waitingTime || 0,
          breakSec: s.breakTime || 0,
        });

        // Sync authoritative wellness score from DB
        if (typeof res.wellnessScore === 'number') {
          sessionWellnessScoreRef.current = res.wellnessScore;
          setSessionWellnessScore(res.wellnessScore);
        }

        // Engine start/stop is now handled reactively by the useEffect below
      }
    } catch (err) {
      // If 404, it means no active session exists for this user
      if (err.status === 404) {
        console.log("[Session] No active session found in DB. Resetting local state.");
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
      }
    }
  }, [consent, currentLivenessSlot]);

  const startEngineForSession = useCallback((sessionId) => {
    // Engine start is now handled reactively by the useEffect below
  }, []);

  // ── ENGINE REACTIVE SYNC ──────────────────────────────────────────────────
  // This effect acts as the "Single Source of Truth" for the engine state.
  // It ensures that whenever the session resumes or consent is loaded, 
  // the engine is synchronized correctly with the backend process.
  useEffect(() => {
    if (!isElectron()) return;

    const session = workSessionState;
    // We start if:
    // 1. A work session is running (Biometric Wellness Tracking)
    // 2. OR a liveness check is active (Security Verification)
    const shouldBeRunning = session.running || livenessModalOpen;

    if (shouldBeRunning && consent) {
      console.log("[EngineSync] Synchronizing engine: STARTING", { 
        withCamera: consent.cameraEnabled || livenessModalOpen, // Always need camera for liveness
        withTracking: !!consent.trackingEnabled 
      });
      
      window.electronAPI.engine.start({ 
        withCamera: !!consent.cameraEnabled || livenessModalOpen,
        withTracking: !!consent.trackingEnabled 
      });

      window.electronAPI.engine.setSessionCtx({
        sessionId: session.sessionId || null,
        empId: employee?._id || employee?.empId,
        currentLivenessSlot: currentLivenessSlot,
        accessToken: localStorage.getItem("wg_accessToken"),
      });
    } 
    else if (!shouldBeRunning) {
      console.log("[EngineSync] Synchronizing engine: STOPPING");
      window.electronAPI.engine.stop();
    }
  }, [
    workSessionState.running, 
    workSessionState.sessionId, 
    consent, 
    employee?._id, 
    employee?.empId, 
    currentLivenessSlot,
    livenessModalOpen
  ]);

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

      // Show native system notification so user knows to return to app
      window.electronAPI.notification.show({
        title: 'Action Required',
        body: 'Biometric Liveness check requested. Please return to Workguard.'
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
    // Finalize and persist the wellness score BEFORE clearing session state
    const endingSessionId = workSessionRef.current?.sessionId;
    const finalScore      = sessionWellnessScoreRef.current;
    if (endingSessionId) {
      finalizeWellnessApi({ sessionId: endingSessionId, finalScore }).catch(() => {});
    }

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
      engineIdleRef._lastStatus = undefined;
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

    // Idle thresholds — how long physical inactivity is tolerated before marking Idle.
    // Normal Mode : 2 minutes (responsive to short distractions)
    // Focus Mode  : 5 minutes (allows deep reading/thinking without penalty)
    const idleThresholdMs = workSessionState.focusMode ? 5 * 60 * 1000 : 2 * 60 * 1000;

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
      const res = await getLivenessStatusApi();
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

  // Fetch liveness status on employee login - wait for accessToken to be ready
  useEffect(() => {
    if (employee?.empId && accessToken) {
      refreshLivenessStatus();
    }
  }, [employee?.empId, accessToken, refreshLivenessStatus]);

  // ===== HEARTBEAT (every 2 minutes while app is open) =====================
  // Accumulates platform time in the DB so attendance is based on app-open time,
  // NOT on whether a work session is running.
  useEffect(() => {
    if (!employee?.empId || !accessToken) return;

    let retryCount = 0;
    const maxRetries = 5;

    let currentDateStr = null;

    const fireInitialHeartbeat = async () => {
      try {
        const res = await heartbeatApi();
        if (res?.success) {
          platformTimeRef.current = res.totalPlatformTime;
          currentDateStr = res.date;
          console.log("[Heartbeat] Initial daily activity created/synced.");
        }
      } catch (err) {
        console.warn(`[Heartbeat] Initial ping failed (attempt ${retryCount + 1}):`, err);
        if (retryCount < maxRetries) {
          retryCount++;
          setTimeout(fireInitialHeartbeat, 10000); // Retry after 10s if first one fails
        }
      }
    };

    // Send one heartbeat immediately to ensure a DailyActivity record exists for the day
    fireInitialHeartbeat();

    const interval = setInterval(() => {
      heartbeatApi().then(res => {
        if (res?.success) {
          platformTimeRef.current = res.totalPlatformTime;
          
          // Detect day rollover (midnight)
          if (currentDateStr && res.date && currentDateStr !== res.date) {
            console.warn("[Context] Date change detected at midnight. Reloading app state.");
            window.location.reload();
          }
          currentDateStr = res.date;
        }
      }).catch(err =>
        console.warn("[Heartbeat] Ping failed:", err)
      );
    }, 120_000); // every 2 minutes

    return () => clearInterval(interval);
  }, [employee?.empId, accessToken]);

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
          triggerLivenessModal(slot.slotIndex, employee._id, token);
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
        // Flush both the timeline and the summary buffer to send incremental deltas
        const timelineFlush = [...appUsageTimelineRef.current];
        const appUsageFlush = { ...appUsageSummaryRef.current };
        
        appUsageTimelineRef.current = [];
        appUsageSummaryRef.current = {};

        const res = await checkpointApi({
          sessionId:      currentSession.sessionId,
          activeSeconds:  currentSession.activeSec,
          idleSeconds:    currentSession.idleSec,
          waitingSeconds: currentSession.waitingSec,
          breakSeconds:   currentSession.breakSec,
          workStatus:     currentSession.workStatus,
          appUsage:       appUsageFlush,
          appUsageTimeline: timelineFlush,
        });

        // If the session spanned midnight, the server auto-completes it.
        // We must stop it locally.
        if (res?.stale) {
          console.warn("[Context] Session spanned midnight and was auto-completed by server.");
          stopWorkSession();
          window.location.reload();
        }

      } catch (err) {
        console.error("[Context] Checkpoint error:", err);
        // loop-hole fix: if the session is gone from DB, stop it locally too
        if (err.status === 404 || err.response?.status === 404) {
          console.warn("[Context] Active session not found on server. Stopping local session.");
          stopWorkSession();
        }
      }
    }, 30000);

    return () => clearInterval(save);
  }, [workSessionState.running, workSessionState.sessionId]);

  // ===== WELLNESS SYNC (every 60 s while session is running) =====
  // Pushes the latest cognitive/kinematic engine metrics to the server so
  // the Focus Score calculation uses real biometric data, not just time ratios.
  // Uses a ref snapshot to avoid stale closure over engineTelemetry state.
  const engineTelemetryRef = useRef(null);
  useEffect(() => {
    engineTelemetryRef.current = engineTelemetry;
  }, [engineTelemetry]);

  useEffect(() => {
    if (!workSessionState.running || !workSessionState.sessionId || !employee?.empId) return;

    const sync = setInterval(async () => {
      const telemetry = engineTelemetryRef.current;
      if (!telemetry) return; // engine not running or not in Electron
      try {
        await wellnessSyncApi({
          empId:            employee._id, // Using ObjectId — backend resolves empId
          strainScore:      telemetry.strain_score       ?? 0,
          flowDurationMins: telemetry.flow_duration_mins ?? 0,
          isFragmented:     telemetry.is_fragmented      ?? false,
          isIdle:           engineIdleRef.current,
          // Biometric signals (0 when camera is off)
          ear:              telemetry.ear                ?? 0,
          isYawning:        telemetry.is_yawning         ?? false,
          status:           telemetry.status             ?? 'Unknown',
        });
      } catch (err) {
        // Non-fatal: wellness sync failure should never break the session
        console.warn("[Wellness] Sync failed (non-fatal):", err);
      }
    }, 60_000); // every 60 seconds

    return () => clearInterval(sync);
  }, [workSessionState.running, workSessionState.sessionId, employee?.empId]);

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
          let fetchedConsent = null;
          try {
            const consentData = await getConsent();
            if (consentData.success && consentData.data) {
              fetchedConsent = consentData.data;
              setConsent(fetchedConsent);
            }
          } catch (e) {
            console.error("Failed to load consent on app load", e);
          }

          // Loop-hole fix: Sync session status with DB immediately after auth is confirmed
          const currentEmp = JSON.parse(localStorage.getItem("wg_employee") || "{}");
          if (currentEmp?.empId) {
            await syncWorkSessionWithDb(currentEmp.empId, fetchedConsent);
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
      markLivenessMissedApi({ slotIndex }).catch(err =>
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

        // Per-session wellness score (0-100, resets on every session start)
        // Employee-private — do NOT pass this to any admin-facing component.
        sessionWellnessScore,
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

