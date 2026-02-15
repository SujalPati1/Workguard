import numpy as np
from collections import deque

class VoiceActivityDetector:
    def __init__(self, buffer_size=60):
        self.buffer = deque(maxlen=buffer_size)
        self.buffer_size = buffer_size
        
        # Thresholds (tune later)
        self.energy_threshold = 0.0008
        self.zcr_threshold = 8
        self.yawn_mean_threshold = 0.35
        
        # Optimization
        self.frame_counter = 0
        self.analysis_interval = 5
        
        # Stability
        self.speaking_counter = 0
        self.required_consistency = 3
        
        self.last_result = {
            "is_speaking": False,
            "is_yawning": False
        }

    def update(self, mar_value):
        self.buffer.append(mar_value)
        self.frame_counter += 1
        # Downsample
        if self.frame_counter % self.analysis_interval != 0:
            return self.last_result

        if len(self.buffer) < self.buffer_size:
            return self.last_result

        signal = np.array(self.buffer)
        mean = np.mean(signal)
        centered = signal - mean

        energy = np.var(centered)

        # Better zero crossing calculation
        signs = centered > 0
        zero_crossings = np.sum(signs[:-1] != signs[1:])

        is_speaking_raw = (
            energy > self.energy_threshold and
            zero_crossings > self.zcr_threshold and
            mean < self.yawn_mean_threshold
        )

        is_yawning = (
            mean > self.yawn_mean_threshold and
            zero_crossings < 3
        )

        # Stability filter
        if is_speaking_raw:
            self.speaking_counter += 1
        else:
            self.speaking_counter = 0

        is_speaking = self.speaking_counter >= self.required_consistency

        self.last_result = {
            "is_speaking": bool(is_speaking),
            "is_yawning": bool(is_yawning)
        }
        print(f"Mean: {mean:.3f}, Energy: {energy:.6f}, ZCR: {zero_crossings}")

        return self.last_result
