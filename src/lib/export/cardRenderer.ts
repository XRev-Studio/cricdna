import type { PoseFrame } from '../types';
import { drawSkeleton } from '../ml/poseDetector';

export async function captureHeroFrame(
  video: HTMLVideoElement,
  poseFrames: PoseFrame[],
  heroFrameIndex: number,
  width: number,
  height: number
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;

  // Seek to hero frame time
  const heroFrame = poseFrames[heroFrameIndex] || poseFrames[0];
  if (heroFrame) {
    await new Promise<void>((resolve) => {
      const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
      video.addEventListener('seeked', onSeeked);
      video.currentTime = heroFrame.timestamp / 1000;
    });
  }

  // Draw video frame
  ctx.drawImage(video, 0, 0, width, height);

  // Draw neon skeleton overlay
  if (heroFrame && heroFrame.landmarks.length > 0) {
    drawSkeleton(ctx, heroFrame.landmarks, width, height, '#00ff88', 3);
  }

  return canvas.toDataURL('image/jpeg', 0.9);
}

export async function renderCardToCanvas(
  heroFrameDataUrl: string,
  cardWidth: number,
  cardHeight: number
): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas');
  canvas.width = cardWidth;
  canvas.height = cardHeight;
  const ctx = canvas.getContext('2d')!;

  // Draw hero frame as background
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = reject;
    img.src = heroFrameDataUrl;
  });

  ctx.drawImage(img, 0, 0, cardWidth, cardHeight);

  // Dark overlay for text readability
  const gradient = ctx.createLinearGradient(0, 0, 0, cardHeight);
  gradient.addColorStop(0, 'rgba(10, 10, 15, 0.3)');
  gradient.addColorStop(0.5, 'rgba(10, 10, 15, 0.1)');
  gradient.addColorStop(1, 'rgba(10, 10, 15, 0.8)');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, cardWidth, cardHeight);

  return canvas;
}

export function addWatermark(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.save();
  ctx.font = '12px Inter, sans-serif';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.textAlign = 'right';
  ctx.fillText('cricdna.app', width - 12, height - 12);
  ctx.restore();
}

export async function exportCardAsImage(
  heroFrameDataUrl: string,
  width: number,
  height: number
): Promise<Blob> {
  const canvas = await renderCardToCanvas(heroFrameDataUrl, width, height);
  const ctx = canvas.getContext('2d')!;
  addWatermark(ctx, width, height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}
