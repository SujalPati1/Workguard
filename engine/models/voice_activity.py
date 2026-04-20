import numpy as np
from collections import deque


class VoiceActivityDetector:
    """
    Detects yawning and speaking from the Mouth Aspect Ratio (MAR) signal.
    Drop-in replacement — same interface as original:
        vad = VoiceActivityDetector()
        result = vad.update(mar_value)   # {"is_speaking": bool, "is_yawning": bool}

    Signal anatomy (from live terminal observation):
    ────────────────────────────────────────────────
    • Resting   → MAR ≈ 0.00–0.05, near-zero oscillation
    • Speaking  → MAR oscillates 0.05–0.38, rapid UP-DOWN zero-crossings
    • Yawning   → MAR rises ABOVE 0.42, SUSTAINED for ~1 second (12+ frames)

    Key fixes over original v4:
    ────────────────────────────────────────────────────────────────────────────
    1. EMA smoothing on raw MAR before any decision logic — kills single-frame
       camera jitter that was resetting the yawn counter every few frames.

    2. Forgiveness counter during yawn onset: up to N consecutive sub-threshold
       frames are IGNORED (counter pauses, not resets). This is what was killing
       yawn detection — a single jitter dip wiped out 2 frames of progress with
       the old -2 decay, so the counter never reached 60.

    3. Hysteresis on yawn exit: once yawning is confirmed, the mouth must drop
       below a LOWER close-threshold for several consecutive frames before the
       yawn state ends. Prevents flicker on slow mouth close.

    4. Hard mutual exclusion: confirmed yawn state instantly zeros speaking timer
       with no bleedover.

    5. DEBUG: set self.debug = True after instantiation for per-frame terminal
       output to tune thresholds live.
    """

    def __init__(self, buffer_size=60):
        self.buffer = deque(maxlen=buffer_size)

        # ── EMA smoother ──────────────────────────────────────────────────────
        self._ema_alpha = 0.30
        self._ema_value = None

        # ── Speaking detection ────────────────────────────────────────────────
        self.recent_window        = 12
        self.min_amp              = 0.02    # Lowered from 0.03 because EMA dampens peaks
        self.min_speed            = 0.002
        self.min_cross            = 3
        self.speaking_hold_frames = 8
        self.speaking_timer       = 0

        # ── Yawn detection ────────────────────────────────────────────────────
        self.yawn_open_threshold  = 0.42

        # Onset: smoothed MAR must exceed threshold for this many frames.
        self.yawn_duration_frames = 12     # ≈0.4 s @ 30 fps

        # Forgiveness: consecutive sub-threshold frames to IGNORE during onset.
        # Old code did -2 decay which reset progress on every blink/jitter.
        self.yawn_forgive_max     = 6

        self._yawn_onset_counter  = 0
        self._yawn_forgiven       = 0
        self._yawn_accumulating   = False

        # Hysteresis exit: mouth must stay below close_thr for close_frames
        self.yawn_close_ratio     = 0.65   # close_thr = open_thr * ratio
        self.yawn_close_frames    = 20     # ≈0.67 s @ 30 fps
        self._yawn_close_counter  = 0

        self._yawn_confirmed      = False

        self.yawn_hold_frames     = 20
        self.yawn_hold_timer      = 0

        self.yawn_peak_window     = 15

        self.last_result = {"is_speaking": False, "is_yawning": False}
        self.debug       = False

    # ─────────────────────────────────────────────────────────────────────────

    def _ema(self, raw: float) -> float:
        if self._ema_value is None:
            self._ema_value = raw
        else:
            self._ema_value = self._ema_alpha * raw + (1.0 - self._ema_alpha) * self._ema_value
        return self._ema_value

    # ─────────────────────────────────────────────────────────────────────────

    def update(self, mar_value: float) -> dict:
        raw = float(mar_value)
        smoothed = self._ema(raw)
        
        # FIX: The buffer MUST store the smoothed value, not the raw value!
        # Otherwise the speaking detection sees raw camera jitter and falsely
        # thinks you are talking.
        self.buffer.append(smoothed)

        if len(self.buffer) < self.recent_window:
            return self.last_result

        arr    = np.array(self.buffer)
        recent = arr[-self.recent_window:]

        peak_mar = float(np.max(arr[-self.yawn_peak_window:])) \
                   if len(arr) >= self.yawn_peak_window else float(np.max(arr))

        close_threshold = self.yawn_open_threshold * self.yawn_close_ratio

        # ── YAWNING — onset with forgiveness counter ──────────────────────────
        if smoothed > self.yawn_open_threshold:
            self._yawn_onset_counter += 1
            self._yawn_forgiven       = 0
            self._yawn_accumulating   = True
        else:
            if self._yawn_accumulating and self._yawn_forgiven < self.yawn_forgive_max:
                # Within budget: pause accumulation but do NOT reset counter
                self._yawn_forgiven += 1
            else:
                # Budget exhausted or never started: full reset
                self._yawn_onset_counter = 0
                self._yawn_forgiven      = 0
                self._yawn_accumulating  = False

        if self._yawn_onset_counter >= self.yawn_duration_frames:
            self._yawn_confirmed     = True
            self._yawn_onset_counter = 0
            self._yawn_forgiven      = 0
            self._yawn_accumulating  = False
            self._yawn_close_counter = 0

        # ── YAWNING — hysteresis exit ─────────────────────────────────────────
        if self._yawn_confirmed:
            if smoothed < close_threshold:
                self._yawn_close_counter += 1
            else:
                self._yawn_close_counter = 0  # mouth reopened mid-close

            if self._yawn_close_counter >= self.yawn_close_frames:
                self._yawn_confirmed     = False
                self._yawn_close_counter = 0
                self.yawn_hold_timer     = self.yawn_hold_frames
            else:
                self.yawn_hold_timer = self.yawn_hold_frames  # keep refreshing
        else:
            self.yawn_hold_timer = max(0, self.yawn_hold_timer - 1)

        is_yawning = self._yawn_confirmed or (self.yawn_hold_timer > 0)

        # ── SPEAKING ──────────────────────────────────────────────────────────
        mouth_wide = peak_mar > self.yawn_open_threshold

        amplitude      = recent.max() - recent.min()
        avg_speed      = float(np.mean(np.abs(np.diff(recent))))
        centered       = recent - np.mean(recent)
        signs          = centered > 0
        zero_crossings = int(np.sum(signs[:-1] != signs[1:]))

        speaking_now = (
            amplitude      > self.min_amp    and
            avg_speed      > self.min_speed  and
            zero_crossings >= self.min_cross  and
            not mouth_wide                   and
            not is_yawning
        )

        if speaking_now:
            self.speaking_timer = self.speaking_hold_frames
        elif mouth_wide or is_yawning:
            self.speaking_timer = 0
        else:
            self.speaking_timer = max(0, self.speaking_timer - 1)

        is_speaking = self.speaking_timer > 0

        # ── DEBUG ─────────────────────────────────────────────────────────────
        if self.debug:
            print(
                f"RAW={raw:.3f} | EMA={smoothed:.3f} | "
                f"THR={self.yawn_open_threshold:.3f} | CLO={close_threshold:.3f} | "
                f"onset={self._yawn_onset_counter:>3}/{self.yawn_duration_frames} | "
                f"forg={self._yawn_forgiven}/{self.yawn_forgive_max} | "
                f"close={self._yawn_close_counter:>3}/{self.yawn_close_frames} | "
                f"confirmed={self._yawn_confirmed} | hold={self.yawn_hold_timer:>3} | "
                f"Yawn={is_yawning} | Speak={is_speaking}"
            )

        self.last_result = {
            "is_speaking": bool(is_speaking),
            "is_yawning":  bool(is_yawning),
        }
        return self.last_result