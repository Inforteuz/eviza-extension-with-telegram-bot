"""Locate a face and its upright direction, never read text or identify a person.

YuNet's eye/nose/mouth landmarks independently verify all four orientations.
Ambiguous faces or orientations are rejected rather than trusting an AI angle.
"""
import json
import math
import sys
from pathlib import Path


def upright_landmarks(face):
    x, y, w, h = (float(v) for v in face[:4])
    if min(w, h) < 40 or not .45 < w / h < 1.4:
        return False
    eyes = sorted([(float(face[4]), float(face[5])),
                   (float(face[6]), float(face[7]))])
    nose = (float(face[8]), float(face[9]))
    mouth = [(float(face[10]), float(face[11])),
             (float(face[12]), float(face[13]))]
    ey = sum(p[1] for p in eyes) / 2
    my = sum(p[1] for p in mouth) / 2
    return (all(math.isfinite(float(v)) for v in face)
            and .2*w < eyes[1][0]-eyes[0][0] < .8*w
            and abs(eyes[1][1]-eyes[0][1]) < .2*h
            and y+.12*h < ey < y+.6*h
            and ey+.04*h < nose[1] < my-.02*h
            and nose[1] < my < y+.98*h
            and eyes[0][0] < nose[0] < eyes[1][0])


def original_box(face, width, height):
    x, y, w, h = (face[k] for k in ('x', 'y', 'width', 'height'))
    return {0: (x, y, w, h), 90: (y, height-x-w, h, w),
            180: (width-x-w, height-y-h, w, h),
            270: (width-y-h, x, h, w)}[face['rotation']]


def overlap(a, b):
    ax, ay, aw, ah = a
    bx, by, bw, bh = b
    intersection = max(0, min(ax+aw, bx+bw)-max(ax, bx)) * max(
        0, min(ay+ah, by+bh)-max(ay, by))
    return intersection / (aw*ah+bw*bh-intersection)


def choose_face(matches, width, height):
    if not matches:
        return {'error': 'no_face'}
    ranked = sorted(matches, key=lambda f: f['score'], reverse=True)
    best = ranked[0]
    # YuNet can detect the same printed portrait upside down as well. Compare
    # boxes in original-image coordinates before treating them as separate faces.
    box = original_box(best, width, height)
    if any(overlap(box, original_box(f, width, height)) < .55 for f in ranked[1:]):
        return {'error': 'multiple_faces'}
    if len(ranked) > 1 and best['score']-ranked[1]['score'] < .03:
        return {'error': 'ambiguous_orientation'}
    return best


def detect(source):
    import cv2
    import numpy as np
    cv2.setNumThreads(1)
    image = cv2.imdecode(np.frombuffer(source, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None or image.shape[0] * image.shape[1] > 4000000:
        return {'error': 'invalid_image'}
    height, width = image.shape[:2]
    detector = cv2.FaceDetectorYN.create(str(Path(__file__).with_name(
        'face_detection_yunet_2023mar.onnx')), '', (320, 320), .85, .3, 500)
    matches = []
    for angle in (0, 90, 180, 270):
        detector.setInputSize((image.shape[1], image.shape[0]))
        _, faces = detector.detect(image)
        for face in [] if faces is None else faces:
            if upright_landmarks(face):
                x, y, w, h = (float(v) for v in face[:4])
                matches.append({'x': x, 'y': y, 'width': w, 'height': h,
                                'rotation': angle, 'score': float(face[-1]),
                                'detector': 'yunet'})
        image = cv2.rotate(image, cv2.ROTATE_90_CLOCKWISE)
    return choose_face(matches, width, height)


if __name__ == '__main__':
    try:
        source = sys.stdin.buffer.read(15 * 1024 * 1024 + 1)
        result = {'error': 'invalid_image'} if len(source) > 15*1024*1024 else detect(source)
    except Exception:
        result = {'error': 'detector_unavailable'}
    print(json.dumps(result))
