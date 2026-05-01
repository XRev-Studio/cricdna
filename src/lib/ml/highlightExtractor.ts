import type {
  AnalysisMode,
  Archetype,
  BattingMetrics,
  BowlingMetrics,
  PoseFrame,
} from '../types';
import { initPoseDetector } from './poseDetector';
import { attachVideoOffscreen, seekToTime, seekAndDetect } from './videoUtils';
import {
  detectBattingEvents,
  computeBattingMetrics,
  classifyBattingArchetype,
} from './battingAnalyzer';
import {
  detectBowlingEvents,
  computeBowlingMetrics,
  classifyBowlingArchetype,
} from './bowlingAnalyzer';

// MediaPipe landmark indices we use for shot detection
const NOSE = 0;
const LEFT_SHOULDER = 11;
const RIGHT_SHOULDER = 12;
const LEFT_WRIST = 15;
const RIGHT_WRIST = 16;

export interface Highlight {
  index: number;
  /** Trimmed segment start (seconds, in source video) */
  startTime: number;
  /** Trimmed segment end (seconds) */
  endTime: number;
  /** Frame-precise contact / climax time (seconds) */
  contactTime: number;
  /** Source-video duration of this clip (seconds) */
  duration: number;
  /** How strong the shot was, relative to other peaks (0–1) */
  intensity: number;
  thumbnailUrl?: string;
  metrics?: BattingMetrics | BowlingMetrics;
  archetype?: Archetype;
  /**
   * Sweep pose frames within [startTime, endTime]. Used by the reel page
   * to draw a neon skeleton overlay during the biomechanics replay pass.
   * Optional so older saves from before this field was added still work.
   */
  poseFrames?: PoseFrame[];
}

export interface HighlightReel {
  highlights: Highlight[];
  topArchetype: Archetype | null;
  totalDuration: number;
}

interface ExtractOptions {
  videoUrl: string;
  mode: AnalysisMode;
  /** Seconds of context to keep before/after the contact event. */
  preContactPad?: number;
  postContactPad?: number;
  onProgress?: (progress: number, stage: string) => void;
}

// Tuning knobs --------------------------------------------------------------

/** Initial sweep frame rate. Adapts down for long videos. */
const SWEEP_FPS_TARGET = 3;
/** Hard cap on total sweep frames so long videos don't hang. */
const MAX_SWEEP_FRAMES = 900;
/** Default seconds of context before/after contact. */
const DEFAULT_PRE_PAD = 2.0;
const DEFAULT_POST_PAD = 2.0;
/** Top N peaks taken into the reel. */
const MAX_HIGHLIGHTS = 8;
/** Minimum seconds between two accepted peaks (prevents double-counting). */
const MIN_PEAK_SPACING = 3.5;
/** Velocity must beat this percentile of all sampled velocities. */
const PEAK_VELOCITY_PERCENTILE = 0.7;
/** Min landmark visibility for a peak to be considered. */
const MIN_VISIBILITY = 0.35;
/**
 * Backlift signature window: any frame in [peak - START, peak - END]
 * where the wrist is near shoulder height counts. Window-based instead
 * of single-point so a fast swing whose lookback frame caught it
 * mid-swing doesn't get falsely rejected.
 */
const BACKLIFT_WINDOW_START = 0.6;
const BACKLIFT_WINDOW_END = 0.2;
/**
 * Wrist must be at or above shoulder line minus a small tolerance.
 * Positive value (in normalized image coords where +Y is DOWN) means
 * the wrist is allowed to dip slightly below the shoulder during the
 * lookback window — fine for a quick swing setup.
 */
const BACKLIFT_RAISE = 0.05;

// ---------------------------------------------------------------------------

/**
 * Pose-velocity-peak shot extractor.
 *
 * Phase 1: sweep pose at adaptive 3 fps across the whole video.
 * Phase 2: compute wrist velocity per sweep frame; find local maxima.
 * Phase 3: validate each peak by the cricket-shot signature — was the wrist
 *          raised above the shoulder ~0.4 s before the peak (backlift)?
 * Phase 4: greedy NMS by min-spacing + intensity, take top N.
 * Phase 5: clip ±pad seconds around each accepted peak; classify archetype
 *          using the sweep frames already captured inside the clip window.
 *
 * Reliability fixes (v1.3):
 *   - Video element attached to DOM offscreen so frames decode reliably.
 *   - Each detect call is preceded by double-rAF + single retry on null.
 */
export async function extractHighlights(
  options: ExtractOptions,
): Promise<HighlightReel> {
  const {
    videoUrl,
    mode,
    preContactPad = DEFAULT_PRE_PAD,
    postContactPad = DEFAULT_POST_PAD,
    onProgress,
  } = options;

  const report = (p: number, s: string) => onProgress?.(p, s);

  // --- Setup video element & canvas ---------------------------------------
  report(2, 'Loading your video...');
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Failed to load video'));
    video.src = videoUrl;
  });

  const duration = video.duration;
  if (!isFinite(duration) || duration < 0.5) {
    return { highlights: [], topArchetype: null, totalDuration: 0 };
  }

  // Adaptive fps: keep total sweep frames under cap
  let sweepFps = SWEEP_FPS_TARGET;
  if (sweepFps * duration > MAX_SWEEP_FRAMES) {
    sweepFps = Math.max(0.5, MAX_SWEEP_FRAMES / duration);
  }

  // Attach video offscreen so the browser actually decodes frames into it.
  const detachVideo = attachVideoOffscreen(video);

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 640;
  canvas.height = video.videoHeight || 480;
  const ctx = canvas.getContext('2d')!;

  try {
    // --- Phase 1: full-video pose sweep -----------------------------------
    report(5, 'Initializing pose detector...');
    const detector = await initPoseDetector();

    report(8, 'Watching your video...');
    const sweep: PoseFrame[] = [];
    const interval = 1 / sweepFps;
    const totalSamples = Math.max(1, Math.ceil(duration * sweepFps));
    let scanned = 0;

    for (let t = 0; t < duration; t += interval) {
      const frame = await seekAndDetect(detector, video, t);
      if (frame) sweep.push(frame);
      scanned++;
      if (scanned % 4 === 0) {
        const pct = 8 + (scanned / totalSamples) * 55;
        report(
          pct,
          `Watching ${Math.floor(t)}s / ${Math.floor(duration)}s`,
        );
      }
    }

    if (sweep.length < 8) {
      report(100, 'Done');
      return { highlights: [], topArchetype: null, totalDuration: 0 };
    }

    // --- Phase 2: wrist velocity per sweep frame --------------------------
    report(64, 'Finding the best shots...');
    const velocities = new Array<number>(sweep.length).fill(0);

    for (let i = 1; i < sweep.length; i++) {
      const prev = sweep[i - 1].landmarks;
      const curr = sweep[i].landmarks;
      if (prev.length < 33 || curr.length < 33) continue;

      const dt = (sweep[i].timestamp - sweep[i - 1].timestamp) / 1000;
      if (dt <= 0) continue;

      const wristVis = Math.max(
        curr[LEFT_WRIST]?.visibility ?? 0,
        curr[RIGHT_WRIST]?.visibility ?? 0,
      );
      if (wristVis < MIN_VISIBILITY) continue;

      const lvx = curr[LEFT_WRIST].x - prev[LEFT_WRIST].x;
      const lvy = curr[LEFT_WRIST].y - prev[LEFT_WRIST].y;
      const rvx = curr[RIGHT_WRIST].x - prev[RIGHT_WRIST].x;
      const rvy = curr[RIGHT_WRIST].y - prev[RIGHT_WRIST].y;
      const lv = Math.sqrt(lvx * lvx + lvy * lvy) / dt;
      const rv = Math.sqrt(rvx * rvx + rvy * rvy) / dt;

      velocities[i] = Math.max(lv, rv);
    }

    // Smooth (3-tap moving average) so single-frame jitter doesn't dominate
    const smoothed = velocities.map((_, i) => {
      let sum = 0;
      let n = 0;
      for (let j = Math.max(0, i - 1); j <= Math.min(velocities.length - 1, i + 1); j++) {
        sum += velocities[j];
        n++;
      }
      return n > 0 ? sum / n : 0;
    });

    // --- Phase 3: find candidate peaks ------------------------------------
    const sortedVel = [...smoothed].sort((a, b) => a - b);
    const threshold =
      sortedVel[Math.floor(sortedVel.length * PEAK_VELOCITY_PERCENTILE)] ?? 0;

    type RawPeak = { frameIdx: number; time: number; intensity: number };
    const rawPeaks: RawPeak[] = [];
    for (let i = 1; i < smoothed.length - 1; i++) {
      if (
        smoothed[i] >= threshold &&
        smoothed[i] > 0 &&
        smoothed[i] >= smoothed[i - 1] &&
        smoothed[i] >= smoothed[i + 1]
      ) {
        rawPeaks.push({
          frameIdx: i,
          time: sweep[i].timestamp / 1000,
          intensity: smoothed[i],
        });
      }
    }

    // Cricket-shot signature check (window-based): any frame in the lookback
    // window where wrist is near shoulder height passes. More permissive than
    // the previous single-point check, which was rejecting valid shots when
    // the lookback frame happened to land mid-swing.
    const validatedPeaks = rawPeaks.filter((peak) => {
      const winStart = peak.time - BACKLIFT_WINDOW_START;
      const winEnd = peak.time - BACKLIFT_WINDOW_END;
      if (winEnd < 0) return false;

      let foundBacklift = false;
      for (const f of sweep) {
        const tSec = f.timestamp / 1000;
        if (tSec < winStart) continue;
        if (tSec > winEnd) break;
        if (f.landmarks.length < 33) continue;
        const wristY = Math.min(
          f.landmarks[LEFT_WRIST].y,
          f.landmarks[RIGHT_WRIST].y,
        );
        const shoulderY = Math.min(
          f.landmarks[LEFT_SHOULDER].y,
          f.landmarks[RIGHT_SHOULDER].y,
        );
        if (wristY - shoulderY <= BACKLIFT_RAISE) {
          foundBacklift = true;
          break;
        }
      }
      if (!foundBacklift) return false;

      const peakLm = sweep[peak.frameIdx].landmarks;
      const peakVis = Math.max(
        peakLm[LEFT_WRIST]?.visibility ?? 0,
        peakLm[RIGHT_WRIST]?.visibility ?? 0,
        peakLm[NOSE]?.visibility ?? 0,
      );
      if (peakVis < MIN_VISIBILITY) return false;

      return true;
    });

    // --- Phase 4: greedy NMS by spacing + intensity -----------------------
    validatedPeaks.sort((a, b) => b.intensity - a.intensity);
    const accepted: RawPeak[] = [];
    for (const p of validatedPeaks) {
      if (accepted.length >= MAX_HIGHLIGHTS) break;
      if (accepted.every((a) => Math.abs(a.time - p.time) >= MIN_PEAK_SPACING)) {
        accepted.push(p);
      }
    }

    if (accepted.length === 0) {
      report(100, 'Done');
      return { highlights: [], topArchetype: null, totalDuration: 0 };
    }

    // Restore time-order for the reel
    accepted.sort((a, b) => a.time - b.time);

    // Normalize intensity to 0–1 for display
    const maxI = accepted.reduce((m, p) => Math.max(m, p.intensity), 0);

    // --- Phase 5: build clips, classify each using sweep frames in window -
    report(78, 'Cutting your clips...');
    const highlights: Highlight[] = [];
    const archetypes: Archetype[] = [];

    for (let i = 0; i < accepted.length; i++) {
      const peak = accepted[i];
      const startTime = Math.max(0, peak.time - preContactPad);
      const endTime = Math.min(duration, peak.time + postContactPad);
      const clipDuration = Math.max(0, endTime - startTime);

      const clipFrames = sweep.filter((f) => {
        const tSec = f.timestamp / 1000;
        return tSec >= startTime && tSec <= endTime;
      });

      let metrics: BattingMetrics | BowlingMetrics | undefined;
      let archetype: Archetype | undefined;
      if (clipFrames.length >= 5) {
        try {
          if (mode === 'bat') {
            const events = detectBattingEvents(clipFrames);
            const m = computeBattingMetrics(clipFrames, events);
            metrics = m;
            archetype = classifyBattingArchetype(m);
          } else {
            const events = detectBowlingEvents(clipFrames);
            const m = computeBowlingMetrics(clipFrames, events);
            metrics = m;
            archetype = classifyBowlingArchetype(m);
          }
        } catch {
          /* skip stats — clip still goes in the reel */
        }
      }
      if (archetype) archetypes.push(archetype);

      // Thumbnail at peak (uses the shared seek util)
      let thumbnailUrl: string | undefined;
      try {
        const ok = await seekToTime(video, peak.time);
        if (ok) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          thumbnailUrl = canvas.toDataURL('image/jpeg', 0.75);
        }
      } catch {
        /* thumbnail is optional */
      }

      highlights.push({
        index: highlights.length,
        startTime,
        endTime,
        contactTime: peak.time,
        duration: clipDuration,
        intensity: maxI > 0 ? peak.intensity / maxI : 1,
        thumbnailUrl,
        metrics,
        archetype,
        // Keep the sweep frames inside this clip so the reel can draw
        // a skeleton overlay during the biomechanics replay pass.
        poseFrames: clipFrames,
      });

      report(
        78 + ((i + 1) / accepted.length) * 18,
        `Cutting shot ${i + 1} of ${accepted.length}...`,
      );
    }

    // --- Aggregate --------------------------------------------------------
    let topArchetype: Archetype | null = null;
    if (archetypes.length > 0) {
      const counts = new Map<Archetype, number>();
      for (const a of archetypes) counts.set(a, (counts.get(a) ?? 0) + 1);
      let max = 0;
      for (const [name, c] of counts) {
        if (c > max) {
          max = c;
          topArchetype = name;
        }
      }
    }

    const totalDuration = highlights.reduce((s, h) => s + h.duration, 0);
    report(100, 'Done');
    return { highlights, topArchetype, totalDuration };
  } finally {
    detachVideo();
  }
}
