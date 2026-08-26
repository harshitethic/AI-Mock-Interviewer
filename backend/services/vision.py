import cv2
import numpy as np

FACE = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
)

def inspect_frame(image_bytes: bytes):
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    frame = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if frame is None:
        return {"faces": -1, "signal": "invalid-frame"}

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = FACE.detectMultiScale(
        gray,
        scaleFactor=1.1,
        minNeighbors=5,
        minSize=(60, 60)
    )

    count = len(faces)
    if count == 0:
        signal = "no-face"
    elif count > 1:
        signal = "multiple-faces"
    else:
        signal = "ok"

    return {"faces": count, "signal": signal}
