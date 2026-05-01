import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Pause, Share2, RotateCcw, Film, Activity } from 'lucide-react';
import { useAnalysisStore } from '../lib/store/analysisStore';
import type { Highlight } from '../lib/ml/highlightExtractor';
import { drawSkeleton } from '../lib/ml/poseDetector';

type Phase = 'processing' | 'reel' | 'empty' | 'error';
type CutPhase = 'playing' | 'cutting' | 'showEndCard';
type ReplayPhase = 1 | 2; // 1 = clean playback, 2 = biomechanics overlay

const FADE_OUT_MS = 180;
const BLACK_HOLD_MS = 80;
const SHOT_INTRO_MS = 1200;

interface OverlayRect {
  x: number;
  y: number;
  width: number;       // CSS px
  height: number;      // CSS px
  naturalWidth: number;  // canvas internal pixels (source video)
  naturalHeight: number;
}

const ZERO_RECT: OverlayRect = {
  x: 0,
  y: 0,
  width: 0,
  height: 0,
  naturalWidth: 0,
  naturalHeight: 0,
};

/**
 * Compute the actual video display rectangle inside its container,
 * accounting for object-contain letterbox. Returns the natural pixel
 * dimensions too — those are used as the canvas internal resolution
 * so the skeleton draws crisp at any display size.
 */
function computeDisplayRect(video: HTMLVideoElement): OverlayRect {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  if (!vw || !vh) return ZERO_RECT;

  const r = video.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return ZERO_RECT;

  const naturalAspect = vw / vh;
  const displayAspect = r.width / r.height;

  let dispW: number;
  let dispH: number;
  let offX = 0;
  let offY = 0;
  if (naturalAspect > displayAspect) {
    dispW = r.width;
    dispH = r.width / naturalAspect;
    offY = (r.height - dispH) / 2;
  } else {
    dispH = r.height;
    dispW = r.height * naturalAspect;
    offX = (r.width - dispW) / 2;
  }

  return {
    x: offX,
    y: offY,
    width: dispW,
    height: dispH,
    naturalWidth: vw,
    naturalHeight: vh,
  };
}

export function HighlightReelPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const { currentVideo, currentJob, currentReel } = useAnalysisStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number | null>(null);
  const advancingRef = useRef(false);
  const lastDrawnTsRef = useRef<number>(-1);

  const [activeIdx, setActiveIdx] = useState(0);
  const [cutPhase, setCutPhase] = useState<CutPhase>('playing');
  const [replayPhase, setReplayPhase] = useState<ReplayPhase>(1);
  const [showShotIntro, setShowShotIntro] = useState(false);
  const [paused, setPaused] = useState(false);
  const [overlayRect, setOverlayRect] = useState<OverlayRect>(ZERO_RECT);

  const highlights: Highlight[] = currentReel?.highlights ?? [];
  const topArchetype = currentReel?.topArchetype ?? null;
  const activeShot = highlights[activeIdx];
  const hasPoseData =
    !!activeShot?.poseFrames && activeShot.poseFrames.length > 0;

  // Derive page phase
  let phase: Phase = 'processing';
  if (currentReel) {
    phase = currentReel.highlights.length > 0 ? 'reel' : 'empty';
  } else if (currentJob?.type === 'highlight' && currentJob.status === 'error') {
    phase = 'error';
  } else if (currentJob?.type === 'highlight' && currentJob.status === 'running') {
    phase = 'processing';
  } else if (!currentJob && !currentReel) {
    phase = 'processing';
  }

  // Bounce back to capture if there's nothing in flight
  useEffect(() => {
    if (!currentJob && !currentReel) {
      navigate('/capture?intent=highlight');
    }
  }, [currentJob, currentReel, navigate]);

  // Seek to first segment and start playback once the reel is ready
  useEffect(() => {
    if (phase !== 'reel' || !videoRef.current || highlights.length === 0) return;
    const v = videoRef.current;
    v.currentTime = highlights[0].startTime;
    setReplayPhase(1);
    setActiveIdx(0);
    v.play().catch(() => setPaused(true));

    setShowShotIntro(true);
    const tid = window.setTimeout(() => setShowShotIntro(false), SHOT_INTRO_MS);
    return () => clearTimeout(tid);
  }, [phase, highlights]);

  // Recompute overlay rect on resize and when video metadata loads
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    const update = () => setOverlayRect(computeDisplayRect(v));
    const onLoaded = () => update();

    v.addEventListener('loadedmetadata', onLoaded);
    window.addEventListener('resize', update);
    update();

    return () => {
      v.removeEventListener('loadedmetadata', onLoaded);
      window.removeEventListener('resize', update);
    };
  }, [phase, currentVideo]);

  /**
   * Advance the segment state machine.
   *
   * Each clip plays twice:
   *   replayPhase 1 (clean) → segment ends → fade → replayPhase 2 (overlay)
   *   replayPhase 2 ends → fade → next segment, replayPhase 1
   *
   * Skips replay phase 2 if poseFrames aren't available (e.g. older saves).
   */
  const advance = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;

    setCutPhase('cutting');
    setShowShotIntro(false);

    window.setTimeout(() => {
      const v = videoRef.current;
      if (!v) {
        advancingRef.current = false;
        return;
      }

      // Phase 1 → Phase 2 of same segment (skeleton replay)
      const currentHasPose =
        !!highlights[activeIdx]?.poseFrames &&
        (highlights[activeIdx].poseFrames?.length ?? 0) > 0;

      if (replayPhase === 1 && currentHasPose) {
        v.currentTime = highlights[activeIdx].startTime;
        setReplayPhase(2);
        window.setTimeout(() => {
          setCutPhase('playing');
          v.play().catch(() => setPaused(true));
          advancingRef.current = false;
        }, BLACK_HOLD_MS);
        return;
      }

      // Phase 2 (or phase 1 with no pose data) → next segment
      const next = activeIdx + 1;
      if (next >= highlights.length) {
        v.pause();
        setPaused(true);
        setCutPhase('showEndCard');
        advancingRef.current = false;
        return;
      }

      v.currentTime = highlights[next].startTime;
      setActiveIdx(next);
      setReplayPhase(1);

      window.setTimeout(() => {
        setCutPhase('playing');
        v.play().catch(() => setPaused(true));

        setShowShotIntro(true);
        window.setTimeout(() => setShowShotIntro(false), SHOT_INTRO_MS);

        advancingRef.current = false;
      }, BLACK_HOLD_MS);
    }, FADE_OUT_MS);
  }, [activeIdx, replayPhase, highlights]);

  // RAF watcher — advance on segment-end + draw skeleton overlay during replay
  useEffect(() => {
    if (phase !== 'reel') return;

    const tick = () => {
      const v = videoRef.current;
      const seg = highlights[activeIdx];

      if (
        v &&
        seg &&
        !advancingRef.current &&
        !v.paused &&
        cutPhase === 'playing'
      ) {
        if (v.currentTime >= seg.endTime) {
          advance();
        }
      }

      // Draw the skeleton overlay during replayPhase === 2
      if (
        replayPhase === 2 &&
        canvasRef.current &&
        videoRef.current &&
        seg?.poseFrames &&
        seg.poseFrames.length > 0
      ) {
        const tSec = videoRef.current.currentTime;
        const frames = seg.poseFrames;

        // Find the closest pose frame to current playback time
        let closestIdx = 0;
        let bestDelta = Infinity;
        for (let i = 0; i < frames.length; i++) {
          const delta = Math.abs(frames[i].timestamp / 1000 - tSec);
          if (delta < bestDelta) {
            bestDelta = delta;
            closestIdx = i;
          }
        }
        const closest = frames[closestIdx];

        // Only redraw if the closest frame changed (saves work — RAF is 60fps,
        // pose data is ~3fps so this is roughly 1 redraw per 20 ticks).
        if (closest.timestamp !== lastDrawnTsRef.current) {
          lastDrawnTsRef.current = closest.timestamp;
          const canvas = canvasRef.current;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            drawSkeleton(
              ctx,
              closest.landmarks,
              canvas.width,
              canvas.height,
              '#00ff88',
              Math.max(2, canvas.width / 320),
            );
          }
        }
      } else if (replayPhase !== 2 && canvasRef.current) {
        // Clear when not in replay mode
        if (lastDrawnTsRef.current !== -1) {
          const ctx = canvasRef.current.getContext('2d');
          ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
          lastDrawnTsRef.current = -1;
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, activeIdx, replayPhase, highlights, advance, cutPhase]);

  const handleTogglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (cutPhase === 'showEndCard') {
        handleReplay();
        return;
      }
      v.play().catch(() => {});
      setPaused(false);
    } else {
      v.pause();
      setPaused(true);
    }
  };

  const handleReplay = () => {
    const v = videoRef.current;
    if (!v || highlights.length === 0) return;
    setCutPhase('playing');
    setActiveIdx(0);
    setReplayPhase(1);
    v.currentTime = highlights[0].startTime;
    v.play().catch(() => setPaused(true));
    setPaused(false);
    setShowShotIntro(true);
    window.setTimeout(() => setShowShotIntro(false), SHOT_INTRO_MS);
  };

  const handleShare = async () => {
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({
          title: 'My CricDNA Highlight Reel',
          text: `${highlights.length} shots, ${
            topArchetype ? `archetype: ${topArchetype}` : 'auto-edited reel'
          } 🏏`,
        });
      }
    } catch {
      /* user cancelled or unsupported — silent */
    }
  };

  // ---------- Render: processing ----------
  if (phase === 'processing') {
    const progress = currentJob?.progress ?? 0;
    const stage = currentJob?.stage ?? t('highlight.scanning');
    return (
      <div className="h-full flex flex-col bg-bg-primary">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 z-10">
          <button onClick={() => navigate('/feed')} className="p-2 -ml-2">
            <ArrowLeft size={24} className="text-text-primary" />
          </button>
          <h1 className="text-lg font-bold text-gradient">{t('highlight.title')}</h1>
          <div className="w-10" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <motion.div
            className="relative w-24 h-24 mb-8"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <div className="absolute inset-0 rounded-full border-4 border-accent-purple/20" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-accent-purple" />
            <div className="absolute inset-2 rounded-full bg-bg-card flex items-center justify-center">
              <Film size={26} className="text-accent-purple" />
            </div>
          </motion.div>

          <motion.p
            key={stage}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-text-primary font-semibold text-lg mb-4 text-center"
          >
            {stage}
          </motion.p>

          <div className="w-full max-w-xs h-2 rounded-full bg-bg-card overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent-purple to-accent-cyan"
              initial={{ width: '0%' }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-text-muted text-sm mt-2">{Math.round(progress)}%</p>
          <p className="text-text-muted text-xs mt-10 text-center max-w-xs">
            Feel free to switch tabs — we&apos;ll keep working in the background.
          </p>
        </div>
      </div>
    );
  }

  // ---------- Render: empty ----------
  if (phase === 'empty') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg-primary px-8 text-center">
        <Film size={48} className="text-text-muted mb-4" />
        <p className="text-text-primary font-semibold mb-2">{t('highlight.noShots')}</p>
        <p className="text-text-muted text-sm mb-6">{t('highlight.noShotsHint')}</p>
        <button
          onClick={() => navigate('/capture?intent=highlight')}
          className="px-6 py-2.5 rounded-full bg-accent-purple text-white font-semibold text-sm"
        >
          {t('highlight.newClip')}
        </button>
      </div>
    );
  }

  // ---------- Render: error ----------
  if (phase === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg-primary px-8 text-center">
        <p className="text-text-primary font-semibold mb-2">
          {currentJob?.error ?? t('errors.generic')}
        </p>
        <button
          onClick={() => navigate('/capture?intent=highlight')}
          className="mt-4 px-6 py-2.5 rounded-full bg-accent-green text-bg-primary font-semibold text-sm"
        >
          {t('highlight.newClip')}
        </button>
      </div>
    );
  }

  // ---------- Render: reel ----------
  return (
    <div className="h-full flex flex-col bg-black">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 z-30">
        <button onClick={() => navigate('/feed')} className="p-2 -ml-2">
          <ArrowLeft size={24} className="text-text-primary" />
        </button>
        <h1 className="text-lg font-bold text-gradient">{t('highlight.title')}</h1>
        <button onClick={handleShare} className="p-2 -mr-2">
          <Share2 size={20} className="text-text-secondary" />
        </button>
      </div>

      {/* Player stage */}
      <div className="relative flex-1 overflow-hidden bg-black">
        <video
          ref={videoRef}
          src={currentVideo ?? undefined}
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-contain"
          onClick={handleTogglePlay}
        />

        {/* Skeleton overlay canvas — only visible during replayPhase === 2.
            Positioned over the video's actual displayed rect (handles letterbox). */}
        <canvas
          ref={canvasRef}
          width={overlayRect.naturalWidth || 1}
          height={overlayRect.naturalHeight || 1}
          style={{
            position: 'absolute',
            left: `${overlayRect.x}px`,
            top: `${overlayRect.y}px`,
            width: `${overlayRect.width}px`,
            height: `${overlayRect.height}px`,
            pointerEvents: 'none',
            zIndex: 12,
            opacity:
              replayPhase === 2 && cutPhase === 'playing' && hasPoseData ? 1 : 0,
            transition: 'opacity 200ms',
            mixBlendMode: 'screen',
          }}
        />

        {/* Vignette */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.45) 100%)',
          }}
        />

        {/* Cut-to-black overlay */}
        <div
          className={`absolute inset-0 z-20 bg-black pointer-events-none transition-opacity ${
            cutPhase === 'cutting'
              ? 'opacity-100 duration-200'
              : cutPhase === 'showEndCard'
              ? 'opacity-100 duration-300'
              : 'opacity-0 duration-150'
          }`}
        />

        {/* Shot intro badge — only on phase 1 */}
        <AnimatePresence>
          {showShotIntro &&
            cutPhase === 'playing' &&
            replayPhase === 1 &&
            activeShot && (
              <motion.div
                key={`intro-${activeIdx}`}
                initial={{ opacity: 0, x: -50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20, transition: { duration: 0.25 } }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                className="absolute top-4 left-5 z-15 pointer-events-none"
                style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))' }}
              >
                <div className="text-7xl font-black text-text-primary leading-none tracking-tight">
                  {String(activeIdx + 1).padStart(2, '0')}
                </div>
                <div className="text-[10px] font-mono text-text-secondary mt-1 tracking-widest">
                  OF {String(highlights.length).padStart(2, '0')}
                </div>
                {activeShot.archetype && (
                  <div className="mt-3 inline-flex items-center px-2 py-1 bg-accent-green/25 border border-accent-green/50 rounded">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-accent-green">
                      {activeShot.archetype}
                    </span>
                  </div>
                )}
              </motion.div>
            )}
        </AnimatePresence>

        {/* Replay / Biomechanics badge — only on phase 2 */}
        <AnimatePresence>
          {replayPhase === 2 && cutPhase === 'playing' && hasPoseData && (
            <motion.div
              key={`replay-${activeIdx}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { duration: 0.2 } }}
              transition={{ duration: 0.3 }}
              className="absolute top-4 right-5 z-15 pointer-events-none flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent-green/15 border border-accent-green/40 backdrop-blur-sm"
              style={{ filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.8))' }}
            >
              <Activity size={12} className="text-accent-green animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-accent-green">
                Replay · Biomechanics
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Center play indicator when paused */}
        <AnimatePresence>
          {paused && cutPhase !== 'showEndCard' && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              onClick={handleTogglePlay}
              className="absolute inset-0 z-15 flex items-center justify-center"
            >
              <div className="w-20 h-20 rounded-full glass flex items-center justify-center">
                <Play size={32} className="text-text-primary ml-1" fill="currentColor" />
              </div>
            </motion.button>
          )}
        </AnimatePresence>

        {/* Bottom progress dots — show pass indicator next to active shot */}
        {cutPhase !== 'showEndCard' && (
          <div className="absolute bottom-3 inset-x-0 z-15 px-4 pointer-events-none">
            <div className="flex items-center gap-1.5">
              {highlights.map((_, i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full overflow-hidden bg-white/20"
                >
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      i < activeIdx
                        ? 'bg-accent-green/60 w-full'
                        : i === activeIdx
                        ? 'bg-accent-green ' +
                          (replayPhase === 2 ? 'w-full' : 'w-1/2')
                        : 'w-0'
                    }`}
                  />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* End card */}
        <AnimatePresence>
          {cutPhase === 'showEndCard' && (
            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              onClick={handleReplay}
              className="absolute inset-0 z-25 bg-black flex flex-col items-center justify-center px-8"
            >
              <p className="text-[10px] font-mono text-text-muted uppercase tracking-[0.3em] mb-4">
                End of reel
              </p>
              <p className="text-7xl font-black text-gradient leading-none mb-1">
                {highlights.length}
              </p>
              <p className="text-text-secondary text-xs uppercase tracking-widest mb-10">
                shots
              </p>
              {topArchetype && (
                <>
                  <p className="text-[10px] font-mono text-text-muted uppercase tracking-[0.3em] mb-2">
                    Dominant
                  </p>
                  <p className="text-2xl font-black text-text-primary mb-10">
                    {topArchetype}
                  </p>
                </>
              )}
              <div className="px-5 py-2 rounded-full border border-white/30">
                <span className="text-xs font-medium text-text-primary">
                  Tap to replay
                </span>
              </div>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom controls */}
      <div className="px-4 py-4 flex items-center gap-3 bg-bg-primary border-t border-white/5">
        <button
          onClick={handleReplay}
          className="w-12 h-12 rounded-xl bg-bg-card border border-white/5 flex items-center justify-center"
          aria-label={t('highlight.replay')}
        >
          <RotateCcw size={18} className="text-text-primary" />
        </button>
        <button
          onClick={handleTogglePlay}
          className="w-12 h-12 rounded-xl bg-bg-card border border-white/5 flex items-center justify-center"
        >
          {paused ? (
            <Play size={20} className="text-text-primary ml-0.5" fill="currentColor" />
          ) : (
            <Pause size={20} className="text-text-primary" fill="currentColor" />
          )}
        </button>
        <button
          onClick={() => navigate('/capture?intent=highlight')}
          className="flex-1 h-12 rounded-xl bg-bg-card border border-white/5 text-sm font-medium text-text-primary"
        >
          {t('highlight.newClip')}
        </button>
        <button
          onClick={handleShare}
          className="flex-1 h-12 rounded-xl bg-gradient-to-br from-accent-green to-accent-cyan text-bg-primary text-sm font-bold flex items-center justify-center gap-2"
        >
          <Share2 size={16} />
          {t('highlight.share')}
        </button>
      </div>
    </div>
  );
}
