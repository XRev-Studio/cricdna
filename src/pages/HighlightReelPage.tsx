import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Pause, Share2, RotateCcw, Film } from 'lucide-react';
import { useAnalysisStore } from '../lib/store/analysisStore';
import { extractHighlights } from '../lib/ml/highlightExtractor';
import type { Highlight } from '../lib/ml/highlightExtractor';
import type { Archetype } from '../lib/types';

type Phase = 'processing' | 'reel' | 'empty' | 'error';
type CutPhase = 'playing' | 'cutting' | 'showEndCard';

const FADE_OUT_MS = 180;
const BLACK_HOLD_MS = 80;
const SHOT_INTRO_MS = 1200;

export function HighlightReelPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ran = useRef(false);

  const { currentVideo, mode } = useAnalysisStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const rafRef = useRef<number | null>(null);
  const advancingRef = useRef(false);

  const [phase, setPhase] = useState<Phase>('processing');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [topArchetype, setTopArchetype] = useState<Archetype | null>(null);

  const [activeIdx, setActiveIdx] = useState(0);
  const [cutPhase, setCutPhase] = useState<CutPhase>('playing');
  const [showShotIntro, setShowShotIntro] = useState(false);
  const [paused, setPaused] = useState(false);

  // Run extractor once on mount
  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!currentVideo) {
      navigate('/capture?intent=highlight');
      return;
    }

    extractHighlights({
      videoUrl: currentVideo,
      mode,
      onProgress: (p, s) => {
        setProgress(p);
        setStage(s);
      },
    })
      .then(({ highlights, topArchetype }) => {
        if (highlights.length === 0) {
          setPhase('empty');
          return;
        }
        setHighlights(highlights);
        setTopArchetype(topArchetype);
        setPhase('reel');
      })
      .catch((err) => {
        console.error('Highlight extraction failed:', err);
        setPhase('error');
      });
  }, [currentVideo, mode, navigate]);

  // Seek to first segment and start playback when reel is ready
  useEffect(() => {
    if (phase !== 'reel' || !videoRef.current || highlights.length === 0) return;
    const v = videoRef.current;
    v.currentTime = highlights[0].startTime;
    v.play().catch(() => setPaused(true));

    // Show the intro badge for shot 1
    setShowShotIntro(true);
    const tid = window.setTimeout(() => setShowShotIntro(false), SHOT_INTRO_MS);
    return () => clearTimeout(tid);
  }, [phase, highlights]);

  const advance = useCallback(() => {
    if (advancingRef.current) return;
    advancingRef.current = true;

    setCutPhase('cutting');
    setShowShotIntro(false);

    // Fade to black
    window.setTimeout(() => {
      const v = videoRef.current;
      if (!v) {
        advancingRef.current = false;
        return;
      }

      const next = activeIdx + 1;
      if (next >= highlights.length) {
        // End of reel — show end card, don't auto-replay
        v.pause();
        setPaused(true);
        setCutPhase('showEndCard');
        advancingRef.current = false;
        return;
      }

      v.currentTime = highlights[next].startTime;
      setActiveIdx(next);

      // Brief moment at black to let the seek settle
      window.setTimeout(() => {
        setCutPhase('playing');
        v.play().catch(() => setPaused(true));

        // Slide in the next shot's intro badge
        setShowShotIntro(true);
        window.setTimeout(() => setShowShotIntro(false), SHOT_INTRO_MS);

        advancingRef.current = false;
      }, BLACK_HOLD_MS);
    }, FADE_OUT_MS);
  }, [activeIdx, highlights]);

  // RAF watcher: advance when current segment ends
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
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [phase, activeIdx, highlights, advance, cutPhase]);

  const handleTogglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      // If we're on the end card, replay from the start
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
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg-primary px-8">
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
          {stage || t('highlight.scanning')}
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
        <p className="text-text-primary font-semibold mb-2">{t('errors.generic')}</p>
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
  const activeShot = highlights[activeIdx];

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

        {/* Subtle vignette frame for the cinema feel */}
        <div
          className="absolute inset-0 z-10 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.45) 100%)',
          }}
        />

        {/* Cut overlay: fade-to-black between shots */}
        <div
          className={`absolute inset-0 z-20 bg-black pointer-events-none transition-opacity ${
            cutPhase === 'cutting'
              ? 'opacity-100 duration-200'
              : cutPhase === 'showEndCard'
              ? 'opacity-100 duration-300'
              : 'opacity-0 duration-150'
          }`}
        />

        {/* Shot intro badge — slides in at start of each clip */}
        <AnimatePresence>
          {showShotIntro && cutPhase === 'playing' && activeShot && (
            <motion.div
              key={activeIdx}
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

        {/* Center play indicator when paused (and not showing end card) */}
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

        {/* Bottom progress dots — hidden during end card */}
        {cutPhase !== 'showEndCard' && (
          <div className="absolute bottom-3 inset-x-0 z-15 px-4 pointer-events-none">
            <div className="flex items-center gap-1.5">
              {highlights.map((_, i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    i < activeIdx
                      ? 'bg-accent-green/60'
                      : i === activeIdx
                      ? 'bg-accent-green'
                      : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
          </div>
        )}

        {/* End card: full-screen close-out, tap to replay */}
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
