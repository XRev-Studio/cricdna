# CricDNA

Mobile-first cricket biomechanics analyzer. Records or uploads a clip, runs MediaPipe pose detection in the browser, and produces a "DNA Card" with metrics, pro-player match, weakness diagnosis, and an archetype label. Plus a separate Auto Highlight flow that finds the actual shot moments in a long match clip and stitches them into an edited reel.

Everything runs client-side. No backend.

## Stack

React 19 + Vite, Tailwind v4, Framer Motion, Zustand, react-router v7, react-i18next, MediaPipe Tasks Vision (`pose_landmarker_heavy` from Google's CDN), lucide-react. IndexedDB for session persistence; Google Identity Services for optional sign-in.

## Run locally

```
npm install
npm run dev          # localhost:5180
```

```
npm run build        # tsc -b && vite build
npm run preview      # preview the production build
npm run lint         # eslint
```

## Environment variables

Copy `.env.example` to `.env.local` and fill in values you want.

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_GOOGLE_CLIENT_ID` | optional | Enables the Google Sign-in button on the Me tab. Without it, sessions save under a `local` scope on this device. |

### Setting up Google Sign-In

1. Open https://console.cloud.google.com/ → APIs & Services → Credentials.
2. Create an OAuth 2.0 Client ID for **Web application**.
3. Authorized JavaScript origins:
   - `http://localhost:5180` (dev)
   - `https://cricdna.vercel.app` (prod — and any preview URLs you care about)
4. Copy the Client ID.
5. Locally: add to `.env.local` as `VITE_GOOGLE_CLIENT_ID=...`.
6. On Vercel: Project → Settings → Environment Variables. Add `VITE_GOOGLE_CLIENT_ID` for Production (and Preview/Development if you want).
7. Redeploy.

If the variable isn't set, the Me tab shows a "Configure Google sign-in" notice and the rest of the app continues to work — sessions just save locally.

## Architecture

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for a tour of the codebase and known quirks. See [`CHANGELOG.md`](./CHANGELOG.md) for what's changed across versions.

### Storage

All completed analyses (DNA cards + highlight reels + the source video) are auto-saved to IndexedDB on the user's device. Each saved record carries a `schemaVersion` so future versions of the app can migrate older saves rather than break them.

- Database: `cricdna_v1`
- Object store: `sessions`
- Indexes: `ownerScope`, `createdAt`, `mode`
- Records carry `ownerScope: 'local' | 'google:<sub>'` so the library can show different sets per Google account on the same browser.

When you bump the record schema, add a migrator in `src/lib/storage/migrations.ts` and bump `CURRENT_SCHEMA_VERSION` in `src/lib/storage/types.ts`.

## Deploy

The repo includes a `vercel.json` with the SPA fallback rewrite. Push to `main` and Vercel rebuilds.
