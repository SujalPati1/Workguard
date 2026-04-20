# engine/main.py
"""
WorkGuard — Main telemetry loop.

Orchestrates the webcam biometric pipeline, context polling, kinematic
sensing, cognitive tracking, and **meeting-aware camera yielding** via
the AudioSessionPoller.

Camera yield protocol:
  When an active meeting is detected (Zoom / Teams / Discord / Webex hold
  an active audio session), the loop immediately releases ``cv2.VideoCapture``
  so the conferencing app can claim the webcam without hardware contention.
  Once the meeting ends, the camera is re-acquired with a 5-second backoff
  to avoid spamming the OS with hardware open requests.
"""

import zmq
import time
import json
import cv2
import sys
from sensors.camera import get_biometrics
from sensors.context_poller import WindowContextPoller
from sensors.kinematics import KinematicSensor
from sensors.audio_telemetry import AudioSessionPoller
from models.voice_activity import VoiceActivityDetector
from filters import OneEuroFilter
from calibration import CalibrationManager
from logic.cognitive_tracker import CognitiveTracker

# --- 1. SETUP ---
context = zmq.Context()
socket = context.socket(zmq.PUB)
socket.bind("tcp://127.0.0.1:5555")
voice_detector = VoiceActivityDetector(buffer_size=60)

print("PYTHON_ENGINE_STARTED")
sys.stdout.flush()

# DEBUG: Tell us we are trying to open the camera
print("DEBUG: Attempting to open Webcam (Index 0)...", flush=True)
cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)

if not cap.isOpened():
    print("ERROR: Camera failed to open!", flush=True)
else:
    print("SUCCESS: Camera opened!", flush=True)

# Initialize the 1 Euro Filter
# min_cutoff=0.01: Very smooth when sitting still
# beta=20.0: Reacts INSTANTLY if you blink
ear_filter = OneEuroFilter(min_cutoff=0.01, beta=20.0)
mar_filter = OneEuroFilter(min_cutoff=0.01, beta=20.0)
pitch_filter = OneEuroFilter(min_cutoff=0.1, beta=10.0)
yaw_filter = OneEuroFilter(min_cutoff=0.1, beta=10.0)
roll_filter = OneEuroFilter(min_cutoff=0.1, beta=10.0)

calibrator = CalibrationManager(calibration_frames=90)

# Start context poller on its own daemon thread (1Hz, Windows-only)
context_poller = WindowContextPoller(poll_interval=1.0)
context_poller.start()

# Kinematic Input Entropy Sensor (keyboard + mouse rhythm telemetry)
kinematic_sensor = KinematicSensor()
kinematic_sensor.start()

# Audio Session Poller — meeting detection via Windows Core Audio API (1Hz)
audio_poller = AudioSessionPoller(poll_interval=1.0)
audio_poller.start()

# Cognitive strain & flow tracker
cognitive_tracker = CognitiveTracker()

# --- Meeting-aware camera yield state ---
camera_yielded: bool = False
last_cam_retry: float = 0.0

#: Minimum seconds between camera re-acquisition attempts to prevent
#: spamming the OS with hardware open requests while the device is
#: still locked by the meeting app.
_CAM_RETRY_BACKOFF: float = 5.0

# --- 2. THE LOOP ---

while True:
    current_time: float = time.time()

    # ------------------------------------------------------------------
    # A.  Read audio telemetry — detect active meetings
    # ------------------------------------------------------------------
    audio_metrics: dict = audio_poller.get_metrics()
    in_active_meeting: bool = bool(audio_metrics.get("in_active_meeting", False))

    # ------------------------------------------------------------------
    # B.  Camera yield / reconnect logic
    # ------------------------------------------------------------------
    if in_active_meeting and not camera_yielded:
        # ── YIELD ──  Release the webcam so the meeting app can claim it.
        print(
            f"[MeetingDetection] Active meeting detected "
            f"({audio_metrics.get('meeting_app', '?')}). "
            f"Releasing camera.",
            flush=True,
        )
        try:
            cap.release()
        except Exception as exc:
            print(
                f"[MeetingDetection] Warning: cap.release() raised "
                f"{type(exc).__name__}: {exc}",
                flush=True,
            )
        camera_yielded = True

    elif not in_active_meeting and camera_yielded:
        # ── RECONNECT ──  Meeting ended; try to reclaim the camera.
        if current_time - last_cam_retry > _CAM_RETRY_BACKOFF:
            last_cam_retry = current_time
            print("[MeetingDetection] Meeting ended. Attempting camera reconnect...", flush=True)
            try:
                cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
                if cap.isOpened():
                    camera_yielded = False
                    print("[MeetingDetection] Camera reclaimed successfully.", flush=True)
                else:
                    print(
                        "[MeetingDetection] Camera still unavailable — "
                        f"retrying in {_CAM_RETRY_BACKOFF}s.",
                        flush=True,
                    )
            except Exception as exc:
                print(
                    f"[MeetingDetection] Warning: VideoCapture raised "
                    f"{type(exc).__name__}: {exc}",
                    flush=True,
                )

    # ------------------------------------------------------------------
    # C.  Build the default payload (all keys always present)
    # ------------------------------------------------------------------
    data_out: dict = {
        "ear": 0.0,
        "mar": 0.0,
        "pitch": 0.0,
        "yaw": 0.0,
        "roll": 0.0,
        "is_speaking": False,
        "is_yawning": False,
        "status": "Absent",
        "calibration_progress": 0.0,
    }

    # ------------------------------------------------------------------
    # D.  Frame acquisition & biometric processing
    # ------------------------------------------------------------------
    if camera_yielded:
        # Camera is intentionally released — skip capture entirely.
        if in_active_meeting:
            data_out["status"] = "Active Collaboration (Camera Yielded)"
        else:
            data_out["status"] = "Camera Disconnected/Standby"
    else:
        # Normal path: attempt frame capture.
        ret: bool = False
        frame = None
        try:
            ret, frame = cap.read()
        except Exception as exc:
            print(
                f"DEBUG: cap.read() raised {type(exc).__name__}: {exc}",
                flush=True,
            )
            ret = False

        if not ret or frame is None:
            print("DEBUG: Failed to read frame (Camera busy or disconnected)", flush=True)
            data_out["status"] = "Camera Disconnected/Standby"
            # Sleep briefly to avoid a tight spin on a dead capture device.
            time.sleep(1)
        else:
            # 1. Get Raw Data
            raw_data = get_biometrics(frame)

            if raw_data is not None:
                # 2. Filter ALL Signals
                data_out["ear"] = round(ear_filter.filter(raw_data["ear"], current_time), 3)
                data_out["mar"] = round(mar_filter.filter(raw_data["mar"], current_time), 3)
                voice_result = voice_detector.update(data_out["mar"])

                data_out["is_speaking"] = voice_result["is_speaking"]
                data_out["is_yawning"] = voice_result["is_yawning"]
                data_out["pitch"] = round(pitch_filter.filter(raw_data["pitch"], current_time), 1)
                data_out["yaw"] = round(yaw_filter.filter(raw_data["yaw"], current_time), 1)
                data_out["roll"] = round(roll_filter.filter(raw_data["roll"], current_time), 1)

                # 3. Calibration & Status Logic
                if not calibrator.is_calibrated:
                    data_out["status"] = "Calibrating"
                    data_out["calibration_progress"] = round(
                        calibrator.update(data_out["ear"]) * 100, 1
                    )
                else:
                    thresholds = calibrator.get_thresholds()
                    if data_out["ear"] < thresholds["drowsy"]:
                        data_out["status"] = "Drowsy"
                    else:
                        data_out["status"] = "Focused"

                    # 4. HEAD POSE CHECKS
                    if abs(data_out["yaw"]) > 25:
                        data_out["status"] = "Distracted (Head Turn)"
            else:
                data_out["status"] = "Absent"

    # ------------------------------------------------------------------
    # E.  Attach metadata & supplementary sensors
    # ------------------------------------------------------------------
    data_out["type"] = "biometrics"
    data_out["timestamp"] = current_time

    # Audio meeting telemetry — always present in the payload
    data_out["audio_meeting"] = audio_metrics

    # Context & cognitive metrics
    app_context = context_poller.get_current_state()
    # Use time.monotonic() for the cognitive tracker — it only needs duration
    # arithmetic and must not share the wall-clock value used by the 1 Euro filters.
    cognitive_tracker.update(app_context.get("category", "Unknown"), time.monotonic())
    data_out["app_context"] = app_context
    data_out.update(cognitive_tracker.get_metrics())

    # Neuromotor entropy — keyboard/mouse rhythm telemetry (privacy-safe)
    data_out["kinematic"] = kinematic_sensor.get_metrics()

    # ------------------------------------------------------------------
    # F.  Publish & pace
    # ------------------------------------------------------------------
    socket.send_string(json.dumps(data_out))

    time.sleep(0.03)