import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Tv2, FolderOpen, Trophy, User } from 'lucide-react';

const tabs = [
  { key: 'feed', path: '/feed', icon: Tv2 },
  { key: 'library', path: '/library', icon: FolderOpen },
  { key: 'capture', path: '/capture', icon: null },
  { key: 'leaderboards', path: '/leaderboards', icon: Trophy },
  { key: 'me', path: '/me', icon: User },
];

export function BottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();

  // BottomNav is now visible on every route — processing/card/highlight pages
  // run their work non-blockingly in the store, so tab switching is always
  // available.

  return (
    <nav className="glass safe-bottom flex items-center justify-around px-2 pt-2 pb-1 border-t border-white/5">
      {tabs.map((tab) => {
        const isActive = location.pathname === tab.path;

        if (tab.key === 'capture') {
          return (
            <button
              key={tab.key}
              onClick={() => navigate(tab.path)}
              className="relative -mt-6 flex items-center justify-center"
            >
              <div
                className={`w-16 h-16 rounded-full flex items-center justify-center transition-all duration-200 ${
                  isActive
                    ? 'bg-accent-green shadow-[0_0_24px_rgba(0,255,136,0.4)]'
                    : 'bg-bg-elevated border-2 border-accent-green/40'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full ${
                    isActive ? 'bg-bg-primary' : 'bg-accent-green'
                  }`}
                />
              </div>
            </button>
          );
        }

        const Icon = tab.icon!;
        return (
          <button
            key={tab.key}
            onClick={() => navigate(tab.path)}
            className="flex flex-col items-center gap-0.5 py-1 px-3 min-w-[64px]"
          >
            <Icon
              size={22}
              className={`transition-colors ${
                isActive ? 'text-accent-green' : 'text-text-muted'
              }`}
            />
            <span
              className={`text-[10px] font-medium transition-colors ${
                isActive ? 'text-accent-green' : 'text-text-muted'
              }`}
            >
              {t(`nav.${tab.key}`)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
