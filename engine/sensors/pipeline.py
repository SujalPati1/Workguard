# engine/sensors/pipeline.py
import cv2
import mediapipe as mp
import numpy as np

class FacePipeline:
    def __init__(self):
        # 1. The Scout (Detector)
        self.face_detector = mp.solutions.face_detection.FaceDetection(
            model_selection=1, 
            min_detection_confidence=0.5
        )
        # 2. The Analyst (Mesh)
        self.face_mesh = mp.solutions.face_mesh.FaceMesh(
            max_num_faces=1,
            refine_landmarks=True,
            static_image_mode=True, 
            min_detection_confidence=0.5
        )

    def process(self, frame):
        """
        Runs the Zoom Pipeline.
        Returns: (landmarks, crop_width, crop_height) OR None
        """
        h, w, _ = frame.shape
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

        # A. Detect
        detection_results = self.face_detector.process(rgb_frame)
        if not detection_results.detections:
            return None

        # B. Smart Crop
        detection = detection_results.detections[0]
        bboxC = detection.location_data.relative_bounding_box
        x = int(bboxC.xmin * w)
        y = int(bboxC.ymin * h)
        box_w = int(bboxC.width * w)
        box_h = int(bboxC.height * h)

        padding = int(box_h * 0.2)
        crop_x1 = max(0, x - padding)
        crop_y1 = max(0, y - padding)
        crop_x2 = min(w, x + box_w + padding)
        crop_y2 = min(h, y + box_h + padding)

        cropped_frame = rgb_frame[crop_y1:crop_y2, crop_x1:crop_x2]
        if cropped_frame.size == 0: return None

        # C. Mesh Analysis
        mesh_results = self.face_mesh.process(cropped_frame)
        if not mesh_results.multi_face_landmarks:
            return None

        # Return the critical data needed for Math
        return (
            mesh_results.multi_face_landmarks[0].landmark, 
            cropped_frame.shape[1], # Crop Width
            cropped_frame.shape[0]  # Crop Height
        )