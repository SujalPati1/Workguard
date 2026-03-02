# engine/main.py
import zmq
import time
import json
import cv2
import sys
from sensors.camera import get_biometrics
from sensors.context_poller import WindowContextPoller
from models.voice_activity import VoiceActivityDetector
from filters import OneEuroFilter
from calibration import CalibrationManager

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

# --- 2. THE LOOP ---

while True:
    # DEBUG: print every 30 frames so we don't spam, but we know it's alive
    ret, frame = cap.read()
    
    if not ret:
        print("DEBUG: Failed to read frame (Camera busy or disconnected)", flush=True)
        time.sleep(1)
        continue

    # 1. Get Raw Data
    raw_data = get_biometrics(frame)
    current_time = time.time()

    data_out = {
        "ear": 0,
        "mar": 0,
        "pitch": 0,
        "yaw": 0,
        "roll": 0,
        "is_speaking": False,
        "is_yawning": False,
        "status": "Absent",
        "calibration_progress": 0
    }

    
    status = "Absent"
    smoothed_ear = 0.0
    progress = 0.0
    
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
        
        # 3. Calibration & Status Logic (Same as before)
        if not calibrator.is_calibrated:
            data_out["status"] = "Calibrating"
            data_out["calibration_progress"] = round(calibrator.update(data_out["ear"]) * 100, 1)
        else:
            thresholds = calibrator.get_thresholds()
            if data_out["ear"] < thresholds["drowsy"]:
                data_out["status"] = "Drowsy"
            else:
                data_out["status"] = "Focused"

            # 4. HEAD POSE CHECKS (Simple check for now)
            # Yaw > 20 means looking Left/Right
            # Pitch > 20 means looking Down
            if abs(data_out["yaw"]) > 25:
                data_out["status"] = "Distracted (Head Turn)"
    
        # print(voice_result)
    else:
        data_out["status"] = "Absent"

    data_out["type"] = "biometrics"
    data_out["timestamp"] = current_time
    data_out["app_context"] = context_poller.get_current_state()

    # DEBUG: Confirm we are sending
    # print("DEBUG: Sending ZMQ Message", flush=True) 
    socket.send_string(json.dumps(data_out))
    
    time.sleep(0.03)