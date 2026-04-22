import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useAnalysisStore } from '../lib/store/analysisStore';
import { runAnalysisPipeline } from '../lib/ml/pipeline';

export function ProcessingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ran = useRef(false);
  const {
    currentVideo,
    currentVideoFile,
    mode,
    isProcessing,
    processingProgress,
    processingStage,
    setProcessing,
    setProgress,
    setCurrentResult,
  } = useAnalysisStore();

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    if (!currentVideo) {
      navigate('/capture');
      return;
    }

    setProcessing(true, t('processing.extracting'));

    runAnalysisPipeline({
      videoUrl: currentVideo,
      videoFile: currentVideoFile,
      mode,
      onProgress: (progress, stage) => setProgress(progress, stage),
    })
      .then((result) => {
        setCurrentResult(result);
        setProcessing(false);
        navigate('/card');
      })
      .catch((err) => {
        console.error('Pipeline failed:', err);
        setProcessing(false);
        setCurrentResult({
          id: crypto.randomUUID(),
          mode,
          videoUrl: currentVideo,
          heroFrameIndex: 0,
          poseFrames: [],
          events: [],
          metrics: mode === 'bat'
            ? { stanceWidth: 0, backliftAngle: 0, headPosition: 0, frontKneeAngle: 0, batSwingPlane: 0, followThroughExtension: 0 }
            : { releaseHeight: 0, actionType: 'front-on' as const, estimatedSpeed: 0, seamAngle: 0, injuryRisk: { backHyperextension: false, kneeStress: false, shoulderLoad: false }, runUpRhythm: 0 },
          proMatches: [{ name: 'Unknown', similarity: 0 }],
          weakness: { symptom: 'Analysis incomplete', mechanism: 'Video quality may be insufficient', consequence: 'Try recording with better lighting and full body visible', cricketXDrill: 'basics' },
          archetype: 'The Improviser',
          confidence: 0.2,
          isLeftHanded: false,
          createdAt: Date.now(),
        });
        navigate('/card');
      });
  }, []);

  return (
    <div className="h-full flex flex-col items-center justify-center bg-bg-primary px-8">
      {/* Animated cricket ball spinner */}
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

      {/* Stage text */}
      <motion.p
        key={processingStage}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-text-primary font-semibold text-lg mb-4 text-center"
      >
        {processingStage || t('processing.analyzing')}
      </motion.p>

      {/* Progress bar */}
      <div className="w-full max-w-xs h-2 rounded-full bg-bg-card overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-accent-green to-accent-cyan"
          initial={{ width: '0%' }}
          animate={{ width: `${processingProgress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
      <p className="text-text-muted text-sm mt-2">{Math.round(processingProgress)}%</p>
    </div>
  );
}
