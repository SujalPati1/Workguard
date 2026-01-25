# engine/sensors/camera.py
import cv2
import mediapipe as mp
import numpy as np

# 1. Initialize MediaPipe FaceMesh (The Model)
# We use 'refine_landmarks=True' to get the precise iris points
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    min_detection_confidence=0.5,
    min_tracking_confidence=0.5
)

# 2. Define the Eye Indices (Standard MediaPipe Landmarks)
# Left Eye: [362, 385, 387, 263, 373, 380]
# Right Eye: [33, 160, 158, 133, 153, 144]
LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]

def calculate_ear(landmarks, eye_indices):
    """
    Calculates Eye Aspect Ratio (EAR) using Euclidean distances.
    Formula: (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
    """
    # Extract the 6 coordinates for the eye
    points = [np.array([landmarks[i].x, landmarks[i].y]) for i in eye_indices]
    
    # Vertical Distances (Height of the eye opening)
    A = np.linalg.norm(points[1] - points[5])
    B = np.linalg.norm(points[2] - points[4])
    
    # Horizontal Distance (Width of the eye)
    C = np.linalg.norm(points[0] - points[3])
    
    # Prevent division by zero
    if C == 0:
        return 0.0
        
    # The Industry Standard Formula
    ear = (A + B) / (2.0 * C)
    return ear

def get_eye_state(frame):
    """
    Takes a raw image frame, detects face, and returns the Average EAR.
    Returns None if no face is found.
    """
    # Convert BGR (OpenCV format) to RGB (MediaPipe format)
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    
    # Run the Inference
    results = face_mesh.process(rgb_frame)
    
    if not results.multi_face_landmarks:
        return None # No face detected

    # Get the first face
    landmarks = results.multi_face_landmarks[0].landmark
    
    # Calculate EAR for both eyes
    left_ear = calculate_ear(landmarks, LEFT_EYE)
    right_ear = calculate_ear(landmarks, RIGHT_EYE)
    
    # Average them for stability
    avg_ear = (left_ear + right_ear) / 2.0
    return avg_ear