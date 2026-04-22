import { Trophy, Medal, TrendingUp } from 'lucide-react';

const mockLeaderboard = [
  { rank: 1, name: 'Rohit_Fan_77', archetype: 'The Destroyer', score: 94, streak: 12 },
  { rank: 2, name: 'CricketNerd', archetype: 'The Accumulator', score: 91, streak: 8 },
  { rank: 3, name: 'PaceKing', archetype: 'The Express', score: 89, streak: 15 },
  { rank: 4, name: 'WristMaster', archetype: 'The Wizard', score: 87, streak: 6 },
  { rank: 5, name: 'StanceQueen', archetype: 'The Wall', score: 85, streak: 10 },
  { rank: 6, name: 'SixHitter42', archetype: 'The Dasher', score: 83, streak: 4 },
  { rank: 7, name: 'BowlingSurgeon', archetype: 'The Metronome', score: 81, streak: 7 },
  { rank: 8, name: 'CoverDrive', archetype: 'The Surgeon', score: 79, streak: 3 },
];

const rankColors = ['text-yellow-400', 'text-gray-300', 'text-orange-400'];

export function LeaderboardsPage() {
  return (
    <div className="h-full overflow-y-auto px-4 pt-12 pb-24">
      <div className="flex items-center gap-2 mb-6">
        <Trophy size={24} className="text-accent-green" />
        <h1 className="text-2xl font-bold text-text-primary">Leaderboards</h1>
      </div>

      {/* Weekly highlight */}
      <div className="p-4 rounded-xl bg-gradient-to-br from-accent-green/10 to-accent-cyan/5 border border-accent-green/20 mb-6">
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={16} className="text-accent-green" />
          <span className="text-xs font-semibold text-accent-green">THIS WEEK</span>
        </div>
        <p className="text-sm text-text-secondary">
          <span className="font-bold text-text-primary">247 analyses</span> completed by the community
        </p>
      </div>

      {/* Leaderboard list */}
      <div className="space-y-2">
        {mockLeaderboard.map((entry) => (
          <div
            key={entry.rank}
            className="flex items-center gap-3 p-3 rounded-xl bg-bg-card border border-white/5"
          >
            <div className="w-8 text-center">
              {entry.rank <= 3 ? (
                <Medal size={20} className={rankColors[entry.rank - 1]} />
              ) : (
                <span className="text-sm font-bold text-text-muted">#{entry.rank}</span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-text-primary truncate">{entry.name}</p>
              <p className="text-[10px] text-text-muted">{entry.archetype}</p>
            </div>
            <div className="text-right">
              <p className="text-sm font-bold text-accent-green">{entry.score}</p>
              <p className="text-[10px] text-text-muted">🔥 {entry.streak} day streak</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
