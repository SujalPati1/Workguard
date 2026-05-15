import numpy as np
import time
from collections import deque


class LivenessEngine:
    """
    Liveness detection engine — determines whether the person in front of
    the camera is a real, awake human being, not a photo, video replay, or
    spoofing attempt.

    Score components (total 0–100, live threshold = 50):
    ──────────────────────────────────────────────────────
    • Blink rate      0–45   real eyes blink 12–20×/min; photos don't
    • EAR variance    0–25   natural eyelid micro-flutter
    • Head sway       0–30   subtle 3-axis movement every live person exhibits
    • Texture penalty  0–10  DEDUCTED when EAR is suspiciously flat
                             (printed photo / screen replay guard)

    Improvements over v1
    ────────────────────
    • Blink Challenge Gate: during the warm-up period the user is prompted to
      blink N times (random 2–4). A photo cannot satisfy this; a replay loop
      is unlikely to blink exactly N times in the window. The gate must be
      passed before is_live can ever return True.

    • Calibration-concurrent challenge: the challenge starts after
      `calib_frac` of `window_size` frames are collected, so calibration
      and challenge complete at roughly the same time — no extra waiting.

    • Texture flatness penalty: coefficient of variation (std/mean) of the
      EAR signal is checked each frame. Values below the live-person floor
      of ~0.04 trigger a deduction of up to 10 points, making it impossible
      for a flat photo signal to pass the threshold on score alone.

    • Tuned multipliers: empirically calibrated so a typical live person
      (blink rate ~15/min, EAR std ~0.015, head jitter ~1–2°) scores ≥ 80,
      while a photo scores < 30.

    • Exponential moving average (EMA) smoothing: raw score is smoothed with
      α=0.35 so a single noisy frame can't flip is_live.

    • Consecutive-frame gate: is_live=True only after the smoothed score
      exceeds LIVE_THRESHOLD for `confirm_frames` consecutive frames,
      eliminating single-frame false positives.

    • Attendance stamp: once confirmed, records subject_id + ISO timestamp
      in `self.attendance` for the caller to persist.

    Design notes
    ─────────────
    • Initialised AFTER calibration so `blink_threshold` is the user's own value.
    • `reset()` restarts liveness when the face disappears and reappears.
    • All buffers are rolling so the score stays fresh during long sessions.
    """

    LIVE_THRESHOLD = 50.0

    # Challenge: blink count the user must perform before liveness scoring begins
    _CHALLENGE_MIN     = 2
    _CHALLENGE_MAX     = 4
    _CHALLENGE_TIMEOUT = 8.0   # seconds

    def __init__(
        self,
        blink_threshold : float,
        window_size     : int   = 60,
        timeout         : int   = 8,
        confirm_frames  : int   = 10,
        ema_alpha       : float = 0.35,
        subject_id      : str   = "",
    ):
        self.blink_threshold = blink_threshold
        self.window_size     = window_size
        self.timeout         = timeout
        self.confirm_frames  = confirm_frames
        self.ema_alpha       = ema_alpha
        self.subject_id      = subject_id

        # Rolling signal buffers
        self.ear_buffer    = deque(maxlen=window_size)
        self.pitch_buffer  = deque(maxlen=window_size)
        self.yaw_buffer    = deque(maxlen=window_size)
        self.roll_buffer   = deque(maxlen=window_size)

        # Main blink counter (Rolling 1-minute queue)
        self.blink_timestamps = deque(maxlen=60)
        self.closed_frames    = 0
        self._in_blink        = False

        # ── Blink Challenge state ─────────────────────────────────────────────
        import random
        self._challenge_required      = random.randint(self._CHALLENGE_MIN,
                                                       self._CHALLENGE_MAX)
        self._challenge_done          = 0
        self._challenge_passed        = False
        self._challenge_start         = None   # set once calib buffer is ready
        self._challenge_closed_frames = 0
        self._challenge_in_blink      = False

        # ── Smoothing & confirmation ──────────────────────────────────────────
        self._ema_score      = 0.0
        self._confirm_streak = 0

        # Fraction of window_size frames needed before challenge starts.
        # At 0.60: challenge begins at frame 36 (of 60), so both finish together.
        self._calib_frac = 0.60

        # ── Attendance ────────────────────────────────────────────────────────
        # Populated once is_live=True. Caller reads and persists this.
        self.attendance = None

        # Timing
        self.start_time   = time.time()
        self.min_duration = 2   # seconds before we trust the score

    # ── Public API ────────────────────────────────────────────────────────────

    def update(self, ear: float, pitch: float, yaw: float, roll: float = 0.0):
        """
        Feed one frame of filtered biometric data.
        Returns (is_live: bool, score: float 0–100).
        score is always returned so the UI can show a progress bar.
        """
        self.ear_buffer.append(ear)
        self.pitch_buffer.append(pitch)
        self.yaw_buffer.append(yaw)
        self.roll_buffer.append(roll)

        # ── Main blink detector (hysteresis to avoid noise double-counting) ───
        if ear < self.blink_threshold:
            self.closed_frames += 1
            self._in_blink = True
        else:
            if self._in_blink and self.closed_frames >= 1: # lowered to 1 to catch fast micro-blinks
                self.blink_timestamps.append(time.time())
            self._in_blink     = False
            self.closed_frames = 0

        # ── Start challenge once the calibration buffer is sufficiently full ──
        buf_filled = len(self.ear_buffer) / self.window_size
        if not self._challenge_passed and self._challenge_start is None:
            if buf_filled >= self._calib_frac:
                self._challenge_start = time.time()

        # ── Run blink challenge (independent blink counter) ───────────────────
        if self._challenge_start is not None and not self._challenge_passed:
            elapsed_ch = time.time() - self._challenge_start

            if ear < self.blink_threshold:
                self._challenge_closed_frames += 1
                self._challenge_in_blink = True
            else:
                if self._challenge_in_blink and self._challenge_closed_frames >= 2:
                    self._challenge_done += 1
                self._challenge_in_blink      = False
                self._challenge_closed_frames = 0

            if self._challenge_done >= self._challenge_required:
                self._challenge_passed = True
            elif elapsed_ch > self._CHALLENGE_TIMEOUT:
                # Timed out — reset the liveness engine to try again
                self.reset()
                return False, 0.0

        # ── Warm-up guards ────────────────────────────────────────────────────
        if len(self.ear_buffer) < self.window_size:
            return False, 0.0
        if time.time() - self.start_time < self.min_duration:
            return False, 0.0
        if not self._challenge_passed:
            return False, 0.0

        # ── Score + EMA smoothing ─────────────────────────────────────────────
        raw_score = self._compute_score()
        self._ema_score = (
            self.ema_alpha * raw_score
            + (1.0 - self.ema_alpha) * self._ema_score
        )

        # ── Consecutive-frame confirmation gate ───────────────────────────────
        if self._ema_score > self.LIVE_THRESHOLD:
            self._confirm_streak += 1
        else:
            self._confirm_streak = 0

        is_live = self._confirm_streak >= self.confirm_frames

        # ── Attendance stamp (written once on first confirmation) ─────────────
        if is_live and self.attendance is None:
            from datetime import datetime, timezone
            self.attendance = {
                "subject_id"    : self.subject_id,
                "timestamp"     : datetime.now(timezone.utc).isoformat(),
                "liveness_score": round(self._ema_score, 2),
            }

        return is_live, round(self._ema_score, 2)

    @property
    def challenge_status(self) -> dict:
        """
        Call this each frame to surface challenge info in your UI.

        Returns a dict with:
            required  – total blinks the user must do
            done      – blinks completed so far
            passed    – True once challenge is satisfied
            active    – True while the challenge window is open
            remaining – seconds left in the challenge window
        """
        if self._challenge_start is None:
            remaining = 0.0
            active    = False
        else:
            remaining = max(
                self._CHALLENGE_TIMEOUT - (time.time() - self._challenge_start), 0.0
            )
            active = not self._challenge_passed and remaining > 0

        return {
            "required" : self._challenge_required,
            "done"     : self._challenge_done,
            "passed"   : self._challenge_passed,
            "active"   : active,
            "remaining": round(remaining, 1),
        }

    def reset(self):
        """Restart liveness detection (e.g. after subject leaves frame)."""
        import random
        self.ear_buffer.clear()
        self.pitch_buffer.clear()
        self.yaw_buffer.clear()
        self.roll_buffer.clear()

        self.blink_timestamps.clear()
        self.closed_frames = 0
        self._in_blink     = False

        self._challenge_required      = random.randint(self._CHALLENGE_MIN,
                                                       self._CHALLENGE_MAX)
        self._challenge_done          = 0
        self._challenge_passed        = False
        self._challenge_start         = None
        self._challenge_closed_frames = 0
        self._challenge_in_blink      = False

        self._ema_score      = 0.0
        self._confirm_streak = 0
        self.attendance      = None
        self.start_time      = time.time()

    # ── Private helpers ───────────────────────────────────────────────────────

    def _compute_score(self) -> float:
        """
        Compute a 0–100 liveness score from the rolling window buffers.

        Component breakdown
        ───────────────────
        blink_rate_score  0–45   normalised blinks/min vs human baseline
        ear_motion_score  0–25   eyelid micro-flutter variance
                                 multiplier 5000: EAR var≈0.003 → ~15 pts
        head_sway_score   0–30   pitch+yaw+roll variance
                                 multiplier 5.5: jitter of 1–2° → ~20–25 pts
        texture_penalty   0–10   deducted when CV(EAR) is below human floor,
                                 so a flat photo signal can never reach threshold
        """
        elapsed_min = max((time.time() - self.start_time) / 60.0, 1 / 60)

        ear_arr   = np.array(self.ear_buffer,   dtype=float)
        pitch_arr = np.array(self.pitch_buffer, dtype=float)
        yaw_arr   = np.array(self.yaw_buffer,   dtype=float)
        roll_arr  = np.array(self.roll_buffer,  dtype=float)

        ear_var   = float(np.var(ear_arr))
        pitch_var = float(np.var(pitch_arr))
        yaw_var   = float(np.var(yaw_arr))
        roll_var  = float(np.var(roll_arr))

        # 1. Blink RATE score (0–45)
        #    Compute rolling blinks exactly over the last 60 seconds
        now = time.time()
        while self.blink_timestamps and now - self.blink_timestamps[0] > 60.0:
            self.blink_timestamps.popleft()
        
        blinks_per_min   = len(self.blink_timestamps)
        blink_rate_score = min(blinks_per_min * 4.5, 45.0)

        # 2. EAR micro-flutter (0–25)
        #    Live eyelids constantly micro-adjust; a static photo has near-zero var.
        ear_motion_score = min(ear_var * 5000.0, 25.0)

        # 3. Head sway — all 3 axes (0–30)
        head_sway_score = min((pitch_var + yaw_var + roll_var) * 5.5, 30.0)

        # 4. Texture flatness penalty (0–10, subtracted)
        #    Coefficient of Variation (CV) = std / mean.
        #    Live humans: CV typically > 0.05.
        #    Photos / screens: CV typically < 0.01.
        #    Smooth ramp between 0.02 and 0.05 avoids cliff-edging on borderline
        #    users (bright studio lighting, etc.).
        ear_mean = float(np.mean(np.abs(ear_arr))) + 1e-9
        ear_cv   = float(np.std(ear_arr)) / ear_mean
        if ear_cv < 0.02:
            texture_penalty = 10.0
        elif ear_cv < 0.05:
            texture_penalty = 10.0 * (0.05 - ear_cv) / 0.03
        else:
            texture_penalty = 0.0

        total = (
            blink_rate_score
            + ear_motion_score
            + head_sway_score
            - texture_penalty
        )
        return float(np.clip(total, 0.0, 100.0))
