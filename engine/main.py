# engine/main.py
import zmq
import time
import json
import signal
import cv2
import sys
from sensors.camera import get_biometrics
from sensors.context_poller import WindowContextPoller
from sensors.kinematics import KinematicSensor
from models.voice_activity import VoiceActivityDetector
from models.liveness import LivenessEngine          # ← added missing import
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

# ── Graceful shutdown ─────────────────────────────────────────────────────────
def _shutdown(sig=None, frame=None):
    """Release resources and exit cleanly on SIGINT / SIGTERM."""
    print("ENGINE: Shutting down gracefully...", flush=True)
    try:
        cap.release()
    except Exception:
        pass
    try:
        socket.close()
        context.term()
    except Exception:
        pass
    sys.exit(0)

signal.signal(signal.SIGINT,  _shutdown)
signal.signal(signal.SIGTERM, _shutdown)

# ── 1-Euro filters ────────────────────────────────────────────────────────────
# min_cutoff=0.01 → very smooth at rest
# beta=20.0       → reacts instantly to fast events (blink, head snap)
ear_filter   = OneEuroFilter(min_cutoff=0.01, beta=20.0)
mar_filter   = OneEuroFilter(min_cutoff=0.01, beta=20.0)
pitch_filter = OneEuroFilter(min_cutoff=0.1,  beta=10.0)
yaw_filter   = OneEuroFilter(min_cutoff=0.1,  beta=10.0)
roll_filter  = OneEuroFilter(min_cutoff=0.1,  beta=10.0)

calibrator = CalibrationManager(calibration_frames=90)

# Liveness engine — created AFTER calibration so it can use the personal
# blink threshold; starts as None.
liveness_engine: LivenessEngine | None = None

# Consecutive absent-frame counter used to reset liveness when face is lost
_absent_streak = 0
_ABSENT_RESET_FRAMES = 30   # ~1 s at 30 fps → reset liveness if face gone

# ── Drowsiness frame counter ──────────────────────────────────────────────────
# FIX: Require 15 consecutive frames below EAR threshold before flagging Drowsy.
# This prevents a normal slow blink from triggering a false Drowsy alert.
_ear_consec        = 0
_EAR_CONSEC_THRESH = 15    # ~0.5 s at 30 fps

# ── Distraction frame counter ──────────────────────────────────────────────────
# FIX: Require 30 consecutive frames of head deviation before flagging Distracted.
# Also now checks BOTH Yaw (looking sideways) and Pitch (looking down at phone).
# Uses calibrated personal baseline so we measure deviation, not absolute angle.
_distract_consec        = 0
_DISTRACT_CONSEC_THRESH = 30    # ~1 s at 30 fps
_DISTRACT_ANGLE_DEG     = 15.0  # degrees deviation from personal baseline

# Start context poller on its own daemon thread (1 Hz, Windows-only)
context_poller = WindowContextPoller(poll_interval=1.0)
context_poller.start()

# Kinematic Input Entropy Sensor (keyboard + mouse rhythm telemetry)
kinematic_sensor = KinematicSensor()
kinematic_sensor.start()

# Cognitive strain & flow tracker
cognitive_tracker = CognitiveTracker()

# ─────────────────────────────────────────────────────────────────────────────
# 2. MAIN LOOP
# ─────────────────────────────────────────────────────────────────────────────
try:
    while True:
        ret, frame = cap.read()

        if not ret:
            print("DEBUG: Failed to read frame (Camera busy or disconnected)", flush=True)
            time.sleep(1)
            continue

        raw_data     = get_biometrics(frame)
        current_time = time.time()

        # ── Default output packet ─────────────────────────────────────────────────
        data_out = {
            "ear":                  0,
            "mar":                  0,
            "pitch":                0,
            "yaw":                  0,
            "roll":                 0,
            "is_speaking":          False,
            "is_yawning":           False,
            "status":               "Absent",
            "calibration_progress": 0,
            # Liveness fields (always present so consumers never KeyError)
            "is_live":              False,
            "liveness_score":       0.0,
            "liveness_status":      "Pending",   # human-readable liveness state
            "challenge":            None         # challenge state
        }

        # ─────────────────────────────────────────────────────────────────────────
        # A) FACE DETECTED
        # ─────────────────────────────────────────────────────────────────────────
        if raw_data is not None:
            _absent_streak = 0      # reset the absence counter

            # 2. Filter ALL signals
            data_out["ear"]   = round(ear_filter.filter(raw_data["ear"],   current_time), 3)
            data_out["mar"]   = round(mar_filter.filter(raw_data["mar"],   current_time), 3)
            data_out["pitch"] = round(pitch_filter.filter(raw_data["pitch"], current_time), 1)
            data_out["yaw"]   = round(yaw_filter.filter(raw_data["yaw"],   current_time), 1)
            data_out["roll"]  = round(roll_filter.filter(raw_data["roll"],  current_time), 1)

            voice_result = voice_detector.update(data_out["mar"])
            data_out["is_speaking"] = voice_result["is_speaking"]
            data_out["is_yawning"]  = voice_result["is_yawning"]

            # DEBUG: watch MAR and detection state in terminal (comment out when happy)
            print(
                f"MAR={data_out['mar']:.3f}  EAR={data_out['ear']:.3f}  "
                f"Yawn={voice_result['is_yawning']}  Speak={voice_result['is_speaking']}  "
                f"Pitch={data_out['pitch']:.1f}  Yaw={data_out['yaw']:.1f}",
                flush=True
            )

            # 3. Calibration & status logic
            if not calibrator.is_calibrated:
                data_out["status"]               = "Calibrating"
                data_out["calibration_progress"] = round(
                    # FIX: Pass pitch & yaw so the calibrator learns the user's
                    # personal head pose baseline during the warm-up phase.
                    calibrator.update(
                        data_out["ear"],
                        data_out["pitch"],
                        data_out["yaw"],
                    ) * 100, 1
                )
                data_out["liveness_status"] = "Calibrating"

            else:
                # ── Initialise liveness engine once, immediately after calibration ──
                if liveness_engine is None:
                    thresholds    = calibrator.get_thresholds()
                    liveness_engine = LivenessEngine(
                        blink_threshold=thresholds["drowsy"]
                    )
                    print(
                        f"LIVENESS: Engine initialised — "
                        f"blink_threshold={thresholds['drowsy']:.3f}",
                        flush=True,
                    )

                thresholds = calibrator.get_thresholds()

                # ── Drowsiness / focus status (15-frame consecutive buffer) ────
                # FIX: The counter must stay above threshold for 15 straight frames
                # (~0.5 s) before status flips to Drowsy, preventing false alerts
                # from natural blinks or a momentary squint.
                if data_out["ear"] < thresholds["drowsy"]:
                    _ear_consec += 1
                else:
                    _ear_consec = 0

                data_out["status"] = "Drowsy" if _ear_consec >= _EAR_CONSEC_THRESH else "Focused"

                # ── Head-pose distraction check (Yaw + Pitch, 15°, 30-frame) ─────
                # FIX 1: Now checks BOTH yaw (looking left/right) AND pitch
                #         (looking down at a phone / keyboard).
                # FIX 2: Measures deviation from the user's personal calibrated
                #         baseline instead of an arbitrary absolute angle.
                # FIX 3: 30-frame buffer prevents quick glances from firing alerts.
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

                # ── Liveness update ──────────────────────────────────────────────
                is_live, liveness_score = liveness_engine.update(
                    ear=data_out["ear"],
                    pitch=data_out["pitch"],
                    yaw=data_out["yaw"],
                    roll=data_out["roll"],   # roll passed for richer scoring
                )
                data_out["is_live"]        = is_live
                data_out["liveness_score"] = round(liveness_score, 1)
                data_out["challenge"]      = liveness_engine.challenge_status
                
                # Human-readable liveness state
                if liveness_score == 0.0:
                    data_out["liveness_status"] = "Warming Up"
                elif is_live:
                    data_out["liveness_status"] = "Live"
                else:
                    data_out["liveness_status"] = "Checking"

        # ─────────────────────────────────────────────────────────────────────────
        # B) FACE ABSENT
        # ─────────────────────────────────────────────────────────────────────────
        else:
            data_out["status"] = "Absent"

            # FIX: Reset both detection counters so stale counts never carry over
            # into the next session when the face returns to frame.
            _ear_consec      = 0
            _distract_consec = 0

            _absent_streak += 1
            if liveness_engine is not None and _absent_streak >= _ABSENT_RESET_FRAMES:
                liveness_engine.reset()
                _absent_streak = 0
                print("LIVENESS: Reset — face absent for too long.", flush=True)

        # ── Finalise packet ───────────────────────────────────────────────────────
        data_out["type"]      = "biometrics"
        data_out["timestamp"] = current_time

        # Context & cognitive metrics (unchanged)
        app_context = context_poller.get_current_state()
        cognitive_tracker.update(
            app_context.get("category", "Unknown"),
            time.monotonic(),   # monotonic for duration arithmetic only
        )
        data_out["app_context"] = app_context
        data_out.update(cognitive_tracker.get_metrics())

        # Neuromotor entropy — keyboard/mouse rhythm telemetry (privacy-safe)
        data_out["kinematic"] = kinematic_sensor.get_metrics()

        # DEBUG: Confirm we are sending
        # print("DEBUG: Sending ZMQ Message", flush=True)
        socket.send_string(json.dumps(data_out))

        time.sleep(0.03)

except KeyboardInterrupt:
    _shutdown()
