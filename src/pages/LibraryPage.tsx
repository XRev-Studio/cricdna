import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FolderOpen } from 'lucide-react';
import { useAnalysisStore } from '../lib/store/analysisStore';
import { motion } from 'framer-motion';

export function LibraryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { savedResults, setCurrentResult } = useAnalysisStore();

  return (
    <div className="h-full overflow-y-auto px-4 pt-12 pb-24">
      <h1 className="text-2xl font-bold text-text-primary mb-6">{t('library.title')}</h1>

      {savedResults.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen size={48} className="text-text-muted mb-4" />
          <p className="text-text-secondary mb-4">{t('library.empty')}</p>
          <button
            onClick={() => navigate('/capture')}
            className="px-6 py-2.5 rounded-full bg-accent-green text-bg-primary font-semibold text-sm"
          >
            Record Now
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {savedResults.map((result) => (
            <motion.button
              key={result.id}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                setCurrentResult(result);
                navigate('/card');
              }}
              className="rounded-xl bg-bg-card border border-white/5 overflow-hidden text-left"
            >
              <div className="aspect-[3/4] bg-bg-elevated flex items-center justify-center">
                {result.heroFrameDataUrl ? (
                  <img src={result.heroFrameDataUrl} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl">{result.mode === 'bat' ? '🏏' : '🎳'}</span>
                )}
              </div>
              <div className="p-3">
                <p className="text-xs font-semibold text-text-primary">{result.archetype}</p>
                <p className="text-[10px] text-text-muted mt-0.5">
                  {result.confidence > 0.8 ? '🟢' : result.confidence > 0.5 ? '🟡' : '🔴'}{' '}
                  {Math.round(result.confidence * 100)}% confidence
                </p>
              </div>
            </motion.button>
          ))}
        </div>
      )}
    </div>
  );
}
