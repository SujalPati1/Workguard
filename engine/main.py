# engine/main.py
import zmq
import time
import json
import signal
import cv2
import sys
import argparse
from sensors.context_poller import WindowContextPoller
from sensors.kinematics import KinematicSensor
from models.voice_activity import VoiceActivityDetector
from models.liveness import LivenessEngine
from filters import OneEuroFilter
from calibration import CalibrationManager
from logic.cognitive_tracker import CognitiveTracker

# ─────────────────────────────────────────────────────────────────────────────
# 0. CLI ARGUMENTS
# ─────────────────────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Workguard Biometric Engine")
parser.add_argument(
    "--no-camera",
    action="store_true",
    help="Run in camera-off mode (kinematics + context only)"
)
parser.add_argument(
    "--no-tracking",
    action="store_true",
    help="Run in tracking-off mode (no kinematics or context logging)"
)
args = parser.parse_args()

camera_enabled = not args.no_camera
tracking_enabled = not args.no_tracking

# ─────────────────────────────────────────────────────────────────────────────
# 1. ZMQ SETUP — PUB socket (telemetry out) + PULL socket (commands in)
# ─────────────────────────────────────────────────────────────────────────────
context = zmq.Context()

# Telemetry publisher (Engine → Electron)
pub_socket = context.socket(zmq.PUB)
pub_socket.bind("tcp://127.0.0.1:5555")

# Command receiver (Electron → Engine) — non-blocking PULL
cmd_socket = context.socket(zmq.PULL)
cmd_socket.bind("tcp://127.0.0.1:5556")
cmd_socket.setsockopt(zmq.RCVTIMEO, 0)   # non-blocking

voice_detector = VoiceActivityDetector(buffer_size=60)

print("PYTHON_ENGINE_STARTED", flush=True)

# ─────────────────────────────────────────────────────────────────────────────
# 2. CAMERA HELPERS
# ─────────────────────────────────────────────────────────────────────────────
cap = None

def open_camera():
    global cap
    if cap is not None and cap.isOpened():
        return True
    print("DEBUG: Attempting to open Webcam (Index 0)...", flush=True)
    cap = cv2.VideoCapture(0, cv2.CAP_DSHOW)
    if not cap.isOpened():
        print("ERROR: Camera failed to open!", flush=True)
        cap = None
        return False
    print("SUCCESS: Camera opened!", flush=True)
    return True

def close_camera():
    global cap
    if cap is not None:
        cap.release()
        cap = None
        print("ENGINE: Camera released.", flush=True)

if camera_enabled:
    open_camera()

# ─────────────────────────────────────────────────────────────────────────────
# 3. GRACEFUL SHUTDOWN
# ─────────────────────────────────────────────────────────────────────────────
def _shutdown(sig=None, frame=None):
    print("ENGINE: Shutting down gracefully...", flush=True)
    close_camera()
    try:
        pub_socket.close()
        cmd_socket.close()
        context.term()
    except Exception:
        pass
    sys.exit(0)

signal.signal(signal.SIGINT,  _shutdown)
signal.signal(signal.SIGTERM, _shutdown)

# ─────────────────────────────────────────────────────────────────────────────
# 4. SENSORS & FILTERS
# ─────────────────────────────────────────────────────────────────────────────
ear_filter   = OneEuroFilter(min_cutoff=0.01, beta=20.0)
mar_filter   = OneEuroFilter(min_cutoff=0.01, beta=20.0)
pitch_filter = OneEuroFilter(min_cutoff=0.1,  beta=10.0)
yaw_filter   = OneEuroFilter(min_cutoff=0.1,  beta=10.0)
roll_filter  = OneEuroFilter(min_cutoff=0.1,  beta=10.0)

calibrator = CalibrationManager(calibration_frames=90)

liveness_engine: LivenessEngine | None = None

_absent_streak = 0
_ABSENT_RESET_FRAMES = 30

_ear_consec        = 0
_EAR_CONSEC_THRESH = 15

_distract_consec        = 0
_DISTRACT_CONSEC_THRESH = 30
_DISTRACT_ANGLE_DEG     = 15.0

# Start lightweight background sensors based on initial tracking consent
context_poller = WindowContextPoller(poll_interval=1.0)
kinematic_sensor = KinematicSensor()
cognitive_tracker = CognitiveTracker()

if tracking_enabled:
    context_poller.start()
    kinematic_sensor.start()

# ─────────────────────────────────────────────────────────────────────────────
# 5. MAIN LOOP
# ─────────────────────────────────────────────────────────────────────────────
try:
    while True:
        current_time = time.time()

        # ── Poll for incoming commands (non-blocking) ─────────────────────────
        try:
            raw_cmd = cmd_socket.recv_string()
            cmd = json.loads(raw_cmd)
            action = cmd.get("action", "")

            if action == "enable_camera":
                camera_enabled = True
                open_camera()
                # Reset liveness when camera is re-enabled for a fresh check
                if liveness_engine is not None:
                    liveness_engine.reset()
                calibrator = CalibrationManager(calibration_frames=90)
                liveness_engine = None
                print("ENGINE CMD: Camera enabled & liveness reset.", flush=True)

            elif action == "disable_camera":
                camera_enabled = False
                close_camera()
                liveness_engine = None
                print("ENGINE CMD: Camera disabled.", flush=True)

            elif action == "update_consent":
                payload = cmd.get("payload", {})
                
                # Handle camera sync
                cam_enabled = payload.get("cameraEnabled")
                if cam_enabled is True and not camera_enabled:
                    camera_enabled = True
                    open_camera()
                    if liveness_engine is not None:
                        liveness_engine.reset()
                    calibrator = CalibrationManager(calibration_frames=90)
                    liveness_engine = None
                    print("ENGINE CMD: Camera enabled via live consent.", flush=True)
                elif cam_enabled is False and camera_enabled:
                    camera_enabled = False
                    close_camera()
                    liveness_engine = None
                    print("ENGINE CMD: Camera disabled via live consent.", flush=True)

                # Handle tracking sync
                track_enabled = payload.get("trackingEnabled")
                if track_enabled is True and not tracking_enabled:
                    tracking_enabled = True
                    context_poller.start()
                    kinematic_sensor.start()
                    print("ENGINE CMD: Tracking enabled via live consent.", flush=True)
                elif track_enabled is False and tracking_enabled:
                    tracking_enabled = False
                    context_poller.stop()
                    kinematic_sensor.stop()
                    print("ENGINE CMD: Tracking disabled via live consent.", flush=True)

            elif action == "shutdown":
                _shutdown()

        except zmq.Again:
            pass   # No command waiting — normal

        # ── Default output packet ─────────────────────────────────────────────
        data_out = {
            "ear":                  0,
            "mar":                  0,
            "pitch":                0,
            "yaw":                  0,
            "roll":                 0,
            "is_speaking":          False,
            "is_yawning":           False,
            "status":               "No Camera" if not camera_enabled else "Absent",
            "calibration_progress": 0,
            "is_live":              False,
            "liveness_score":       0.0,
            "liveness_status":      "No Camera" if not camera_enabled else "Pending",
            "challenge":            None,
            "camera_enabled":       camera_enabled,
        }

        # ── Camera-dependent biometric processing ─────────────────────────────
        if camera_enabled and cap is not None:
            from sensors.camera import get_biometrics
            ret, frame = cap.read()

            if not ret:
                print("DEBUG: Failed to read frame", flush=True)
                time.sleep(1)
                continue

            raw_data = get_biometrics(frame)

            if raw_data is not None:
                _absent_streak = 0

                data_out["ear"]   = round(ear_filter.filter(raw_data["ear"],   current_time), 3)
                data_out["mar"]   = round(mar_filter.filter(raw_data["mar"],   current_time), 3)
                data_out["pitch"] = round(pitch_filter.filter(raw_data["pitch"], current_time), 1)
                data_out["yaw"]   = round(yaw_filter.filter(raw_data["yaw"],   current_time), 1)
                data_out["roll"]  = round(roll_filter.filter(raw_data["roll"],  current_time), 1)

                voice_result = voice_detector.update(data_out["mar"])
                data_out["is_speaking"] = voice_result["is_speaking"]
                data_out["is_yawning"]  = voice_result["is_yawning"]

                if not calibrator.is_calibrated:
                    data_out["status"]               = "Calibrating"
                    data_out["calibration_progress"] = round(
                        calibrator.update(
                            data_out["ear"],
                            data_out["pitch"],
                            data_out["yaw"],
                        ) * 100, 1
                    )
                    data_out["liveness_status"] = "Calibrating"
                else:
                    if liveness_engine is None:
                        thresholds = calibrator.get_thresholds()
                        liveness_engine = LivenessEngine(
                            blink_threshold=thresholds["drowsy"]
                        )
                        print(
                            f"LIVENESS: Engine initialised — "
                            f"blink_threshold={thresholds['drowsy']:.3f}",
                            flush=True,
                        )

                    thresholds = calibrator.get_thresholds()

                    if data_out["ear"] < thresholds["drowsy"]:
                        _ear_consec += 1
                    else:
                        _ear_consec = 0
                    data_out["status"] = "Drowsy" if _ear_consec >= _EAR_CONSEC_THRESH else "Focused"

                    baseline_pitch = thresholds.get("baseline_pitch", 0.0)
                    baseline_yaw   = thresholds.get("baseline_yaw",   0.0)
                    yaw_dev   = abs(data_out["yaw"]   - baseline_yaw)
                    pitch_dev = abs(data_out["pitch"] - baseline_pitch)

                    if yaw_dev > _DISTRACT_ANGLE_DEG or pitch_dev > _DISTRACT_ANGLE_DEG:
                        _distract_consec += 1
                    else:
                        _distract_consec = 0

                    if _distract_consec >= _DISTRACT_CONSEC_THRESH:
                        data_out["status"] = "Distracted (Head Turn)"

                    is_live, liveness_score = liveness_engine.update(
                        ear=data_out["ear"],
                        pitch=data_out["pitch"],
                        yaw=data_out["yaw"],
                        roll=data_out["roll"],
                    )
                    data_out["is_live"]        = is_live
                    data_out["liveness_score"] = round(liveness_score, 1)
                    data_out["challenge"]      = liveness_engine.challenge_status

                    if liveness_score == 0.0:
                        data_out["liveness_status"] = "Warming Up"
                    elif is_live:
                        data_out["liveness_status"] = "Live"
                    else:
                        data_out["liveness_status"] = "Checking"

                    # Stamp attendance on the liveness engine once confirmed
                    if is_live and liveness_engine.attendance is not None:
                        data_out["attendance_stamp"] = liveness_engine.attendance

            else:
                # Face absent
                data_out["status"] = "Absent"
                _ear_consec      = 0
                _distract_consec = 0
                _absent_streak  += 1

                if liveness_engine is not None and _absent_streak >= _ABSENT_RESET_FRAMES:
                    liveness_engine.reset()
                    _absent_streak = 0
                    print("LIVENESS: Reset — face absent for too long.", flush=True)

        # ── Always-on telemetry (no camera needed) ────────────────────────────
        data_out["type"]      = "biometrics"
        data_out["timestamp"] = current_time

        if tracking_enabled:
            app_context = context_poller.get_current_state()
            cognitive_tracker.update(
                app_context.get("category", "Unknown"),
                time.monotonic(),
            )
            data_out["app_context"] = app_context
            data_out.update(cognitive_tracker.get_metrics())
            data_out["kinematic"] = kinematic_sensor.get_metrics()
        else:
            data_out["app_context"] = {
                "process": "Tracking Disabled",
                "base_app": "Tracking Disabled",
                "category": "Disabled",
                "timestamp": current_time
            }
            data_out["kinematic"] = {"apm": 0, "cadence_variance": 0.0, "is_idle": True}
            data_out["focus_score"] = 0
            data_out["fatigue_score"] = 0

        pub_socket.send_string(json.dumps(data_out))

        time.sleep(0.03)

except KeyboardInterrupt:
    _shutdown()
