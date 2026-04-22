import type { ShareFormat } from '../types';
import { SHARE_FORMATS } from '../types';
import { renderCardToCanvas, addWatermark } from './cardRenderer';

export async function exportForPlatform(
  heroFrameDataUrl: string,
  platform: 'instagram' | 'whatsapp' | 'tiktok'
): Promise<Blob> {
  const format = SHARE_FORMATS[platform];
  const canvas = await renderCardToCanvas(heroFrameDataUrl, format.width, format.height);
  const ctx = canvas.getContext('2d')!;
  addWatermark(ctx, format.width, format.height);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), 'image/png');
  });
}

export async function shareToplatform(
  heroFrameDataUrl: string,
  platform: 'instagram' | 'whatsapp' | 'tiktok'
): Promise<void> {
  const blob = await exportForPlatform(heroFrameDataUrl, platform);
  const file = new File([blob], `cricdna-${platform}.png`, { type: 'image/png' });

  if (navigator.share && navigator.canShare?.({ files: [file] })) {
    await navigator.share({
      title: 'My CricDNA Card',
      text: 'Check out my cricket technique analysis! 🏏',
      files: [file],
    });
  } else {
    // Fallback: download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cricdna-${platform}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }
}

export function downloadCard(heroFrameDataUrl: string, filename = 'cricdna-card.png') {
  const a = document.createElement('a');
  a.href = heroFrameDataUrl;
  a.download = filename;
  a.click();
}
