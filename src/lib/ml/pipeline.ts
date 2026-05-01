import type { AnalysisMode, AnalysisResult, PoseFrame } from '../types';
import { initPoseDetector, extractFramesFromVideo } from './poseDetector';
import { attachVideoOffscreen, seekAndDetect } from './videoUtils';
import {
  detectBattingEvents, computeBattingMetrics, matchProPlayers,
  diagnoseBattingWeakness, classifyBattingArchetype, computeConfidence, detectHandedness,
} from './battingAnalyzer';
import {
  detectBowlingEvents, computeBowlingMetrics, matchBowlingProPlayers,
  diagnoseBowlingWeakness, classifyBowlingArchetype,
} from './bowlingAnalyzer';
import { captureHeroFrame } from '../export/cardRenderer';

interface PipelineOptions {
  videoUrl: string;
  videoFile: File | null;
  mode: AnalysisMode;
  onProgress?: (progress: number, stage: string) => void;
}

export async function runAnalysisPipeline(options: PipelineOptions): Promise<AnalysisResult> {
  const { videoUrl, mode, onProgress } = options;
  const report = (p: number, s: string) => onProgress?.(p, s);

  // Step 1: Init detector
  report(5, 'Initializing pose detector...');
  const detector = await initPoseDetector();

  // Step 2: Load video and get frame timestamps
  report(15, 'Loading video...');
  const { video, frameTimestamps } = await extractFramesFromVideo(videoUrl, 15);

  // Attach the video to the DOM offscreen so the browser reliably decodes
  // frames into it (detached <video> elements miss frames in Chrome/Safari).
  const detachVideo = attachVideoOffscreen(video);

  try {
    // Step 3: Seek through video and detect poses frame-by-frame
    report(25, 'Detecting pose landmarks...');
    const poseFrames: PoseFrame[] = [];
    const totalFrames = frameTimestamps.length;
    let processed = 0;

    for (const ts of frameTimestamps) {
      const frame = await seekAndDetect(detector, video, ts / 1000);
      if (frame) poseFrames.push(frame);

      processed++;
      const progress = 25 + (processed / totalFrames) * 40;
      if (processed % 5 === 0) {
        report(progress, `Analyzing frame ${processed}/${totalFrames}...`);
      }
    }

    if (poseFrames.length === 0) {
      throw new Error('No poses detected in video');
    }

    // Step 4: Detect events and compute metrics
    report(70, 'Computing biomechanics...');

    const isLeftHanded = detectHandedness(poseFrames);
    let result: AnalysisResult;

    if (mode === 'bat') {
      const events = detectBattingEvents(poseFrames);
      const metrics = computeBattingMetrics(poseFrames, events);
      const proMatches = matchProPlayers(metrics);
      const weakness = diagnoseBattingWeakness(metrics);
      const archetype = classifyBattingArchetype(metrics);
      const confidence = computeConfidence(poseFrames);

      report(85, 'Finding your pro match...');

      const contactEvent = events.find((e) => e.type === 'contact');
      const heroFrameIndex = contactEvent?.frameIndex ?? Math.floor(poseFrames.length * 0.7);

      report(90, 'Creating your DNA Card...');

      const heroFrameDataUrl = await captureHeroFrame(
        video,
        poseFrames,
        heroFrameIndex,
        video.videoWidth || 640,
        video.videoHeight || 480,
      );

      result = {
        id: crypto.randomUUID(),
        mode,
        videoUrl,
        heroFrameIndex,
        heroFrameDataUrl,
        poseFrames,
        events,
        metrics,
        proMatches,
        weakness,
        archetype,
        confidence,
        isLeftHanded,
        createdAt: Date.now(),
      };
    } else {
      const events = detectBowlingEvents(poseFrames);
      const metrics = computeBowlingMetrics(poseFrames, events);
      const proMatches = matchBowlingProPlayers(metrics);
      const weakness = diagnoseBowlingWeakness(metrics);
      const archetype = classifyBowlingArchetype(metrics);
      const confidence = computeConfidence(poseFrames);

      report(85, 'Finding your pro match...');

      const releaseEvent = events.find((e) => e.type === 'contact');
      const heroFrameIndex =
        releaseEvent?.frameIndex ?? Math.floor(poseFrames.length * 0.6);

      report(90, 'Creating your DNA Card...');

      const heroFrameDataUrl = await captureHeroFrame(
        video,
        poseFrames,
        heroFrameIndex,
        video.videoWidth || 640,
        video.videoHeight || 480,
      );

      result = {
        id: crypto.randomUUID(),
        mode,
        videoUrl,
        heroFrameIndex,
        heroFrameDataUrl,
        poseFrames,
        events,
        metrics,
        proMatches,
        weakness,
        archetype,
        confidence,
        isLeftHanded,
        createdAt: Date.now(),
      };
    }

    report(100, 'Done!');
    return result;
  } finally {
    // Always remove the offscreen video to free decoder resources
    detachVideo();
  }
}
