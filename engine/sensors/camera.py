# engine/sensors/camera.py
from sensors.pipeline import FacePipeline
from utils.geometry import (
    calculate_ear, 
    calculate_mar, 
    get_head_pose, 
    LEFT_EYE, 
    RIGHT_EYE
)

# Initialize the pipeline ONCE
pipeline = FacePipeline()

def get_biometrics(frame):
    """
    Orchestrator:
    1. Gets Landmarks from Pipeline
    2. Calculates Math using Geometry Utils
    3. Returns Clean Dict
    """
    result = pipeline.process(frame)
    
    if result is None:
        return None

    # Unpack 5-tuple: crop dims for 2D pixel math, full dims for camera matrix
    landmarks, crop_w, crop_h, full_w, full_h = result
    
    # 1. Eyes
    left_ear = calculate_ear(landmarks, LEFT_EYE)
    right_ear = calculate_ear(landmarks, RIGHT_EYE)
    avg_ear = (left_ear + right_ear) / 2.0
    
    # 2. Mouth
    mar = calculate_mar(landmarks)

    # 3. Head Pose — full frame dims passed for accurate focal-length estimate
    pitch, yaw, roll = get_head_pose(landmarks, crop_w, crop_h, full_w, full_h)
    
    return {
        "ear": avg_ear,
        "mar": mar,
        "pitch": pitch,
        "yaw": yaw,
        "roll": roll
    }