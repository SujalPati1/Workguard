# To check your working camera index
import cv2

for i in range(5):
    cap = cv2.VideoCapture(i, cv2.CAP_MSMF)
    print(f"Index {i} opened:", cap.isOpened())
    cap.release()
