import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowRight, Camera } from 'lucide-react';
import { useAnalysisStore } from '../lib/store/analysisStore';

/**
 * Non-blocking processing view (v1.3).
 *
 * The actual analysis pipeline runs in the store, not in this component.
 * This page just renders whatever state the current job is in. Tab away
 * any time — the job keeps going and the global ProcessingBanner tracks it.
 */
export function ProcessingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { currentJob, currentResult, acknowledgeJob } = useAnalysisStore();

  // If we land here with no job and no result, send the user back to capture.
  useEffect(() => {
    if (!currentJob && !currentResult) {
      navigate('/capture');
    }
  }, [currentJob, currentResult, navigate]);

  // Auto-jump to the card when a result is already available and no job is
  // running (e.g. user navigated here directly after a previous analyze).
  useEffect(() => {
    if (!currentJob && currentResult) {
      navigate('/card');
    }
  }, [currentJob, currentResult, navigate]);

  if (!currentJob) return null;

  const isAnalyze = currentJob.type === 'analyze';

  // ----- Done state -----
  if (currentJob.status === 'done') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg-primary px-8 text-center">
        <motion.div
          initial={{ scale: 0.6, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 240, damping: 18 }}
          className="w-20 h-20 rounded-full bg-accent-green/20 flex items-center justify-center mb-6"
        >
          <span className="text-3xl">✓</span>
        </motion.div>
        <p className="text-2xl font-bold text-text-primary mb-2">
          Analysis complete
        </p>
        <p className="text-text-secondary text-sm mb-8 max-w-xs">
          Your DNA Card is ready to view.
        </p>
        <button
          onClick={() => {
            acknowledgeJob();
            navigate(isAnalyze ? '/card' : '/highlight');
          }}
          className="px-6 py-3 rounded-full bg-accent-green text-bg-primary font-semibold text-sm flex items-center gap-2"
        >
          View your DNA Card
          <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  // ----- Error state -----
  if (currentJob.status === 'error') {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-bg-primary px-8 text-center">
        <div className="w-20 h-20 rounded-full bg-accent-red/20 flex items-center justify-center mb-6">
          <Camera size={28} className="text-accent-red" />
        </div>
        <p className="text-lg font-bold text-text-primary mb-2">
          Couldn&apos;t analyze that clip
        </p>
        <p className="text-text-secondary text-sm mb-8 max-w-xs">
          {currentJob.error ?? t('errors.generic')}
        </p>
        <button
          onClick={() => {
            acknowledgeJob();
            navigate('/capture');
          }}
          className="px-6 py-3 rounded-full bg-accent-green text-bg-primary font-semibold text-sm"
        >
          Try again
        </button>
      </div>
    );
  }

  // ----- Running state -----
  return (
    <div className="h-full flex flex-col items-center justify-center bg-bg-primary px-8">
      <motion.div
        className="relative w-24 h-24 mb-8"
        animate={{ rotate: 360 }}
        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
      >
        <div className="absolute inset-0 rounded-full border-4 border-accent-green/20" />
        <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-accent-green" />
        <div className="absolute inset-2 rounded-full bg-bg-card flex items-center justify-center">
          <span className="text-2xl">🏏</span>
        </div>
      </motion.div>

      <motion.p
        key={currentJob.stage}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-text-primary font-semibold text-lg mb-4 text-center"
      >
        {currentJob.stage || t('processing.analyzing')}
      </motion.p>

      <div className="w-full max-w-xs h-2 rounded-full bg-bg-card overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent-green to-accent-cyan"
          initial={{ width: '0%' }}
          animate={{ width: `${currentJob.progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <p className="text-text-muted text-sm mt-2">
        {Math.round(currentJob.progress)}%
      </p>

      <p className="text-text-muted text-xs mt-10 text-center max-w-xs">
        Feel free to switch tabs — we&apos;ll keep working in the background.
      </p>
    </div>
  );
}
