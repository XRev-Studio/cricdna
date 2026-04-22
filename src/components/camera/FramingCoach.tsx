import { useAnalysisStore } from '../../lib/store/analysisStore';

const statusColors: Record<string, string> = {
  searching: 'bg-accent-orange/20 border-accent-orange/40 text-accent-orange',
  partial: 'bg-accent-orange/20 border-accent-orange/40 text-accent-orange',
  good: 'bg-accent-green/20 border-accent-green/40 text-accent-green',
  recording: 'bg-accent-red/20 border-accent-red/40 text-accent-red',
};

export function FramingCoach() {
  const { framingFeedback } = useAnalysisStore();

  return (
    <div className="absolute bottom-36 inset-x-0 z-20 flex justify-center px-6">
      <div
        className={`px-4 py-2 rounded-xl border text-sm font-medium text-center max-w-xs backdrop-blur-sm ${
          statusColors[framingFeedback.status] || statusColors.searching
        }`}
      >
        {framingFeedback.message}
      </div>
    </div>
  );
}
