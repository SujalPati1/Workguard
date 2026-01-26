# engine/calibration.py
import numpy as np

class CalibrationManager:
    def __init__(self, calibration_frames=60):
        """
        calibration_frames: How many frames to collect (60 frames @ 30fps = ~2 seconds)
        """
        self.total_frames = calibration_frames
        self.ear_buffer = [] # Store raw data
        self.is_calibrated = False
        
        # Default fallback values (Just in case calibration fails)
        self.baseline_ear = 0.30
        self.thresholds = {
            "blink": 0.20,
            "drowsy": 0.18
        }

    def update(self, current_ear):
        """
        Called every frame. Collects data until buffer is full.
        Returns: Progress (0.0 to 1.0)
        """
        if self.is_calibrated:
            return 1.0

        if current_ear is not None:
            self.ear_buffer.append(current_ear)

        # Calculate progress
        progress = len(self.ear_buffer) / self.total_frames
        
        # Check if finished
        if len(self.ear_buffer) >= self.total_frames:
            self._finalize_calibration()
            return 1.0
            
        return progress

    def _finalize_calibration(self):
        """
        The 'Industry Standard' Math:
        1. Convert to Numpy Array.
        2. Remove Outliers (Blinks during calibration).
        3. Set Thresholds based on percentages.
        """
        data = np.array(self.ear_buffer)
        
        # 1. Remove Outliers (Values below 10th percentile are likely blinks)
        # We only want the 'Open Eye' values.
        clean_data = data[data > np.percentile(data, 10)]
        
        if len(clean_data) == 0:
            # Fallback if data is garbage
            self.is_calibrated = True
            return

        # 2. Calculate Baseline (The user's normal "Open Eye")
        self.baseline_ear = np.mean(clean_data)
        
        # 3. Set Dynamic Thresholds
        # - Blink: 75% of baseline (Eyes closing significantly)
        # - Drowsy: 65% of baseline (Eyes half-closed)
        self.thresholds["blink"] = self.baseline_ear * 0.75
        self.thresholds["drowsy"] = self.baseline_ear * 0.65
        
        self.is_calibrated = True
        print(f"[CALIBRATION] Baseline: {self.baseline_ear:.3f} | Blink Thresh: {self.thresholds['blink']:.3f}")

    def get_thresholds(self):
        return self.thresholds