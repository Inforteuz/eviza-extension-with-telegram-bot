"""Image pipeline for the server: decode, orient, rotate, resize, crop, encode.

Uses OpenCV only (SSE3 baseline with runtime dispatch), so it runs on older
x86-64 CPUs where prebuilt libvips/sharp binaries do not. It never reads text
and never generates or edits facial pixels.

argv[1]: JSON {"steps": [...], "output": {"format": "png" | "jpeg" | "info", "quality": 95}}
stdin:   source image bytes (JPEG, PNG or WebP); EXIF orientation is applied on decode.
stdout:  encoded image, or JSON {"width", "height"} for "info".
Errors:  JSON {"error": code} on stderr and exit code 2.
"""
import json
import sys

MAX_BYTES = 15 * 1024 * 1024
MAX_PIXELS = 40_000_000


class Failure(Exception):
    pass


def run(spec, data):
    import cv2
    import numpy as np
    cv2.setNumThreads(1)
    if len(data) > MAX_BYTES:
        raise Failure('too_large')
    image = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise Failure('invalid_image')
    if image.shape[0] * image.shape[1] > MAX_PIXELS:
        raise Failure('too_many_pixels')
    for step in spec.get('steps', []):
        op = step.get('op')
        height, width = image.shape[:2]
        if op == 'rotate':
            codes = {0: None, 90: cv2.ROTATE_90_CLOCKWISE, 180: cv2.ROTATE_180, 270: cv2.ROTATE_90_COUNTERCLOCKWISE}
            if step.get('deg') not in codes:
                raise Failure('bad_request')
            if codes[step['deg']] is not None:
                image = cv2.rotate(image, codes[step['deg']])
        elif op == 'resize_inside':
            limit = int(step['max'])
            scale = min(limit / width, limit / height, 1.0)
            if scale < 1:
                size = (max(1, round(width * scale)), max(1, round(height * scale)))
                image = cv2.resize(image, size, interpolation=cv2.INTER_AREA)
        elif op == 'crop':
            left, top, w, h = (int(step[k]) for k in ('left', 'top', 'width', 'height'))
            if left < 0 or top < 0 or w < 1 or h < 1 or left + w > width or top + h > height:
                raise Failure('bad_crop')
            image = image[top:top + h, left:left + w]
        elif op == 'contain':
            # Fit the whole image into a square with white margins: no stretching, no clipping.
            size = int(step['size'])
            scale = min(size / width, size / height)
            fit = (max(1, round(width * scale)), max(1, round(height * scale)))
            resized = cv2.resize(image, fit, interpolation=cv2.INTER_AREA if scale < 1 else cv2.INTER_CUBIC)
            canvas = np.full((size, size, 3), 255, dtype=np.uint8)
            x, y = (size - fit[0]) // 2, (size - fit[1]) // 2
            canvas[y:y + fit[1], x:x + fit[0]] = resized
            image = canvas
        else:
            raise Failure('bad_request')
    output = spec.get('output', {})
    fmt = output.get('format')
    if fmt == 'info':
        return json.dumps({'width': int(image.shape[1]), 'height': int(image.shape[0])}).encode()
    if fmt == 'png':
        ok, buf = cv2.imencode('.png', image)
    elif fmt == 'jpeg':
        params = [cv2.IMWRITE_JPEG_QUALITY, int(output.get('quality', 95))]
        if hasattr(cv2, 'IMWRITE_JPEG_SAMPLING_FACTOR'):
            params += [cv2.IMWRITE_JPEG_SAMPLING_FACTOR, cv2.IMWRITE_JPEG_SAMPLING_FACTOR_444]
        ok, buf = cv2.imencode('.jpg', image, params)
    else:
        raise Failure('bad_request')
    if not ok:
        raise Failure('encode_failed')
    return buf.tobytes()


if __name__ == '__main__':
    try:
        spec = json.loads(sys.argv[1])
        data = sys.stdin.buffer.read(MAX_BYTES + 1)
        result = run(spec, data)
    except Failure as failure:
        sys.stderr.write(json.dumps({'error': str(failure)}))
        sys.exit(2)
    except ImportError:
        sys.stderr.write(json.dumps({'error': 'opencv_unavailable'}))
        sys.exit(2)
    except Exception:
        sys.stderr.write(json.dumps({'error': 'failed'}))
        sys.exit(2)
    sys.stdout.buffer.write(result)
