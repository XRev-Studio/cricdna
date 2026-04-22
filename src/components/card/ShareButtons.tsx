import { useTranslation } from 'react-i18next';
import { Download } from 'lucide-react';
import { shareToplatform, downloadCard } from '../../lib/export/shareFormatter';

interface Props {
  heroFrameDataUrl: string;
}

export function ShareButtons({ heroFrameDataUrl }: Props) {
  const { t } = useTranslation();

  const platforms = [
    { key: 'instagram' as const, label: t('share.instagram'), icon: '📸', color: 'from-pink-500 to-purple-500' },
    { key: 'whatsapp' as const, label: t('share.whatsapp'), icon: '💬', color: 'from-green-500 to-green-600' },
    { key: 'tiktok' as const, label: t('share.tiktok'), icon: '🎵', color: 'from-gray-800 to-black' },
  ];

  return (
    <div className="flex gap-3">
      {platforms.map(({ key, label, icon, color }) => (
        <button
          key={key}
          onClick={() => shareToplatform(heroFrameDataUrl, key)}
          className={`flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl bg-gradient-to-br ${color} bg-opacity-20 border border-white/5`}
        >
          <span className="text-lg">{icon}</span>
          <span className="text-[10px] font-medium text-text-primary">{label}</span>
        </button>
      ))}
      <button
        onClick={() => downloadCard(heroFrameDataUrl)}
        className="flex-1 flex flex-col items-center gap-1.5 p-3 rounded-xl bg-bg-card border border-white/5"
      >
        <Download size={18} className="text-text-primary" />
        <span className="text-[10px] font-medium text-text-primary">{t('share.download')}</span>
      </button>
    </div>
  );
}
