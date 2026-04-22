import type { Delivery } from '../types';

interface MotionSegment {
  startTime: number;
  endTime: number;
  avgMotion: number;
}

export async function detectDeliveries(
  videoUrl: string,
  onProgress?: (progress: number, stage: string) => void
): Promise<Delivery[]> {
  const report = (p: number, s: string) => onProgress?.(p, s);

  // Step 1: Load video
  report(5, 'Loading video for delivery detection...');
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.crossOrigin = 'anonymous';

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video'));
    video.src = videoUrl;
  });

  const duration = video.duration;
  const canvas = document.createElement('canvas');
  const width = 320; // Low res for speed
  const height = 180;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Pass 1: 2fps motion activity filter
  report(10, 'Pass 1: Scanning for activity...');
  const fps = 2;
  const interval = 1 / fps;
  let prevImageData: ImageData | null = null;
  const motionScores: { time: number; score: number }[] = [];

  for (let t = 0; t < duration; t += interval) {
    await seekTo(video, t);
    ctx.drawImage(video, 0, 0, width, height);
    const imageData = ctx.getImageData(0, 0, width, height);

    if (prevImageData) {
      let diff = 0;
      for (let i = 0; i < imageData.data.length; i += 4) {
        diff += Math.abs(imageData.data[i] - prevImageData.data[i]);
        diff += Math.abs(imageData.data[i + 1] - prevImageData.data[i + 1]);
        diff += Math.abs(imageData.data[i + 2] - prevImageData.data[i + 2]);
      }
      const normalizedDiff = diff / (width * height * 3);
      motionScores.push({ time: t, score: normalizedDiff });
    }
    prevImageData = imageData;

    const pass1Progress = 10 + (t / duration) * 30;
    if (Math.floor(t) % 5 === 0) report(pass1Progress, `Pass 1: Scanning ${Math.round(t)}s / ${Math.round(duration)}s`);
  }

  // Pass 2: Find activity clusters (potential deliveries)
  report(45, 'Pass 2: Detecting run-ups...');
  const avgMotion = motionScores.reduce((a, b) => a + b.score, 0) / motionScores.length;
  const threshold = avgMotion * 1.5;

  // Find segments where motion exceeds threshold
  const activeSegments: MotionSegment[] = [];
  let segStart: number | null = null;
  let segMotionSum = 0;
  let segCount = 0;

  for (const { time, score } of motionScores) {
    if (score > threshold) {
      if (segStart === null) {
        segStart = time;
        segMotionSum = 0;
        segCount = 0;
      }
      segMotionSum += score;
      segCount++;
    } else if (segStart !== null) {
      const segEnd = time;
      if (segEnd - segStart > 2) { // At least 2 seconds of activity
        activeSegments.push({
          startTime: segStart,
          endTime: segEnd,
          avgMotion: segMotionSum / segCount,
        });
      }
      segStart = null;
    }
  }

  // Pass 3: Refine delivery boundaries
  report(65, `Pass 3: Refining ${activeSegments.length} potential deliveries...`);
  const deliveries: Delivery[] = [];
  let deliveryIndex = 0;

  for (const segment of activeSegments) {
    // Expand boundaries: run-up start - 1s to follow-through + 2s
    const startTime = Math.max(0, segment.startTime - 1);
    const endTime = Math.min(duration, segment.endTime + 2);
    const contactTime = (segment.startTime + segment.endTime) / 2;

    // Capture thumbnail
    await seekTo(video, contactTime);
    ctx.drawImage(video, 0, 0, width, height);
    const thumbnailUrl = canvas.toDataURL('image/jpeg', 0.7);

    deliveries.push({
      index: deliveryIndex++,
      startTime,
      endTime,
      contactTime,
      thumbnailUrl,
    });

    report(65 + (deliveryIndex / activeSegments.length) * 25,
      `Pass 3: Processed delivery ${deliveryIndex}/${activeSegments.length}`);
  }

  // Pass 4: Merge overlapping deliveries
  report(92, 'Pass 4: Assembling clips...');
  const merged: Delivery[] = [];
  for (const d of deliveries) {
    const last = merged[merged.length - 1];
    if (last && d.startTime - last.endTime < 3) {
      last.endTime = d.endTime;
    } else {
      merged.push({ ...d, index: merged.length });
    }
  }

  report(100, `Found ${merged.length} deliveries`);
  return merged;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.1) { resolve(); return; }
    const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}
