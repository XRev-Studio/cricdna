/**
 * Frontend-only Google Sign-In via Google Identity Services.
 *
 * No backend involved — we receive an ID token (JWT) from Google, decode
 * it client-side to extract the user's `sub`/email/name, and use that as
 * a "scope key" for the local IndexedDB. The token itself is not used to
 * authenticate API calls (we don't have any).
 *
 * Setup:
 *   1. Google Cloud Console → APIs & Services → Credentials
 *   2. Create OAuth 2.0 Client ID (Web)
 *   3. Authorized JavaScript origins: https://your-domain.vercel.app
 *      and http://localhost:5180 for dev
 *   4. Add VITE_GOOGLE_CLIENT_ID to Vercel env vars / .env locally
 */

import type { SignedInUser } from '../storage/types';

const GSI_SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const SIGNED_IN_USER_KEY = 'cricdna.signedInUser.v1';

let gsiLoadPromise: Promise<void> | null = null;

interface GsiCredentialResponse {
  credential: string;
}

interface GsiButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'small' | 'medium' | 'large';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  width?: number | string;
}

interface GsiAccountsId {
  initialize(opts: {
    client_id: string;
    callback: (resp: GsiCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, opts: GsiButtonOptions): void;
  prompt(notification?: (n: unknown) => void): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GsiAccountsId } };
  }
}

/** Read the OAuth client ID at module init time. */
export function getGoogleClientId(): string | undefined {
  // Vite injects `import.meta.env.VITE_*` at build time
  const id = import.meta.env.VITE_GOOGLE_CLIENT_ID;
  return typeof id === 'string' && id.length > 0 ? id : undefined;
}

/** True if a client ID is configured and Google sign-in can be attempted. */
export function isGoogleSignInConfigured(): boolean {
  return !!getGoogleClientId();
}

/** Lazily load the gsi/client script tag (idempotent). */
function loadGsiScript(): Promise<void> {
  if (gsiLoadPromise) return gsiLoadPromise;
  gsiLoadPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = GSI_SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services'));
    document.head.appendChild(s);
  });
  return gsiLoadPromise;
}

/** Decode a JWT payload (Google ID token). Does not verify signature. */
function decodeJwt(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) throw new Error('Invalid JWT');
  const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
  const json = decodeURIComponent(
    atob(padded)
      .split('')
      .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
      .join(''),
  );
  return JSON.parse(json);
}

function userFromCredential(credential: string): SignedInUser {
  const claims = decodeJwt(credential);
  const sub = String(claims.sub ?? '');
  const email = String(claims.email ?? '');
  const name = String(claims.name ?? email);
  const picture =
    typeof claims.picture === 'string' ? (claims.picture as string) : undefined;
  if (!sub || !email) throw new Error('Google ID token missing required claims');
  return { googleId: sub, email, name, picture };
}

/**
 * Render a Google-styled sign-in button into the given container.
 * The promise resolves with the user when the user completes sign-in,
 * or rejects on script-load failure.
 */
export async function renderGoogleSignInButton(
  container: HTMLElement,
  options: GsiButtonOptions = {
    type: 'standard',
    theme: 'filled_black',
    size: 'large',
    text: 'continue_with',
    shape: 'pill',
  },
): Promise<SignedInUser> {
  const clientId = getGoogleClientId();
  if (!clientId) throw new Error('VITE_GOOGLE_CLIENT_ID not configured');

  await loadGsiScript();
  const accountsId = window.google?.accounts?.id;
  if (!accountsId) throw new Error('Google Identity Services unavailable');

  return new Promise<SignedInUser>((resolve, reject) => {
    try {
      accountsId.initialize({
        client_id: clientId,
        callback: (resp) => {
          try {
            const user = userFromCredential(resp.credential);
            persistSignedInUser(user);
            resolve(user);
          } catch (err) {
            reject(err);
          }
        },
        auto_select: false,
        cancel_on_tap_outside: true,
      });

      // Clear and re-render
      container.innerHTML = '';
      accountsId.renderButton(container, options);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Sign out: clear stored user. (Google's gsi has `disableAutoSelect`
 * which we also call so the user is asked to confirm next time.)
 */
export function signOut(): void {
  try {
    window.google?.accounts?.id?.disableAutoSelect();
  } catch {
    /* not loaded yet — fine */
  }
  localStorage.removeItem(SIGNED_IN_USER_KEY);
}

/** Persist the signed-in user to localStorage so reloads remember them. */
export function persistSignedInUser(user: SignedInUser): void {
  try {
    localStorage.setItem(SIGNED_IN_USER_KEY, JSON.stringify(user));
  } catch {
    /* quota exceeded or storage disabled — non-fatal */
  }
}

/** Read the persisted user, if any. */
export function loadSignedInUser(): SignedInUser | null {
  try {
    const raw = localStorage.getItem(SIGNED_IN_USER_KEY);
    if (!raw) return null;
    const parsed: SignedInUser = JSON.parse(raw);
    if (!parsed.googleId || !parsed.email) return null;
    return parsed;
  } catch {
    return null;
  }
}
