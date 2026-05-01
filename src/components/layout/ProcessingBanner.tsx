import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Film, Sparkles, X } from 'lucide-react';
import { useAnalysisStore } from '../../lib/store/analysisStore';

/**
 * Global progress strip that sits above the BottomNav.
 *
 * - Hidden when there is no current job.
 * - While running: shows progress %, stage text, animated bar.
 * - When done: shows "Done — tap to view" with a green pulsing dot.
 * - When error: shows the error and a dismiss button.
 *
 * Tapping the strip navigates to the destination page (or stays put if you're
 * already there). The X button dismisses without navigating.
 */
export function ProcessingBanner() {
  const navigate = useNavigate();
  const location = useLocation();
  const { currentJob, acknowledgeJob } = useAnalysisStore();

  if (!currentJob) return null;

  const targetRoute =
    currentJob.type === 'highlight' ? '/highlight' : '/card';
  const inProgressRoute =
    currentJob.type === 'highlight' ? '/highlight' : '/processing';
  const isOnDestination =
    location.pathname === targetRoute ||
    location.pathname === inProgressRoute;

  const handleClick = () => {
    if (currentJob.status === 'done') {
      navigate(targetRoute);
      acknowledgeJob();
      return;
    }
    if (currentJob.status === 'error') {
      // Tapping an error banner sends you back to capture
      navigate('/capture');
      acknowledgeJob();
      return;
    }
    // Running — jump to the in-progress view if we're not already there
    if (!isOnDestination) navigate(inProgressRoute);
  };

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation();
    acknowledgeJob();
  };

  return (
    <AnimatePresence>
      <motion.button
        key="banner"
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 60, opacity: 0 }}
        transition={{ type: 'spring', stiffness: 400, damping: 36 }}
        onClick={handleClick}
        className="relative w-full flex items-center gap-3 px-4 py-2.5 bg-bg-secondary/95 backdrop-blur-md border-t border-white/5 text-left"
      >
        {/* Icon */}
        <div
          className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${
            currentJob.status === 'error'
              ? 'bg-accent-red/20'
              : currentJob.type === 'highlight'
              ? 'bg-accent-purple/20'
              : 'bg-accent-green/20'
          }`}
        >
          {currentJob.type === 'highlight' ? (
            <Film
              size={18}
              className={
                currentJob.status === 'error'
                  ? 'text-accent-red'
                  : 'text-accent-purple'
              }
            />
          ) : (
            <Sparkles
              size={18}
              className={
                currentJob.status === 'error'
                  ? 'text-accent-red'
                  : 'text-accent-green'
              }
            />
          )}
        </div>

        {/* Text + progress */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-text-primary truncate">
              {currentJob.status === 'done'
                ? 'Done'
                : currentJob.status === 'error'
                ? 'Something went wrong'
                : currentJob.type === 'highlight'
                ? 'Cutting your reel'
                : 'Analyzing your technique'}
            </p>
            {currentJob.status === 'running' && (
              <span className="text-xs font-mono text-text-muted">
                {Math.round(currentJob.progress)}%
              </span>
            )}
            {currentJob.status === 'done' && (
              <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-accent-green">
                <span className="w-1.5 h-1.5 rounded-full bg-accent-green animate-pulse" />
                tap to view
              </span>
            )}
          </div>
          <p className="text-xs text-text-muted truncate">
            {currentJob.status === 'error'
              ? currentJob.error ?? 'Please try again'
              : currentJob.stage}
          </p>

          {/* Progress bar */}
          {currentJob.status === 'running' && (
            <div className="mt-1.5 h-1 rounded-full bg-bg-card overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${
                  currentJob.type === 'highlight'
                    ? 'bg-gradient-to-r from-accent-purple to-accent-cyan'
                    : 'bg-gradient-to-r from-accent-green to-accent-cyan'
                }`}
                initial={{ width: '0%' }}
                animate={{ width: `${currentJob.progress}%` }}
                transition={{ duration: 0.25 }}
              />
            </div>
          )}
        </div>

        {/* Dismiss */}
        <button
          onClick={handleDismiss}
          className="shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-text-muted hover:bg-white/5"
          aria-label="Dismiss"
        >
          <X size={16} />
        </button>
      </motion.button>
    </AnimatePresence>
  );
}
