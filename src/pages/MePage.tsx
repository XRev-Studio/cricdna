import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { User, ChevronRight, LogOut, AlertCircle } from 'lucide-react';
import { useAnalysisStore } from '../lib/store/analysisStore';
import {
  isGoogleSignInConfigured,
  renderGoogleSignInButton,
} from '../lib/auth/google';

export function MePage() {
  const { savedSessions, signedInUser, setSignedInUser, signOut } =
    useAnalysisStore();

  const buttonContainerRef = useRef<HTMLDivElement>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const configured = isGoogleSignInConfigured();
  const totalAnalyses = savedSessions.length;
  const reels = savedSessions.filter((s) => s.mode === 'highlight').length;
  const cards = savedSessions.filter((s) => s.mode !== 'highlight').length;

  // Render the Google sign-in button when not signed in (and configured).
  useEffect(() => {
    if (signedInUser || !configured || !buttonContainerRef.current) return;

    let cancelled = false;
    (async () => {
      try {
        setAuthBusy(true);
        setAuthError(null);
        const user = await renderGoogleSignInButton(buttonContainerRef.current!);
        if (!cancelled) {
          setSignedInUser(user);
        }
      } catch (err) {
        if (!cancelled) {
          setAuthError(
            err instanceof Error ? err.message : 'Sign-in setup failed',
          );
        }
      } finally {
        if (!cancelled) setAuthBusy(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signedInUser, configured, setSignedInUser]);

  return (
    <div className="h-full overflow-y-auto px-4 pt-12 pb-24">
      {/* Profile header */}
      <div className="flex items-center gap-4 mb-8">
        {signedInUser?.picture ? (
          <img
            src={signedInUser.picture}
            alt={signedInUser.name}
            className="w-16 h-16 rounded-full border border-white/10"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-16 h-16 rounded-full bg-bg-card border border-white/10 flex items-center justify-center">
            <User size={28} className="text-text-muted" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-text-primary truncate">
            {signedInUser?.name ?? 'Cricket Player'}
          </h1>
          <p className="text-text-muted text-sm truncate">
            {signedInUser?.email ?? 'Sign in to save your progress'}
          </p>
        </div>
      </div>

      {/* Sign-in / sign-out card */}
      <div className="mb-6">
        {signedInUser ? (
          <button
            onClick={signOut}
            className="w-full p-4 rounded-xl bg-bg-card border border-white/5 flex items-center gap-3"
          >
            <LogOut size={20} className="text-accent-red" />
            <span className="text-sm font-medium text-text-primary flex-1 text-left">
              Sign out
            </span>
            <ChevronRight size={16} className="text-text-muted" />
          </button>
        ) : configured ? (
          <div className="p-4 rounded-xl bg-bg-card border border-white/5">
            <p className="text-sm font-medium text-text-primary mb-1">
              Sign in with Google
            </p>
            <p className="text-xs text-text-muted mb-4">
              Your sessions stay on this device. Signing in just lets you switch
              between accounts on the same browser.
            </p>
            {/* Google's renderButton drops its branded button here */}
            <div ref={buttonContainerRef} className="min-h-[40px]" />
            {authBusy && (
              <p className="text-xs text-text-muted mt-2">Loading…</p>
            )}
            <AnimatePresence>
              {authError && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="mt-3 flex items-start gap-2 text-xs text-accent-red"
                >
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  <span>{authError}</span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-bg-card border border-white/5 flex items-start gap-3">
            <AlertCircle size={20} className="text-accent-orange shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary mb-1">
                Configure Google sign-in
              </p>
              <p className="text-xs text-text-muted">
                Set <span className="font-mono">VITE_GOOGLE_CLIENT_ID</span> in
                your Vercel env vars to enable Google sign-in. Until then, your
                sessions are saved locally on this device.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3 mb-6">
        {[
          { label: 'Total', value: totalAnalyses },
          { label: 'Cards', value: cards },
          { label: 'Reels', value: reels },
        ].map(({ label, value }) => (
          <div
            key={label}
            className="p-3 rounded-xl bg-bg-card border border-white/5 text-center"
          >
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
