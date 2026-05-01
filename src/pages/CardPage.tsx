import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ChevronUp, Save, Info } from 'lucide-react';
import { useAnalysisStore } from '../lib/store/analysisStore';
import { ShareButtons } from '../components/card/ShareButtons';
import { MetricsGrid } from '../components/card/MetricsGrid';
import { ProMatchBar } from '../components/card/ProMatchBar';
import { WeaknessCard } from '../components/card/WeaknessCard';
import { ConfidenceBadge } from '../components/card/ConfidenceBadge';
import { CricketXCTA } from '../components/card/CricketXCTA';
import type { BattingMetrics, BowlingMetrics } from '../lib/types';

export function CardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentResult, currentJob, saveResult } = useAnalysisStore();
  const [showDeepDive, setShowDeepDive] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // If there's nothing to show — no result and no running analyze job —
  // bounce back to capture. Otherwise, render whatever we've got (in-progress
  // skeleton, error, or full card).
  useEffect(() => {
    if (!currentResult && (!currentJob || currentJob.type !== 'analyze')) {
      navigate('/capture');
      return;
    }
    if (currentResult) {
      const timer = setTimeout(() => setRevealed(true), 300);
      return () => clearTimeout(timer);
    }
  }, [currentResult, currentJob, navigate]);

  // ----- In-progress state: job running, no result yet -----
  if (!currentResult && currentJob?.type === 'analyze' && currentJob.status === 'running') {
    return (
      <div className="h-full flex flex-col bg-bg-primary">
        <div className="flex items-center justify-between px-4 pt-4 pb-2 z-10">
          <button onClick={() => navigate('/feed')} className="p-2 -ml-2">
            <ArrowLeft size={24} className="text-text-primary" />
          </button>
          <h1 className="text-lg font-bold text-gradient">{t('card.yourDna')}</h1>
          <div className="w-10" />
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <motion.div
            className="relative w-20 h-20 mb-6"
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
          >
            <div className="absolute inset-0 rounded-full border-4 border-accent-green/20" />
            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-accent-green" />
          </motion.div>
          <p className="text-text-primary font-semibold text-base mb-3 text-center">
            {currentJob.stage}
          </p>
          <div className="w-full max-w-xs h-1.5 rounded-full bg-bg-card overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-accent-green to-accent-cyan"
              animate={{ width: `${currentJob.progress}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <p className="text-text-muted text-xs mt-2">{Math.round(currentJob.progress)}%</p>
          <p className="text-text-muted text-xs mt-8 text-center max-w-xs">
            Switch tabs any time — your card will be ready when you come back.
          </p>
        </div>
      </div>
    );
  }

  // ----- Error state -----
  if (!currentResult && currentJob?.type === 'analyze' && currentJob.status === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg-primary px-8 text-center">
        <p className="text-lg font-bold text-text-primary mb-2">
          Couldn&apos;t analyze that clip
        </p>
        <p className="text-text-secondary text-sm mb-8 max-w-xs">
          {currentJob.error ?? t('errors.generic')}
        </p>
        <button
          onClick={() => navigate('/capture')}
          className="px-6 py-3 rounded-full bg-accent-green text-bg-primary font-semibold text-sm"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!currentResult) return null;

  const { mode, heroFrameDataUrl, metrics, proMatches, weakness, archetype, confidence } = currentResult;
  const isBat = mode === 'bat';

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-2 z-10">
        <button onClick={() => navigate('/capture')} className="p-2 -ml-2">
          <ArrowLeft size={24} className="text-text-primary" />
        </button>
        <h1 className="text-lg font-bold text-gradient">{t('card.yourDna')}</h1>
        <button
          onClick={() => { saveResult(currentResult); }}
          className="p-2 -mr-2"
        >
          <Save size={20} className="text-text-secondary" />
        </button>
      </div>

      {/* Scrollable card content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        <AnimatePresence>
          {revealed && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            >
              {/* Hero frame with skeleton — fits portrait & landscape video */}
              <motion.div
                className="relative rounded-2xl overflow-hidden mb-4 neon-glow bg-black flex items-center justify-center"
                style={{ minHeight: '40vh', maxHeight: '55vh' }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                {heroFrameDataUrl ? (
                  <img
                    src={heroFrameDataUrl}
                    alt="Analysis frame"
                    className="max-w-full w-auto h-auto object-contain"
                    style={{ maxHeight: '55vh' }}
                  />
                ) : (
                  <span className="text-6xl">{isBat ? '🏏' : '🎳'}</span>
                )}

                {/* Archetype overlay — sits on the bottom letterbox bar */}
                <div className="absolute bottom-0 inset-x-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
                  <motion.p
                    className="text-2xl font-black text-gradient"
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.8 }}
                  >
                    {archetype}
                  </motion.p>
                  <ConfidenceBadge confidence={confidence} />
                </div>
              </motion.div>

              {/* Metrics */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.5 }}
              >
                <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3">
                  {t('card.metrics')}
                </h2>
                <MetricsGrid metrics={metrics} mode={mode} />
              </motion.div>

              {/* Pro Match */}
              <motion.div
                className="mt-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3">
                  {t('card.proMatch')}
                </h2>
                <ProMatchBar matches={proMatches} />
              </motion.div>

              {/* Weakness */}
              <motion.div
                className="mt-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
              >
                <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3">
                  {t('card.weakness')}
                </h2>
                <WeaknessCard weakness={weakness} />
              </motion.div>

              {/* CricketX CTA */}
              <motion.div
                className="mt-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.1 }}
              >
                <CricketXCTA weakness={weakness} />
              </motion.div>

              {/* Share */}
              <motion.div
                className="mt-6"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.3 }}
              >
                <h2 className="text-sm font-bold text-text-secondary uppercase tracking-wider mb-3">
                  {t('card.share')}
                </h2>
                <ShareButtons heroFrameDataUrl={heroFrameDataUrl || ''} />
              </motion.div>

              {/* Deep dive toggle */}
              <motion.button
                className="mt-8 w-full flex items-center justify-center gap-2 py-3 text-text-muted text-sm"
                onClick={() => setShowDeepDive(!showDeepDive)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
              >
                <ChevronUp
                  size={16}
                  className={`transition-transform ${showDeepDive ? 'rotate-180' : ''}`}
                />
                {t('card.deepDive')}
              </motion.button>

              {/* Deep dive content */}
              <AnimatePresence>
                {showDeepDive && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="py-4 space-y-4">
                      <h3 className="text-lg font-bold text-text-primary">Detailed Breakdown</h3>
                      {isBat ? (
                        <BattingDeepDive metrics={metrics as BattingMetrics} />
                      ) : (
                        <BowlingDeepDive metrics={metrics as BowlingMetrics} />
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function BattingDeepDive({ metrics }: { metrics: BattingMetrics }) {
  const { t } = useTranslation();
  const items = [
    { key: 'stanceWidth', value: `${metrics.stanceWidth}x hip width`, optimal: '1.0–1.3x' },
    { key: 'backliftAngle', value: `${metrics.backliftAngle}°`, optimal: '120°–140°' },
    { key: 'headPosition', value: `${metrics.headPosition > 0 ? '+' : ''}${metrics.headPosition}mm offset`, optimal: '±3mm' },
    { key: 'frontKneeAngle', value: `${metrics.frontKneeAngle}°`, optimal: '155°–170°' },
    { key: 'batSwingPlane', value: `${metrics.batSwingPlane}°`, optimal: '35°–50°' },
    { key: 'followThroughExtension', value: `${metrics.followThroughExtension}%`, optimal: '20%+' },
  ];

  return (
    <div className="space-y-3">
      {items.map(({ key, value, optimal }) => (
        <div key={key} className="p-3 rounded-xl bg-bg-card border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-text-primary">{t(`metrics.${key}`)}</span>
            <span className="text-sm font-mono text-accent-green">{value}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-muted">Optimal: {optimal}</span>
            <button className="ml-auto">
              <Info size={12} className="text-text-muted" />
            </button>
          </div>
          <p className="text-xs text-text-muted mt-1">{t(`info.${key}`)}</p>
        </div>
      ))}
    </div>
  );
}

function BowlingDeepDive({ metrics }: { metrics: BowlingMetrics }) {
  const { t } = useTranslation();
  const items = [
    { key: 'releaseHeight', value: `${metrics.releaseHeight}%`, optimal: '85%+' },
    { key: 'actionType', value: metrics.actionType, optimal: 'Side-on or Front-on' },
    { key: 'estimatedSpeed', value: `${metrics.estimatedSpeed} km/h`, optimal: 'Varies by type' },
    { key: 'seamAngle', value: `${metrics.seamAngle}°`, optimal: '70°–90°' },
    { key: 'runUpRhythm', value: `${metrics.runUpRhythm}%`, optimal: '80%+' },
  ];

  return (
    <div className="space-y-3">
      {items.map(({ key, value, optimal }) => (
        <div key={key} className="p-3 rounded-xl bg-bg-card border border-white/5">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-text-primary">{t(`metrics.${key}`)}</span>
            <span className="text-sm font-mono text-accent-cyan">{value}</span>
          </div>
          <span className="text-xs text-text-muted">Optimal: {optimal}</span>
          <p className="text-xs text-text-muted mt-1">{t(`info.${key}`)}</p>
        </div>
      ))}
      {/* Injury risk flags */}
      <div className="p-3 rounded-xl bg-bg-card border border-accent-red/20">
        <h4 className="text-sm font-semibold text-accent-red mb-2">{t('metrics.injuryRisk')}</h4>
        <div className="space-y-1">
          {[
            { label: 'Back hyperextension', flagged: metrics.injuryRisk.backHyperextension },
            { label: 'Front knee stress', flagged: metrics.injuryRisk.kneeStress },
            { label: 'Shoulder overload', flagged: metrics.injuryRisk.shoulderLoad },
          ].map(({ label, flagged }) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${flagged ? 'bg-accent-red' : 'bg-accent-green'}`} />
              <span className={`text-xs ${flagged ? 'text-accent-red' : 'text-text-muted'}`}>{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
