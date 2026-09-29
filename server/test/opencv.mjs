import {spawnSync} from 'node:child_process';

// Image tests run the real OpenCV pipeline; they are skipped where Python/OpenCV is missing.
export const python=process.env.PYTHON_BIN||'python3';
const probe=spawnSync(python,['-c','import cv2, numpy'],{stdio:'ignore'});
export const skipWithoutOpenCV=probe.status===0?false:`Python/OpenCV not available (${python}); set PYTHON_BIN`;
