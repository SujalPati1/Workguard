# engine/sensors/camera.py
import cv2
import mediapipe as mp
import numpy as np

# --- 1. SETUP THE PIPELINE ---

# A. The "Scout" (Far Range Detector)
# model_selection=1 is CRITICAL. It switches from "Selfie Mode" to "5 Meter Range Mode".
mp_face_detection = mp.solutions.face_detection
face_detector = mp_face_detection.FaceDetection(
    model_selection=1, 
    min_detection_confidence=0.5
)

# B. The "Analyst" (Face Mesh)
# We configure this to expect a 'static_image_mode=True' because we are feeding it
# cropped frames that might jump around, so we don't want it to rely on previous frame history too much.
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(
    max_num_faces=1,
    refine_landmarks=True,
    static_image_mode=True, 
    min_detection_confidence=0.5
)

# Eye Indices (Same as before)
LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]

def calculate_ear(landmarks, eye_indices):
    """ Standard EAR Formula """
    # (Same math as before, no changes needed here)
    points = [np.array([landmarks[i].x, landmarks[i].y]) for i in eye_indices]
    A = np.linalg.norm(points[1] - points[5])
    B = np.linalg.norm(points[2] - points[4])
    C = np.linalg.norm(points[0] - points[3])
    if C == 0: return 0.0
    return (A + B) / (2.0 * C)

def get_eye_state(frame):
    """
    The 'Zoom Pipeline':
    1. Detect Face (Far Model)
    2. Crop Face with Padding
    3. Run Mesh on Crop
    """
    h, w, _ = frame.shape
    rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

    # --- STEP 1: THE SCOUT (Detect Face Box) ---
    detection_results = face_detector.process(rgb_frame)

    if not detection_results.detections:
        return None # No face found even by the Long Range model

    # Get the bounding box of the first face
    detection = detection_results.detections[0]
    bboxC = detection.location_data.relative_bounding_box
    
    # Convert relative coordinates (0.0 - 1.0) to pixels
    x = int(bboxC.xmin * w)
    y = int(bboxC.ymin * h)
    box_w = int(bboxC.width * w)
    box_h = int(bboxC.height * h)

    # --- STEP 2: THE SMART CROP (Add Padding) ---
    # We add 20% padding so we don't accidentally cut off the eyebrows or chin
    padding = int(box_h * 0.2) 
    
    # Calculate crop coordinates with boundary checks (Don't go outside image)
    crop_x1 = max(0, x - padding)
    crop_y1 = max(0, y - padding)
    crop_x2 = min(w, x + box_w + padding)
    crop_y2 = min(h, y + box_h + padding)

    # Perform the Crop (Numpy Slicing)
    cropped_frame = rgb_frame[crop_y1:crop_y2, crop_x1:crop_x2]

    # Safety Check: If crop is empty or too small, abort
    if cropped_frame.size == 0:
        return None

    # --- STEP 3: THE ANALYST (Run Mesh on Crop) ---
    # Now FaceMesh sees a "Full Face" image, even if you are far away.
    mesh_results = face_mesh.process(cropped_frame)

    if not mesh_results.multi_face_landmarks:
        return None

    landmarks = mesh_results.multi_face_landmarks[0].landmark

    # --- STEP 4: CALCULATE (Ratio is invariant to Zoom) ---
    # Because EAR is a Ratio (Height / Width), it is the SAME in the crop 
    # as it would be in the full ima    ge. We don't need to do any complex math projection.
    left_ear = calculate_ear(landmarks, LEFT_EYE)
    right_ear = calculate_ear(landmarks, RIGHT_EYE)
    
    avg_ear = (left_ear + right_ear) / 2.0
    return avg_ear