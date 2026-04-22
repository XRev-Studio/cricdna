import { PoseLandmarker, FilesetResolver, DrawingUtils } from '@mediapipe/tasks-vision';
import type { PoseFrame, PoseLandmark } from '../types';

let poseLandmarker: PoseLandmarker | null = null;
let initPromise: Promise<PoseLandmarker> | null = null;

export async function initPoseDetector(): Promise<PoseLandmarker> {
  if (poseLandmarker) return poseLandmarker;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm'
    );
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath:
          'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task',
        delegate: 'GPU',
      },
      runningMode: 'VIDEO',
      numPoses: 2,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
    });
    return poseLandmarker;
  })();

  return initPromise;
}

export function detectPoseOnFrame(
  detector: PoseLandmarker,
  videoElement: HTMLVideoElement,
  timestampMs: number
): PoseFrame | null {
  try {
    const result = detector.detectForVideo(videoElement, timestampMs);
    if (!result.landmarks || result.landmarks.length === 0) return null;

    const landmarks: PoseLandmark[] = result.landmarks[0].map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
      visibility: lm.visibility ?? 0,
    }));

    const worldLandmarks: PoseLandmark[] = result.worldLandmarks?.[0]?.map((lm) => ({
      x: lm.x,
      y: lm.y,
      z: lm.z,
      visibility: lm.visibility ?? 0,
    })) ?? landmarks;

    return {
      timestamp: timestampMs,
      landmarks,
      worldLandmarks,
    };
  } catch {
    return null;
  }
}

export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: PoseLandmark[],
  width: number,
  height: number,
  color = '#00ff88',
  lineWidth = 2
) {
  const connections = [
    [11, 12], [11, 13], [13, 15], [12, 14], [14, 16],
    [11, 23], [12, 24], [23, 24], [23, 25], [25, 27],
    [24, 26], [26, 28], [15, 17], [15, 19], [16, 18],
    [16, 20], [27, 29], [27, 31], [28, 30], [28, 32],
  ];

  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 8;

  for (const [i, j] of connections) {
    if (landmarks[i].visibility > 0.3 && landmarks[j].visibility > 0.3) {
      ctx.beginPath();
      ctx.moveTo(landmarks[i].x * width, landmarks[i].y * height);
      ctx.lineTo(landmarks[j].x * width, landmarks[j].y * height);
      ctx.stroke();
    }
  }

  ctx.shadowBlur = 0;
  for (let i = 0; i < landmarks.length; i++) {
    if (landmarks[i].visibility > 0.3) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(landmarks[i].x * width, landmarks[i].y * height, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

export async function extractFramesFromVideo(
  videoUrl: string,
  fps = 15,
  onProgress?: (p: number) => void
): Promise<{ video: HTMLVideoElement; frameTimestamps: number[] }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';

    video.onloadedmetadata = () => {
      const duration = video.duration;
      const interval = 1000 / fps;
      const frameTimestamps: number[] = [];
      for (let t = 0; t < duration * 1000; t += interval) {
        frameTimestamps.push(t);
      }
      resolve({ video, frameTimestamps });
    };

    video.onerror = () => reject(new Error('Failed to load video'));
    video.src = videoUrl;
  });
}

export { DrawingUtils };
