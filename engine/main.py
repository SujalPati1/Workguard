# engine/main.py
import zmq
import time
import json
import cv2
import sys
from collections import deque # The Circular Buffer DSA
from sensors.camera import get_eye_state # Import our new module

# --- 1. SETUP ---
context = zmq.Context()
socket = context.socket(zmq.PUB)
socket.bind("tcp://127.0.0.1:5555")

print("PYTHON_ENGINE_STARTED")
sys.stdout.flush()

# Initialize Webcam (Index 0 is usually the default laptop cam)
cap = cv2.VideoCapture(0)

# Initialize Circular Buffer (Smoothing)
# Stores the last 15 frames (~0.5 seconds of data)
# Industry Standard: Smooths out jitter without causing lag
ear_buffer = deque(maxlen=15)

# --- 2. THE REAL-TIME LOOP ---
while True:
    ret, frame = cap.read()
    
    if not ret:
        # Camera failed or is busy
        # Send an error status but don't crash the app
        data = {"type": "error", "message": "Camera not found"}
        socket.send_string(json.dumps(data))
        time.sleep(1)
        continue

    # A. Get Raw Data from Sensor
    current_ear = get_eye_state(frame)
    
    # B. Algorithm: Smoothing & Status Logic
    status = "Absent"
    smoothed_ear = 0.0
    
    if current_ear is not None:
        # Add to buffer
        ear_buffer.append(current_ear)
        # Calculate Average (The Smoothing)
        smoothed_ear = sum(ear_buffer) / len(ear_buffer)
        
        # Simple threshold logic (We will make this smarter later)
        # 0.20 is the biological average for "closing eyes"
        if smoothed_ear < 0.20:
            status = "Drowsy/Blink"
        else:
            status = "Focused"
    else:
        # If face is lost, clear buffer so old data doesn't mess up return
        ear_buffer.clear()
        status = "Absent"

    # C. Packaging (Optimization: Round floats to 3 decimals)
    data = {
        "type": "biometrics",
        "ear": round(smoothed_ear, 3), 
        "status": status,
        "timestamp": time.time()
    }

    # D. Send over ZeroMQ
    socket.send_string(json.dumps(data))
    
    # E. Optimization: Sleep to save CPU
    # 0.05s sleep = ~20 FPS. 
    # This reduces CPU load significantly compared to running at max speed.
    time.sleep(0.05)