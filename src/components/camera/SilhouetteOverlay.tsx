import type { AnalysisMode } from '../../lib/types';

export function SilhouetteOverlay({ mode }: { mode: AnalysisMode }) {
  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
      <svg
        viewBox="0 0 200 400"
        className="h-[70%] opacity-20"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {mode === 'bat' ? (
          <>
            {/* Batter silhouette */}
            <circle cx="100" cy="50" r="18" strokeDasharray="4 4" />
            {/* Torso */}
            <line x1="100" y1="68" x2="100" y2="180" strokeDasharray="4 4" />
            {/* Arms - batting stance */}
            <line x1="100" y1="100" x2="60" y2="140" strokeDasharray="4 4" />
            <line x1="60" y1="140" x2="50" y2="80" strokeDasharray="4 4" />
            <line x1="100" y1="100" x2="140" y2="130" strokeDasharray="4 4" />
            <line x1="140" y1="130" x2="55" y2="70" strokeDasharray="4 4" />
            {/* Bat */}
            <line x1="50" y1="80" x2="40" y2="30" strokeDasharray="4 4" strokeWidth="2.5" />
            {/* Legs - batting stance */}
            <line x1="100" y1="180" x2="75" y2="300" strokeDasharray="4 4" />
            <line x1="75" y1="300" x2="65" y2="370" strokeDasharray="4 4" />
            <line x1="100" y1="180" x2="130" y2="300" strokeDasharray="4 4" />
            <line x1="130" y1="300" x2="140" y2="370" strokeDasharray="4 4" />
          </>
        ) : (
          <>
            {/* Bowler silhouette - delivery stride */}
            <circle cx="100" cy="50" r="18" strokeDasharray="4 4" />
            {/* Torso - leaning */}
            <line x1="100" y1="68" x2="90" y2="180" strokeDasharray="4 4" />
            {/* Bowling arm raised */}
            <line x1="90" y1="100" x2="70" y2="50" strokeDasharray="4 4" />
            <line x1="70" y1="50" x2="80" y2="20" strokeDasharray="4 4" />
            {/* Other arm */}
            <line x1="90" y1="100" x2="130" y2="150" strokeDasharray="4 4" />
            {/* Front leg extended */}
            <line x1="90" y1="180" x2="55" y2="310" strokeDasharray="4 4" />
            <line x1="55" y1="310" x2="45" y2="370" strokeDasharray="4 4" />
            {/* Back leg */}
            <line x1="90" y1="180" x2="140" y2="290" strokeDasharray="4 4" />
            <line x1="140" y1="290" x2="150" y2="370" strokeDasharray="4 4" />
          </>
        )}
      </svg>
    </div>
  );
}
