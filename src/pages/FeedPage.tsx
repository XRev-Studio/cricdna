import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Camera, Sparkles, TrendingUp, Zap } from 'lucide-react';

export function FeedPage() {
  const navigate = useNavigate();

  return (
    <div className="h-full overflow-y-auto px-4 pt-12 pb-24">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gradient mb-1">CricDNA</h1>
        <p className="text-text-secondary text-sm">Your cricket biomechanics analyzer</p>
      </div>

      {/* Hero CTA */}
      <motion.button
        onClick={() => navigate('/capture')}
        className="w-full p-6 rounded-2xl bg-gradient-to-br from-accent-green/20 to-accent-cyan/10 border border-accent-green/20 mb-6 text-left"
        whileTap={{ scale: 0.98 }}
      >
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-accent-green/20 flex items-center justify-center">
            <Camera size={28} className="text-accent-green" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-text-primary">Analyze Your Technique</h2>
            <p className="text-text-secondary text-sm mt-0.5">
              Record or upload a clip to get your DNA Card
            </p>
          </div>
        </div>
      </motion.button>

      {/* Feature cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        {[
          { icon: Sparkles, title: 'Pro Match', desc: 'See which pro you bat like', color: 'accent-purple', to: '/capture' },
          { icon: TrendingUp, title: 'Technique Score', desc: 'Biomechanics breakdown', color: 'accent-cyan', to: '/capture' },
          { icon: Zap, title: 'Quick Analysis', desc: 'Results in under 60s', color: 'accent-orange', to: '/capture' },
          { icon: Camera, title: 'Auto Highlight', desc: 'AI-edited match reels', color: 'accent-green', to: '/capture?intent=highlight' },
        ].map(({ icon: Icon, title, desc, color, to }) => (
          <motion.div
            key={title}
            className="p-4 rounded-xl bg-bg-card border border-white/5"
            whileTap={{ scale: 0.97 }}
            onClick={() => navigate(to)}
          >
            <Icon size={22} className={`text-${color} mb-2`} />
            <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
            <p className="text-text-muted text-xs mt-0.5">{desc}</p>
          </motion.div>
        ))}
      </div>

      {/* How it works */}
      <div className="p-5 rounded-xl bg-bg-secondary border border-white/5">
        <h3 className="text-sm font-bold text-text-primary mb-3">How it works</h3>
        <div className="space-y-3">
          {[
            { step: '1', text: 'Record a batting or bowling clip (or upload from gallery)' },
            { step: '2', text: 'AI analyzes your pose and technique in seconds' },
            { step: '3', text: 'Get your animated DNA Card with pro-player match' },
          ].map(({ step, text }) => (
            <div key={step} className="flex gap-3 items-start">
              <div className="w-6 h-6 rounded-full bg-accent-green/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-accent-green">{step}</span>
              </div>
              <p className="text-text-secondary text-sm">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
