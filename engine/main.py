# engine/main.py
import zmq
import time
import json
import cv2
import sys
from sensors.camera import get_eye_state
from filters import OneEuroFilter
from calibration import CalibrationManager

# --- 1. SETUP ---
context = zmq.Context()
socket = context.socket(zmq.PUB)
socket.bind("tcp://127.0.0.1:5555")

print("PYTHON_ENGINE_STARTED")
sys.stdout.flush()

# DEBUG: Tell us we are trying to open the camera
print("DEBUG: Attempting to open Webcam (Index 0)...", flush=True)
cap = cv2.VideoCapture(0)

# Initialize the 1 Euro Filter
# min_cutoff=0.01: Very smooth when sitting still
# beta=20.0: Reacts INSTANTLY if you blink
ear_filter = OneEuroFilter(min_cutoff=0.01, beta=20.0)
calibrator = CalibrationManager(calibration_frames=90)


# --- 2. THE LOOP ---

while True:
    # DEBUG: print every 30 frames so we don't spam, but we know it's alive
    ret, frame = cap.read()
    
    if not ret:
        print("DEBUG: Failed to read frame (Camera busy or disconnected)", flush=True)
        time.sleep(1)
        continue

    # 1. Get Raw Data
    raw_ear = get_eye_state(frame)
    current_time = time.time()
    
    status = "Absent"
    smoothed_ear = 0.0
    progress = 0.0
    
    if raw_ear is not None:
        smoothed_ear = ear_filter.filter(raw_ear, current_time)
        if not calibrator.is_calibrated:
            status = "Calibrating"
            # Update Calibration
            progress = calibrator.update(smoothed_ear)
            # Send 'progress' so UI can show a loading bar
        else:
            # --- MONITORING MODE (Using Personalized Thresholds) ---
            thresholds = calibrator.get_thresholds()
            
            if smoothed_ear < thresholds["drowsy"]:
                status = "Drowsy"
            elif smoothed_ear < thresholds["blink"]:
                status = "Blinking"
            else:
                status = "Focused"
    else:
        status = "Absent"

    data = {
        "type": "biometrics",
        "ear": round(smoothed_ear, 3), 
        "status": status,
        "calibration_progress": round(progress * 100, 1),
        "timestamp": time.time()
    }

    # DEBUG: Confirm we are sending
    # print("DEBUG: Sending ZMQ Message", flush=True) 
    socket.send_string(json.dumps(data))
    
    time.sleep(0.03)