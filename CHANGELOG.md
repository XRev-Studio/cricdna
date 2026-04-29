# CricDNA Changelog

All notable changes to this project. Versions follow the convention agreed with Dev: every meaningful set of changes bumps the minor version (or major for a breaking redesign). The version prior to any AI-assisted work is `v1.0`.

When editing this file, append the newest version at the **top** under `## Unreleased` (if work is in progress) or as a new dated section.

---

## v1.2 — 2026-04-27

Deploy-readiness for Vercel.

### Added
- **`vercel.json`** at repo root with two configurations:
  - SPA fallback rewrite: `/((?!.*\\.).*) → /index.html` so direct navigation and refresh on client-side routes (`/capture`, `/highlight`, `/card`, etc.) serve `index.html` instead of returning 404. The negative-lookahead on `\\.` excludes asset paths (anything containing a `.`) so static files are served as-is.
  - Long-cache header on `/assets/*` (the Vite-fingerprinted bundle directory): `public, max-age=31536000, immutable`.

### Notes
- No `vercel.json` existed in v1.0 or v1.1. The earlier deploy at `cricdna.vercel.app` happened to work because users entered through `/` and let client-side routing take over from there; refreshing on any sub-route would have 404'd.
- Vercel auto-detects Vite — no need to specify build command or output directory.

---

## v1.1 — 2026-04-27

First AI-assisted iteration. Two deliverables: an architecture document for orientation, and a rebuild of the Auto Highlight feature into a real shot-detection + edited-reel flow.

### Added
- **`ARCHITECTURE.md`** at repo root — a tour of the codebase covering tech stack, route map, end-to-end data flow, the ML pipeline, state, theming, and a list of architectural quirks (record-button event collision, unused `isLeftHanded`, in-memory-only `savedResults`, dead canvas allocation in pipeline.ts, raw cosine similarity over mixed-scale vectors, etc.).
- **Auto Highlight flow** — a new feature path that takes a long match clip, finds the actual shot moments, and plays them back as a hand-edited-feeling reel.
  - New `src/lib/ml/highlightExtractor.ts` — single full-video pose sweep at adaptive 3 fps (capped at 900 frames so long videos don't hang), wrist-velocity peak finding, backlift-signature validation (wrist must be above shoulder ~0.4 s before the peak — filters fielding/running), greedy NMS by intensity with 3.5 s spacing, top 8 peaks. Each accepted peak `T` clipped to `[T-2s, T+2s]`. Per-clip archetype computed from sweep frames inside the window. Seek timeout (1500 ms) so a bad frame can't stall the sweep.
  - New `src/pages/HighlightReelPage.tsx` — three phases (processing / reel / empty/error). Reel uses a single `<video>` element, RAF-driven segment advancement, fade-to-black cuts (180 ms out / 80 ms hold / 150 ms in), animated shot-intro badge (`01 / OF 08` + archetype chip), subtle vignette, full-screen end card showing total shots + dominant archetype with tap-to-replay.
  - New `/highlight` route, hidden from `BottomNav`.
  - New `highlight` namespace in `src/lib/i18n/locales/en.json`.

### Changed
- **`src/pages/FeedPage.tsx`** — feature cards now carry their own destination. The "Auto Highlight" card navigates to `/capture?intent=highlight`. The other three feature cards and the hero CTA still go to `/capture` (existing DNA Card flow).
- **`src/pages/CapturePage.tsx`** — reads `intent` from `useSearchParams`. When `intent=highlight`, navigation after recording or upload goes straight to `/highlight` and bypasses the `> 120 s` long-video gate (long clips are expected here). All other intents preserve the original `/long-video` vs `/processing` branch.
- **`src/App.tsx`** — registered the `/highlight` route.
- **`src/components/layout/BottomNav.tsx`** — added `/highlight` to the hidden-routes list.

### Notes
- The first cut of `highlightExtractor.ts` reused the existing motion-diff `detectDeliveries()` for candidate windows. It produced clips that didn't contain shots (running, fielding, camera pans all looked like deliveries) and stalled on long videos. It was replaced inside the same session with the pose-velocity-peak approach above.
- Aggregate stats only — per-shot metrics are computed and attached to each `Highlight` object but are not displayed; only the dominant archetype across all shots surfaces in the UI.
- TypeScript could not be verified with `tsc -b` in this session (sandbox didn't boot). Manual review of imports and type narrowing only.

---

## v1.0 — Baseline

Original codebase as handed off, pre-AI-assistance. Captured here for reference.

### Stack
- React 19 + Vite (port 5180), Tailwind v4 with custom CSS-variable theme, Framer Motion, Zustand, react-i18next (English-only bundled), MediaPipe Tasks Vision (`pose_landmarker_heavy` from Google CDN), lucide-react.

### Routes
- `/feed` (`FeedPage`) — hero CTA + four feature cards + how-it-works.
- `/library` (`LibraryPage`) — grid of saved DNA Cards (in-memory).
- `/capture` (`CapturePage`) — live camera or gallery upload, `bat`/`bowl` mode toggle, framing coach, silhouette overlay.
- `/leaderboards` (`LeaderboardsPage`) — static mock list.
- `/me` (`MePage`) — profile placeholder + sign-in prompt + stats.
- `/processing` (`ProcessingPage`) — runs the analysis pipeline with progress UI.
- `/card` (`CardPage`) — animated DNA Card with deep-dive accordion.
- `/long-video` (`LongVideoPage`) — for clips > 120 s, motion-diff segmented into delivery list (per-delivery analyze flow).

### ML pipeline
- `src/lib/ml/poseDetector.ts` — MediaPipe init (GPU delegate, heavy model), per-frame detection, skeleton drawing.
- `src/lib/ml/battingAnalyzer.ts` — six events (stance/trigger/backlift_peak/downswing/contact/follow_through) from wrist-velocity profile, six metrics (stance width, backlift angle, head position, front knee angle, swing plane, follow-through extension), eight pro-player profiles matched via cosine similarity, rule-based weakness diagnosis, seven archetypes (Destroyer, Wall, Dasher, Surgeon, Accumulator, Anchor, Improviser).
- `src/lib/ml/bowlingAnalyzer.ts` — release-point event, five metrics (release height, action type, estimated speed, seam angle, run-up rhythm) + injury risk triple, eight pro bowlers, five archetypes (Express, Wizard, Metronome, Enforcer, Maverick).
- `src/lib/ml/deliveryDetector.ts` — 2 fps motion-diff scan at 320×180, threshold = 1.5× mean, ≥ 2 s active windows, ±1/+2 s expansion, 3 s gap merging.
- `src/lib/ml/pipeline.ts` — orchestrates 15 fps pose sampling → events → metrics → pro match → archetype → hero frame with neon skeleton overlay.

### Sharing / export
- `src/lib/export/cardRenderer.ts` — hero frame capture (JPEG data URL with skeleton), card-to-canvas re-render with vertical gradient, watermark.
- `src/lib/export/shareFormatter.ts` — preset formats (IG 1080×1920, WhatsApp 1080×1080, TikTok 1080×1920 + 8 s cap), `navigator.share` with download fallback.

### State
- Single Zustand store (`src/lib/store/analysisStore.ts`) — `mode`, recording/processing flags, current video URL+File, framing feedback, current `AnalysisResult`, `savedResults` array (in-memory only — refresh wipes it), `longVideoResult`, `activeTab`. No persist middleware.

### Known issues carried into v1.0
*(Documented in `ARCHITECTURE.md` § "Things worth knowing", v1.1.)*
- `CapturePage` record button binds three events (`onPointerDown` / `onPointerUp` / `onClick`) — pointer-up's stop is followed by the click event re-starting recording.
- `detectHandedness()` is computed and stored on every result but never read — left-handed players get inverted readings because analyzers hard-code `LEFT_*` landmark indices.
- `runAnalysisPipeline()` allocates a canvas and calls `drawImage` per frame; the canvas is never read (pose runs against the `<video>` directly).
- `extractFramesFromVideo()` accepts an `onProgress` callback but never invokes it.
- `LongVideoPage.handleAnalyzeDelivery(delivery)` ignores its argument; sub-clip cutting is a TODO.
- `savedResults` has no persistence layer.
- Pro-player matching uses raw cosine similarity over a vector with mixed scales — large-magnitude dimensions dominate.
- `cosineSimilarity` is duplicated in both batting and bowling analyzers.
- ESLint runs `tseslint.configs.recommended` (no type-aware rules).
