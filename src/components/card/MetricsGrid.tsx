import { useTranslation } from 'react-i18next';
import type { AnalysisMode, BattingMetrics, BowlingMetrics } from '../../lib/types';

interface Props {
  metrics: BattingMetrics | BowlingMetrics;
  mode: AnalysisMode;
}

export function MetricsGrid({ metrics, mode }: Props) {
  const { t } = useTranslation();

  const items = mode === 'bat'
    ? [
        { key: 'stanceWidth', value: `${(metrics as BattingMetrics).stanceWidth}x`, unit: 'hip width' },
        { key: 'backliftAngle', value: `${(metrics as BattingMetrics).backliftAngle}°`, unit: '' },
        { key: 'headPosition', value: `${(metrics as BattingMetrics).headPosition > 0 ? '+' : ''}${(metrics as BattingMetrics).headPosition}`, unit: 'mm' },
        { key: 'frontKneeAngle', value: `${(metrics as BattingMetrics).frontKneeAngle}°`, unit: '' },
        { key: 'batSwingPlane', value: `${(metrics as BattingMetrics).batSwingPlane}°`, unit: '' },
        { key: 'followThroughExtension', value: `${(metrics as BattingMetrics).followThroughExtension}`, unit: '%' },
      ]
    : [
        { key: 'releaseHeight', value: `${(metrics as BowlingMetrics).releaseHeight}`, unit: '%' },
        { key: 'actionType', value: (metrics as BowlingMetrics).actionType, unit: '' },
        { key: 'estimatedSpeed', value: `${(metrics as BowlingMetrics).estimatedSpeed}`, unit: 'km/h' },
        { key: 'seamAngle', value: `${(metrics as BowlingMetrics).seamAngle}°`, unit: '' },
        { key: 'runUpRhythm', value: `${(metrics as BowlingMetrics).runUpRhythm}`, unit: '%' },
      ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(({ key, value, unit }) => (
        <div key={key} className="p-3 rounded-xl bg-bg-card border border-white/5 text-center">
          <p className={`text-lg font-bold font-mono ${mode === 'bat' ? 'text-accent-green' : 'text-accent-cyan'}`}>
            {value}
            {unit && <span className="text-xs text-text-muted ml-0.5">{unit}</span>}
          </p>
          <p className="text-[10px] text-text-muted mt-1 leading-tight">{t(`metrics.${key}`)}</p>
        </div>
      ))}
    </div>
  );
}
