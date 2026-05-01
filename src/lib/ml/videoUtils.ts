import type { PoseLandmarker } from '@mediapipe/tasks-vision';
import type { PoseFrame } from '../types';
import { detectPoseOnFrame } from './poseDetector';

/**
 * Attach a video element to the DOM offscreen so the browser actually
 * decodes frames into it. Detached <video> elements are unreliable for
 * frame extraction on Chrome and Safari — `seeked` can fire before the
 * pixel buffer updates. Returns a cleanup function.
 */
export function attachVideoOffscreen(video: HTMLVideoElement): () => void {
  video.style.position = 'absolute';
  video.style.left = '-9999px';
  video.style.top = '-9999px';
  video.style.width = '1px';
  video.style.height = '1px';
  video.style.opacity = '0';
  video.style.pointerEvents = 'none';
  video.setAttribute('aria-hidden', 'true');
  document.body.appendChild(video);

  return () => {
    if (video.parentNode) {
      video.parentNode.removeChild(video);
    }
  };
}

/**
 * Wait for two animation frames so the browser has actually painted the
 * frame after a seek. Single rAF fires before paint in some browsers;
 * double rAF reliably guarantees the new frame is in the video element.
 */
export function waitForVideoFrame(): Promise<void> {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Seek with a timeout. Returns true on success, false on timeout.
 * Times out after `timeoutMs` so a corrupt frame can't stall the pipeline.
 */
export function seekToTime(
  video: HTMLVideoElement,
  timeSeconds: number,
  timeoutMs = 1500,
): Promise<boolean> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - timeSeconds) < 0.05) {
      resolve(true);
      return;
    }
    let done = false;
    const onSeeked = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', onSeeked);
      resolve(true);
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = timeSeconds;
    setTimeout(() => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', onSeeked);
      resolve(false);
    }, timeoutMs);
  });
}

/**
 * Detect pose with one-shot retry. If the first call returns null,
 * wait a short tick and retry. Eats most of the "intermittent miss"
 * problem caused by transient decode/render races.
 */
export async function detectPoseWithRetry(
  detector: PoseLandmarker,
  video: HTMLVideoElement,
  timestampMs: number,
): Promise<PoseFrame | null> {
  let frame = detectPoseOnFrame(detector, video, timestampMs);
  if (frame) return frame;
  // One short retry — give the renderer another tick to paint
  await new Promise<void>((resolve) => setTimeout(resolve, 33));
  frame = detectPoseOnFrame(detector, video, timestampMs + 1);
  return frame;
}

/**
 * Convenience: seek + wait for paint + detect with retry.
 * Returns null only if the seek itself timed out or detection failed twice.
 */
export async function seekAndDetect(
  detector: PoseLandmarker,
  video: HTMLVideoElement,
  timeSeconds: number,
): Promise<PoseFrame | null> {
  const ok = await seekToTime(video, timeSeconds);
  if (!ok) return null;
  await waitForVideoFrame();
  return detectPoseWithRetry(detector, video, timeSeconds * 1000);
}
