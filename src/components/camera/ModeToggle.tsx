import { useTranslation } from 'react-i18next';
import { useAnalysisStore } from '../../lib/store/analysisStore';

export function ModeToggle() {
  const { t } = useTranslation();
  const { mode, setMode } = useAnalysisStore();

  return (
    <div className="glass rounded-full p-1 flex gap-1">
      <button
        onClick={() => setMode('bat')}
        className={`px-5 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${
          mode === 'bat'
            ? 'bg-accent-green text-bg-primary'
            : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        🏏 {t('capture.bat')}
      </button>
      <button
        onClick={() => setMode('bowl')}
        className={`px-5 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 ${
          mode === 'bowl'
            ? 'bg-accent-cyan text-bg-primary'
            : 'text-text-secondary hover:text-text-primary'
        }`}
      >
        🎳 {t('capture.bowl')}
      </button>
    </div>
  );
}
