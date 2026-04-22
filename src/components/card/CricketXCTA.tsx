import { useTranslation } from 'react-i18next';
import { Gamepad2, ArrowRight } from 'lucide-react';
import type { WeaknessDiagnosis } from '../../lib/types';

export function CricketXCTA({ weakness }: { weakness: WeaknessDiagnosis }) {
  const { t } = useTranslation();

  return (
    <div className="p-4 rounded-2xl bg-gradient-to-br from-accent-purple/20 to-accent-cyan/10 border border-accent-purple/20">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-accent-purple/20 flex items-center justify-center">
          <Gamepad2 size={24} className="text-accent-purple" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-text-primary">{t('card.cricketxCta')}</p>
          <p className="text-xs text-text-muted mt-0.5">
            {t('card.cricketxSubtext', { weakness: weakness.symptom.toLowerCase() })}
          </p>
        </div>
        <ArrowRight size={20} className="text-accent-purple" />
      </div>
    </div>
  );
}
