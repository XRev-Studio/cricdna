import { useAnalysisStore } from '../lib/store/analysisStore';
import { User, Settings, ChevronRight, LogIn } from 'lucide-react';

export function MePage() {
  const { savedResults } = useAnalysisStore();
  const totalAnalyses = savedResults.length;

  return (
    <div className="h-full overflow-y-auto px-4 pt-12 pb-24">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        <div className="w-16 h-16 rounded-full bg-bg-card border border-white/10 flex items-center justify-center">
          <User size={28} className="text-text-muted" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-text-primary">Cricket Player</h1>
          <p className="text-text-muted text-sm">Sign in to save your progress</p>
        </div>
      </div>

      {/* Sign in prompt */}
      <button className="w-full p-4 rounded-xl bg-bg-card border border-white/5 flex items-center gap-3 mb-6">
        <LogIn size={20} className="text-accent-green" />
        <span className="text-sm font-medium text-text-primary flex-1 text-left">
          Sign in with Google or Apple
        </span>
        <ChevronRight size={16} className="text-text-muted" />
      </button>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Analyses', value: totalAnalyses },
          { label: 'Streak', value: '0 days' },
          { label: 'Shared', value: 0 },
        ].map(({ label, value }) => (
          <div key={label} className="p-3 rounded-xl bg-bg-card border border-white/5 text-center">
            <p className="text-lg font-bold text-text-primary">{value}</p>
            <p className="text-[10px] text-text-muted">{label}</p>
          </div>
        ))}
      </div>

      {/* Settings list */}
      <div className="space-y-1">
        {['Language', 'Notifications', 'Privacy', 'About CricDNA'].map((item) => (
          <button
            key={item}
            className="w-full p-3.5 rounded-xl flex items-center justify-between hover:bg-bg-card transition-colors"
          >
            <span className="text-sm text-text-primary">{item}</span>
            <ChevronRight size={16} className="text-text-muted" />
          </button>
        ))}
      </div>
    </div>
  );
}
