import { motion } from 'framer-motion';
import type { ProMatch } from '../../lib/types';

export function ProMatchBar({ matches }: { matches: ProMatch[] }) {
  if (matches.length === 0) return null;

  return (
    <div className="space-y-3">
      {matches.map((match, i) => (
        <div key={match.name} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-bg-elevated flex items-center justify-center text-sm">
            {i === 0 ? '🏆' : i === 1 ? '🥈' : '🥉'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold text-text-primary truncate">{match.name}</span>
              <span className="text-sm font-bold font-mono text-accent-green">{match.similarity}%</span>
            </div>
            <div className="h-1.5 rounded-full bg-bg-elevated overflow-hidden">
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-accent-green to-accent-cyan"
                initial={{ width: 0 }}
                animate={{ width: `${match.similarity}%` }}
                transition={{ duration: 1, delay: 0.5 + i * 0.2, ease: 'easeOut' }}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
