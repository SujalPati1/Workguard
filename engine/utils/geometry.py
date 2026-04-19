# engine/utils/geometry.py
import numpy as np
import cv2

# --- CONSTANTS ---
LEFT_EYE = [362, 385, 387, 263, 373, 380]
RIGHT_EYE = [33, 160, 158, 133, 153, 144]

# New: Mouth Indices (Inner Lips)
MOUTH_INNER = [13, 312, 311, 317, 14, 87, 178, 80] # approximate inner lip ring

# 3D Model Points (Generic Human Head)
FACE_3D = np.array([
    (0.0, 0.0, 0.0),             # Nose tip
    (0.0, -330.0, -65.0),        # Chin
    (-225.0, 170.0, -135.0),     # Left eye left corner
    (225.0, 170.0, -135.0),      # Right eye right corner
    (-150.0, -150.0, -125.0),    # Left Mouth corner
    (150.0, -150.0, -125.0)      # Right mouth corner
], dtype=np.float64)

# Corresponding 2D Landmark Indices
POSE_INDICES = [1, 152, 33, 263, 61, 291]

# --- MATH FUNCTIONS ---

def calculate_ear(landmarks, eye_indices):
    """ Euclidean Eye Aspect Ratio — scale-invariant (uses normalized coords) """
    points = [np.array([landmarks[i].x, landmarks[i].y]) for i in eye_indices]
    
    # Vertical lines
    A = np.linalg.norm(points[1] - points[5])
    B = np.linalg.norm(points[2] - points[4])
    # Horizontal line
    C = np.linalg.norm(points[0] - points[3])
    
    if C == 0: return 0.0
    return (A + B) / (2.0 * C)

def calculate_mar(landmarks):
    """ Mouth Aspect Ratio — scale-invariant (uses normalized coords) """
    p13  = np.array([landmarks[13].x,  landmarks[13].y])   # Top Mid
    p14  = np.array([landmarks[14].x,  landmarks[14].y])   # Bottom Mid
    p78  = np.array([landmarks[78].x,  landmarks[78].y])   # Left Corner
    p308 = np.array([landmarks[308].x, landmarks[308].y])  # Right Corner
    
    vertical   = np.linalg.norm(p13 - p14)
    horizontal = np.linalg.norm(p78 - p308)
    
    if horizontal == 0: return 0.0
    return vertical / horizontal

def get_head_pose(landmarks, frame_w, frame_h, full_w=None, full_h=None):
    """
    Solves PnP for Head Rotation (Pitch, Yaw, Roll in degrees).

    Parameters
    ----------
    landmarks       : MediaPipe landmark list (normalized to the cropped frame).
    frame_w, frame_h: Crop frame pixel dimensions — used to project landmarks to 2D.
    full_w, full_h  : Original full-frame dimensions — used for the camera matrix
                      focal length so the pose is not distorted by the crop size.
                      Falls back to frame_w / frame_h if not provided.
    """
    # FIX: Use full frame dims for camera matrix when available.
    # Previously used crop dims, making focal length incorrect and angles inaccurate
    # when the face was close to the camera (large crop) vs far away (small crop).
    cam_w = full_w if full_w is not None else frame_w
    cam_h = full_h if full_h is not None else frame_h

    face_2d = []
    for idx in POSE_INDICES:
        lm = landmarks[idx]
        x, y = int(lm.x * frame_w), int(lm.y * frame_h)
        face_2d.append([x, y])

    face_2d = np.array(face_2d, dtype=np.float64)

    # Camera Intrinsics — focal length approximated from full frame width
    focal_length = 1 * cam_w
    cam_matrix = np.array([ 
        [focal_length, 0, cam_w / 2],
        [0, focal_length, cam_h / 2],
        [0, 0, 1]
    ])
    dist_matrix = np.zeros((4, 1), dtype=np.float64)

    success, rot_vec, trans_vec = cv2.solvePnP(FACE_3D, face_2d, cam_matrix, dist_matrix)

    if not success: return 0, 0, 0

    rmat, _ = cv2.Rodrigues(rot_vec)
    proj_matrix = np.hstack((rmat, trans_vec))
    eulerAngles = cv2.decomposeProjectionMatrix(proj_matrix)[6]
    
    return eulerAngles[0][0], eulerAngles[1][0], eulerAngles[2][0]