import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { ArrowLeft, Play, Film, Sparkles } from 'lucide-react';
import { useAnalysisStore } from '../lib/store/analysisStore';
import { detectDeliveries } from '../lib/ml/deliveryDetector';
import type { Delivery } from '../lib/types';

export function LongVideoPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ran = useRef(false);
  const { currentVideo, setCurrentVideo, mode, startAnalyzeJob } = useAnalysisStore();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [detecting, setDetecting] = useState(true);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('');
  const [showReelPrompt, setShowReelPrompt] = useState(false);

  useEffect(() => {
    if (ran.current || !currentVideo) return;
    ran.current = true;

    detectDeliveries(currentVideo, (p, s) => {
      setProgress(p);
      setStage(s);
    }).then((results) => {
      setDeliveries(results);
      setDetecting(false);
      if (results.length > 2) setShowReelPrompt(true);
    }).catch(() => {
      setDetecting(false);
    });
  }, [currentVideo]);

  const handleAnalyzeDelivery = (_delivery: Delivery) => {
    // Per-delivery sub-clip cutting is still a TODO; for now we run the
    // analyze pipeline on the full source video. The job runs in the store
    // so the user can switch tabs while it works.
    if (!currentVideo) return;
    setCurrentVideo(currentVideo);
    startAnalyzeJob({
      videoUrl: currentVideo,
      videoFile: null,
      pipelineMode: mode,
      sessionMode: 'analyze',
    });
    navigate('/processing');
  };

  if (!currentVideo) {
    navigate('/capture');
    return null;
  }

  return (
    <div className="h-full flex flex-col bg-bg-primary">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-2">
        <button onClick={() => navigate('/capture')} className="p-2 -ml-2">
          <ArrowLeft size={24} className="text-text-primary" />
        </button>
        <h1 className="text-lg font-bold text-text-primary">{t('longVideo.timeline')}</h1>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-8">
        {detecting ? (
          <div className="flex flex-col items-center justify-center py-20">
            <motion.div
              className="w-16 h-16 mb-6 rounded-full border-4 border-accent-cyan/20 border-t-accent-cyan"
              animate={{ rotate: 360 }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
            />
            <p className="text-text-primary font-semibold mb-2">{stage}</p>
            <div className="w-full max-w-xs h-2 rounded-full bg-bg-card overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-accent-cyan to-accent-green"
                animate={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-text-muted text-sm mt-2">{Math.round(progress)}%</p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="p-4 rounded-xl bg-bg-card border border-white/5 mb-4">
              <p className="text-lg font-bold text-text-primary">
                {t('longVideo.found', { count: deliveries.length })}
              </p>
            </div>

            {/* Reel prompt */}
            {showReelPrompt && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 rounded-xl bg-gradient-to-br from-accent-purple/20 to-accent-cyan/10 border border-accent-purple/20 mb-4"
              >
                <div className="flex items-center gap-3 mb-3">
                  <Sparkles size={20} className="text-accent-purple" />
                  <p className="text-sm font-semibold text-text-primary">{t('longVideo.reelPrompt')}</p>
                </div>
                <button
                  onClick={() => setShowReelPrompt(false)}
                  className="w-full py-2.5 rounded-xl bg-accent-purple text-white font-semibold text-sm flex items-center justify-center gap-2"
                >
                  <Film size={16} />
                  {t('longVideo.createReel')}
                </button>
              </motion.div>
            )}

            {/* Delivery timeline */}
            <div className="space-y-3">
              {deliveries.map((delivery) => (
                <motion.button
                  key={delivery.index}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: delivery.index * 0.05 }}
                  onClick={() => handleAnalyzeDelivery(delivery)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl bg-bg-card border border-white/5 text-left"
                >
                  {/* Thumbnail */}
                  <div className="w-16 h-12 rounded-lg overflow-hidden bg-bg-elevated shrink-0">
                    {delivery.thumbnailUrl ? (
                      <img src={delivery.thumbnailUrl} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Play size={16} className="text-text-muted" />
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-text-primary">
                      {t('longVideo.delivery', { number: delivery.index + 1 })}
                    </p>
                    <p className="text-xs text-text-muted">
                      {formatTime(delivery.startTime)} — {formatTime(delivery.endTime)}
                      {' · '}
                      {Math.round(delivery.endTime - delivery.startTime)}s
                    </p>
                  </div>

                  {/* Analyze button */}
                  <div className="px-3 py-1.5 rounded-full bg-accent-green/20 border border-accent-green/30">
                    <span className="text-xs font-semibold text-accent-green">Analyze</span>
                  </div>
                </motion.button>
              ))}
            </div>

            {deliveries.length === 0 && (
              <div className="text-center py-12">
                <p className="text-text-secondary">No deliveries detected in this video.</p>
                <p className="text-text-muted text-sm mt-1">
                  Try uploading a video with visible cricket action.
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
