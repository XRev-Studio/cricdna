export function ConfidenceBadge({ confidence }: { confidence: number }) {
  const pct = Math.round(confidence * 100);
  const color =
    pct >= 80 ? 'bg-confidence-high/20 text-confidence-high border-confidence-high/30' :
    pct >= 50 ? 'bg-confidence-mid/20 text-confidence-mid border-confidence-mid/30' :
    'bg-confidence-low/20 text-confidence-low border-confidence-low/30';

  const label =
    pct >= 80 ? 'High confidence' :
    pct >= 50 ? 'Moderate confidence' :
    'Low confidence — try re-recording with better framing';

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium mt-1 ${color}`}>
      <div className={`w-1.5 h-1.5 rounded-full ${
        pct >= 80 ? 'bg-confidence-high' : pct >= 50 ? 'bg-confidence-mid' : 'bg-confidence-low'
      }`} />
      {pct}% — {label}
    </div>
  );
}
