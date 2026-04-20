# engine/calibration.py
import numpy as np

class CalibrationManager:
    def __init__(self, calibration_frames=90):
        """
        calibration_frames: How many frames to collect (90 frames @ 30fps = ~3 seconds)
        """
        self.total_frames = calibration_frames
        self.ear_buffer   = []
        self.pitch_buffer = []
        self.yaw_buffer   = []
        self.is_calibrated = False
        
        # Default fallback values (used if calibration fails)
        self.baseline_ear   = 0.30
        self.baseline_pitch = 0.0
        self.baseline_yaw   = 0.0
        self.thresholds = {
            "blink":          0.20,
            "drowsy":         0.18,
            "baseline_pitch": 0.0,   # user's personal looking-at-screen pitch
            "baseline_yaw":   0.0,   # user's personal looking-at-screen yaw
        }

    def update(self, current_ear, current_pitch=0.0, current_yaw=0.0):
        """
        Called every frame during calibration. Collects EAR, Pitch, and Yaw
        until the buffer is full, then finalises thresholds.
        Returns: Progress (0.0 to 1.0)
        """
        if self.is_calibrated:
            return 1.0

        if current_ear is not None:
            self.ear_buffer.append(current_ear)
            self.pitch_buffer.append(float(current_pitch))
            self.yaw_buffer.append(float(current_yaw))

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
        2. Remove EAR Outliers (Blinks during calibration).
        3. Set EAR Thresholds based on percentages.
        4. Set Head Pose Baseline using median (robust to occasional glances away).
        """
        data = np.array(self.ear_buffer)
        
        # 1. Remove Outliers (Values below 10th percentile are likely blinks)
        # We only want the 'Open Eye' values.
        clean_data = data[data > np.percentile(data, 10)]
        
        if len(clean_data) == 0:
            # Fallback if data is garbage
            self.is_calibrated = True
            return

        # 2. Calculate EAR Baseline (The user's normal "Open Eye")
        self.baseline_ear = np.mean(clean_data)
        
        # 3. Set Dynamic EAR Thresholds
        # - Blink: 75% of baseline (Eyes closing significantly)
        # - Drowsy: 65% of baseline (Eyes half-closed)
        self.thresholds["blink"]  = self.baseline_ear * 0.75
        self.thresholds["drowsy"] = self.baseline_ear * 0.65

        # 4. Head Pose Baseline — median is robust to brief glances during calibration
        self.baseline_pitch = float(np.median(self.pitch_buffer))
        self.baseline_yaw   = float(np.median(self.yaw_buffer))
        self.thresholds["baseline_pitch"] = self.baseline_pitch
        self.thresholds["baseline_yaw"]   = self.baseline_yaw
        
        self.is_calibrated = True
        print(
            f"[CALIBRATION] Baseline EAR: {self.baseline_ear:.3f} | "
            f"Blink: {self.thresholds['blink']:.3f} | "
            f"Drowsy: {self.thresholds['drowsy']:.3f} | "
            f"Pitch: {self.baseline_pitch:.1f}° | "
            f"Yaw: {self.baseline_yaw:.1f}°"
        )

    def get_thresholds(self):
        return self.thresholds