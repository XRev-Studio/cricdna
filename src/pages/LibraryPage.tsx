import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { FolderOpen, Trash2, Sparkles, Film, Zap, TrendingUp, Camera } from 'lucide-react';
import { useAnalysisStore } from '../lib/store/analysisStore';
import type { SessionIndexEntry, SessionMode } from '../lib/storage/types';

interface ModeMeta {
  label: string;
  icon: typeof Sparkles;
  color: string;       // tailwind text color class
  borderColor: string; // tailwind border color class
  bgColor: string;     // tailwind bg color class
}

const MODE_META: Record<string, ModeMeta> = {
  analyze: {
    label: 'DNA Card',
    icon: Sparkles,
    color: 'text-accent-green',
    borderColor: 'border-accent-green/40',
    bgColor: 'bg-accent-green/15',
  },
  highlight: {
    label: 'Reel',
    icon: Film,
    color: 'text-accent-purple',
    borderColor: 'border-accent-purple/40',
    bgColor: 'bg-accent-purple/15',
  },
  pro_match: {
    label: 'Pro Match',
    icon: Sparkles,
    color: 'text-accent-purple',
    borderColor: 'border-accent-purple/40',
    bgColor: 'bg-accent-purple/15',
  },
  quick: {
    label: 'Quick',
    icon: Zap,
    color: 'text-accent-orange',
    borderColor: 'border-accent-orange/40',
    bgColor: 'bg-accent-orange/15',
  },
  technique: {
    label: 'Technique',
    icon: TrendingUp,
    color: 'text-accent-cyan',
    borderColor: 'border-accent-cyan/40',
    bgColor: 'bg-accent-cyan/15',
  },
};

const FALLBACK_META: ModeMeta = {
  label: 'Session',
  icon: Camera,
  color: 'text-text-secondary',
  borderColor: 'border-white/10',
  bgColor: 'bg-bg-elevated',
};

function modeMeta(mode: SessionMode | string): ModeMeta {
  return MODE_META[mode] ?? FALLBACK_META;
}

type Filter = 'all' | SessionMode;

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'analyze', label: 'Cards' },
  { key: 'highlight', label: 'Reels' },
  { key: 'pro_match', label: 'Pro Match' },
  { key: 'quick', label: 'Quick' },
  { key: 'technique', label: 'Technique' },
];

export function LibraryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const {
    savedSessions,
    loadSavedSessions,
    loadSessionInto,
    deleteSavedSession,
    signedInUser,
  } = useAnalysisStore();

  const [filter, setFilter] = useState<Filter>('all');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    void loadSavedSessions();
  }, [loadSavedSessions]);

  const visible =
    filter === 'all'
      ? savedSessions
      : savedSessions.filter((s) => s.mode === filter);

  const visibleFilters = FILTERS.filter(
    (f) =>
      f.key === 'all' ||
      f.key === 'analyze' ||
      f.key === 'highlight' ||
      savedSessions.some((s) => s.mode === f.key),
  );

  const handleOpen = async (entry: SessionIndexEntry) => {
    const session = await loadSessionInto(entry.id);
    if (!session) return;
    if (session.result.kind === 'analyze') {
      navigate('/card');
    } else {
      navigate('/highlight');
    }
  };

  return (
    <div className="h-full overflow-y-auto px-4 pt-12 pb-24">
      {/* Header */}
      <div className="flex items-end justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-text-primary">{t('library.title')}</h1>
          <p className="text-xs text-text-muted mt-0.5">
            {signedInUser
              ? `Signed in as ${signedInUser.name}`
              : 'Local sessions on this device'}
          </p>
        </div>
        <span className="text-xs font-mono text-text-muted">
          {savedSessions.length} total
        </span>
      </div>

      {/* Filter chips */}
      {savedSessions.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 mb-4 -mx-4 px-4">
          {visibleFilters.map((f) => {
            const active = filter === f.key;
            return (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                  active
                    ? 'bg-accent-green text-bg-primary'
                    : 'bg-bg-card text-text-secondary border border-white/5'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {savedSessions.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <FolderOpen size={48} className="text-text-muted mb-4" />
          <p className="text-text-secondary mb-2">{t('library.empty')}</p>
          <p className="text-text-muted text-xs mb-6 max-w-xs">
            Every analysis you run is auto-saved here. Switch accounts on the
            Me tab to see sessions from other Google accounts.
          </p>
          <button
            onClick={() => navigate('/capture')}
            className="px-6 py-2.5 rounded-full bg-accent-green text-bg-primary font-semibold text-sm"
          >
            Record now
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <p className="text-text-secondary text-sm">
            No {FILTERS.find((f) => f.key === filter)?.label.toLowerCase()} sessions yet.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {visible.map((entry) => (
            <SessionCard
              key={entry.id}
              entry={entry}
              onOpen={() => handleOpen(entry)}
              onRequestDelete={() => setConfirmDeleteId(entry.id)}
            />
          ))}
        </div>
      )}

      {/* Delete confirm */}
      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4"
            onClick={() => setConfirmDeleteId(null)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 40, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-2xl bg-bg-card border border-white/5 p-5"
            >
              <p className="text-text-primary font-semibold mb-1">Delete this session?</p>
              <p className="text-text-muted text-xs mb-5">
                This removes it from your library and frees up storage. Can&apos;t be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2.5 rounded-xl bg-bg-elevated text-text-primary text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={async () => {
                    if (confirmDeleteId) {
                      await deleteSavedSession(confirmDeleteId);
                    }
                    setConfirmDeleteId(null);
                  }}
                  className="flex-1 py-2.5 rounded-xl bg-accent-red text-white text-sm font-bold"
                >
                  Delete
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface SessionCardProps {
  entry: SessionIndexEntry;
  onOpen: () => void;
  onRequestDelete: () => void;
}

function SessionCard({ entry, onOpen, onRequestDelete }: SessionCardProps) {
  const meta = modeMeta(entry.mode);
  const Icon = meta.icon;
  const date = new Date(entry.createdAt);
  const dateStr = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className="relative rounded-xl bg-bg-card border border-white/5 overflow-hidden"
    >
      {/* Tap target */}
      <button
        onClick={onOpen}
        className="block w-full text-left"
      >
        {/* Thumbnail */}
        <div className="aspect-[3/4] bg-bg-elevated flex items-center justify-center relative">
          {entry.thumbnailUrl ? (
            <img
              src={entry.thumbnailUrl}
              alt={entry.title ?? meta.label}
              className="w-full h-full object-cover"
            />
          ) : (
            <Icon size={32} className={meta.color} />
          )}

          {/* Mode badge */}
          <div
            className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-md ${meta.bgColor} border ${meta.borderColor} backdrop-blur-sm`}
          >
            <Icon size={10} className={meta.color} />
            <span className={`text-[9px] font-bold uppercase tracking-wider ${meta.color}`}>
              {meta.label}
            </span>
          </div>

          {/* Date pill */}
          <div className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/50 backdrop-blur-sm">
            <span className="text-[9px] font-mono text-text-secondary">{dateStr}</span>
          </div>
        </div>

        {/* Caption */}
        <div className="p-3">
          <p className="text-xs font-semibold text-text-primary truncate">
            {entry.title ?? entry.caption ?? meta.label}
          </p>
          <p className="text-[10px] text-text-muted mt-0.5 truncate">
            {entry.caption ?? ''}
          </p>
        </div>
      </button>

      {/* Delete corner */}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onRequestDelete();
        }}
        className="absolute bottom-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center opacity-0 hover:opacity-100 focus:opacity-100"
        aria-label="Delete"
      >
        <Trash2 size={12} className="text-text-muted" />
      </button>
    </motion.div>
  );
}
