# engine/main.py
import zmq
import time
import json
import cv2
import sys
from collections import deque
from sensors.camera import get_eye_state

# --- 1. SETUP ---
context = zmq.Context()
socket = context.socket(zmq.PUB)
socket.bind("tcp://127.0.0.1:5555")

print("PYTHON_ENGINE_STARTED")
sys.stdout.flush()

# DEBUG: Tell us we are trying to open the camera
print("DEBUG: Attempting to open Webcam (Index 0)...", flush=True)
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("CRITICAL ERROR: Camera (Index 0) could not be opened!", flush=True)
    print("TIP: Check if another app (Zoom/Teams) is using it.", flush=True)
else:
    print("DEBUG: Camera opened successfully!", flush=True)

ear_buffer = deque(maxlen=15)

# --- 2. THE LOOP ---
frame_count = 0
while True:
    # DEBUG: print every 30 frames so we don't spam, but we know it's alive
    if frame_count % 30 == 0:
        print(f"DEBUG: Loop running... (Frame {frame_count})", flush=True)

    ret, frame = cap.read()
    
    if not ret:
        print("DEBUG: Failed to read frame (Camera busy or disconnected)", flush=True)
        time.sleep(1)
        continue

    current_ear = get_eye_state(frame)
    
    # ... (Your existing logic) ...
    status = "Absent"
    smoothed_ear = 0.0
    
    if current_ear is not None:
        ear_buffer.append(current_ear)
        smoothed_ear = sum(ear_buffer) / len(ear_buffer)
        if smoothed_ear < 0.20:
            status = "Drowsy/Blink"
        else:
            status = "Focused"
    else:
        ear_buffer.clear()
        status = "Absent"

    data = {
        "type": "biometrics",
        "ear": round(smoothed_ear, 3), 
        "status": status,
        "timestamp": time.time()
    }

    # DEBUG: Confirm we are sending
    # print("DEBUG: Sending ZMQ Message", flush=True) 
    socket.send_string(json.dumps(data))
    
    frame_count += 1
    time.sleep(0.05)