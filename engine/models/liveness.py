import numpy as np
import time
from collections import deque


class LivenessEngine:
    """
    Liveness detection engine that determines whether the person in front of
    the camera is a real, awake human being — not a photo, video replay, or
    spoofing attempt.

    The score is built from three independent signals:
      • Blink activity   – real eyes blink; photos/screens don't     (0–40 pts)
      • EAR variance     – natural micro-movements of eyelids         (0–20 pts)
      • Head-pose variance – subtle head sway a live person exhibits  (0–20 pts)
      • Micro-movement   – combined roll variance for extra signal    (0–20 pts)

    A score > 65 is considered "live".

    Design notes
    ─────────────
    • The engine is intentionally initialised AFTER calibration so that
      `blink_threshold` is the user's own calibrated drowsy-EAR value rather
      than a hard-coded constant.
    • `reset()` lets callers restart liveness without creating a new object
      (useful when the face disappears and reappears).
    • All buffers use a rolling window so the score stays fresh over long
      sessions rather than decaying once the window fills.
    """

    # Score threshold above which we declare the subject "live"
    LIVE_THRESHOLD = 65

    def __init__(self, blink_threshold: float, window_size: int = 90, timeout: int = 8):
        """
        Parameters
        ----------
        blink_threshold : float
            EAR value below which an eye is considered "closed". Should be
            seeded from `CalibrationManager.get_thresholds()["drowsy"]`.
        window_size : int
            Rolling buffer length in frames (~3 s at 30 fps). Larger values
            give a more stable score; smaller values react faster.
        timeout : int
            (Reserved) seconds after which liveness could be revoked — not
            enforced here so callers can implement their own policy.
        """
        self.blink_threshold = blink_threshold
        self.window_size = window_size
        self.timeout = timeout

        # Rolling signal buffers
        self.ear_buffer   = deque(maxlen=window_size)
        self.pitch_buffer = deque(maxlen=window_size)
        self.yaw_buffer   = deque(maxlen=window_size)
        self.roll_buffer  = deque(maxlen=window_size)

        # Blink state
        self.blink_count   = 0
        self.closed_frames = 0

        # Timing
        self.start_time   = time.time()
        self.min_duration = 3   # seconds before we trust the score

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def update(self, ear: float, pitch: float, yaw: float, roll: float = 0.0):
        """
        Feed one frame of filtered biometric data.

        Parameters
        ----------
        ear   : smoothed Eye Aspect Ratio
        pitch : smoothed head pitch (degrees)
        yaw   : smoothed head yaw   (degrees)
        roll  : smoothed head roll  (degrees) — optional, adds micro-motion signal

        Returns
        -------
        (is_live: bool, score: float)
            is_live is True when score > LIVE_THRESHOLD AND warm-up has elapsed.
            score   is always returned so the UI can show a progress bar.
        """
        # Accumulate signals
        self.ear_buffer.append(ear)
        self.pitch_buffer.append(pitch)
        self.yaw_buffer.append(yaw)
        self.roll_buffer.append(roll)

        # ── Blink detection ──────────────────────────────────────────
        # A blink = at least 2 consecutive frames below threshold
        if ear < self.blink_threshold:
            self.closed_frames += 1
        else:
            if self.closed_frames >= 2:
                self.blink_count += 1
            self.closed_frames = 0

        # ── Warm-up guards ───────────────────────────────────────────
        # Need a full window AND minimum wall-clock time before scoring
        if len(self.ear_buffer) < self.window_size:
            return False, 0.0

        if time.time() - self.start_time < self.min_duration:
            return False, 0.0

        score = self._compute_score()
        return score > self.LIVE_THRESHOLD, score

    def reset(self):
        """Restart liveness detection (e.g. after subject leaves frame)."""
        self.ear_buffer.clear()
        self.pitch_buffer.clear()
        self.yaw_buffer.clear()
        self.roll_buffer.clear()
        self.blink_count   = 0
        self.closed_frames = 0
        self.start_time    = time.time()

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _compute_score(self) -> float:
        """
        Compute a 0–100 liveness score from the rolling buffers.

        Component breakdown
        ───────────────────
        blink_score       0–40  2 blinks → 40 pts; caps out quickly
        ear_motion_score  0–20  natural eyelid flutter raises variance
        head_motion_score 0–20  pitch + yaw sway of a real head
        roll_motion_score 0–20  roll adds a third independent axis

        All components are individually capped so no single axis can fake
        a passing score on its own.
        """
        ear_var   = float(np.var(self.ear_buffer))
        pitch_var = float(np.var(self.pitch_buffer))
        yaw_var   = float(np.var(self.yaw_buffer))
        roll_var  = float(np.var(self.roll_buffer))

        # Blink score: 20 pts per confirmed blink, capped at 40
        blink_score       = min(self.blink_count * 20, 40)

        # EAR micro-flutter: scale factor tuned for typical EAR range 0.1–0.4
        ear_motion_score  = min(ear_var * 800, 20)

        # Head-pose sway: pitch + yaw variance (degrees²)
        head_motion_score = min((pitch_var + yaw_var) * 0.5, 20)

        # Roll micro-movement bonus
        roll_motion_score = min(roll_var * 0.5, 20)

        total = blink_score + ear_motion_score + head_motion_score + roll_motion_score
        return min(total, 100.0)