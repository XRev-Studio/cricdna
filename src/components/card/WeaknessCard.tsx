import type { WeaknessDiagnosis } from '../../lib/types';
import { AlertTriangle } from 'lucide-react';

export function WeaknessCard({ weakness }: { weakness: WeaknessDiagnosis }) {
  return (
    <div className="p-4 rounded-xl bg-bg-card border border-accent-orange/20">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-lg bg-accent-orange/20 flex items-center justify-center shrink-0 mt-0.5">
          <AlertTriangle size={16} className="text-accent-orange" />
        </div>
        <div className="space-y-2">
          <p className="text-sm font-bold text-accent-orange">{weakness.symptom}</p>
          <p className="text-xs text-text-secondary leading-relaxed">{weakness.mechanism}</p>
          <p className="text-xs text-text-muted leading-relaxed italic">{weakness.consequence}</p>
        </div>
      </div>
    </div>
  );
}
