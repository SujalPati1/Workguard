import numpy as np
from collections import deque

class VoiceActivityDetector:
    def __init__(self, buffer_size=45):
        self.buffer = deque(maxlen=buffer_size)

        # --- speaking detection parameters ---
        self.recent_window = 12        # ~0.4 sec recent frames
        self.min_amp = 0.035
        self.min_speed = 0.002
        self.min_cross = 3

        # speaking state control
        self.speaking_hold_frames = 8   # keep speaking briefly after motion
        self.speaking_timer = 0

        # --- yawning parameters (keep your working logic) ---
        self.yawn_open_threshold = 0.42
        self.yawn_duration_frames = 12
        self.yawn_counter = 0

        self.last_result = {
            "is_speaking": False,
            "is_yawning": False
        }

    def update(self, mar_value):
        mar_value = float(mar_value)
        self.buffer.append(mar_value)

        if len(self.buffer) < self.recent_window:
            return self.last_result

        arr = np.array(self.buffer)

        # ---------- YAWNING (unchanged logic) ----------
        if mar_value > self.yawn_open_threshold:
            self.yawn_counter += 1
        else:
            self.yawn_counter = max(0, self.yawn_counter - 1)

        is_yawning = self.yawn_counter >= self.yawn_duration_frames

        # ---------- SPEAKING (NEW LOGIC) ----------
        # use ONLY recent frames to avoid long delay
        recent = arr[-self.recent_window:]

        amplitude = recent.max() - recent.min()
        diffs = np.abs(np.diff(recent))
        avg_speed = np.mean(diffs)

        centered = recent - np.mean(recent)
        signs = centered > 0
        zero_crossings = np.sum(signs[:-1] != signs[1:])

        speaking_now = (
            amplitude > self.min_amp and
            avg_speed > self.min_speed and
            zero_crossings >= self.min_cross and
            not is_yawning
        )

        # fast attack + fast decay timer
        if speaking_now:
            self.speaking_timer = self.speaking_hold_frames
        else:
            self.speaking_timer = max(0, self.speaking_timer - 1)

        is_speaking = self.speaking_timer > 0

        self.last_result = {
            "is_speaking": bool(is_speaking),
            "is_yawning": bool(is_yawning)
        }

        # optional debug
        # print(f"Amp:{amplitude:.3f} Speed:{avg_speed:.4f} Cross:{zero_crossings} SpeakTimer:{self.speaking_timer}")

        return self.last_result