# CricDNA Changelog

All notable changes to this project. Versions follow the convention agreed with Dev: every meaningful set of changes bumps the minor version (or major for a breaking redesign). The version prior to any AI-assisted work is `v1.0`.

When editing this file, append the newest version at the **top** under `## Unreleased` (if work is in progress) or as a new dated section.

---

## v1.3 — 2026-04-27

Background-jobs architecture, detection reliability, card image scaling, **persistent library, Google sign-in, and forward-compatible session storage**. One large release — the user wanted persistence and auth bundled with the non-blocking processing rework before push.

### Added
- **Background-jobs slice in the Zustand store** (`src/lib/store/analysisStore.ts`): `currentJob: BackgroundJob`, `currentReel: HighlightReel`, plus `startAnalyzeJob`, `startHighlightJob`, `acknowledgeJob`. Job IDs guard against superseded promises writing stale state — starting a new job invalidates the previous one's progress callbacks.
- **Global `ProcessingBanner` component** (`src/components/layout/ProcessingBanner.tsx`) — strip mounted above `BottomNav`. While running: shows progress %, stage text, animated bar tinted by job type (green for analyze, purple for highlight). When done: green pulsing dot + "tap to view" CTA. When error: error text + dismiss. X button dismisses without navigating.
- **`src/lib/ml/videoUtils.ts`** — shared helpers: `attachVideoOffscreen` (returns cleanup), `waitForVideoFrame` (double rAF), `seekToTime` (with timeout), `detectPoseWithRetry`, `seekAndDetect`. Used by the pipeline and highlight extractor.

### Changed
- **Detection reliability fixes** in `pipeline.ts` and `highlightExtractor.ts`:
  - The off-DOM `<video>` element is now appended to `document.body` (offscreen, opacity 0) so Chrome and Safari reliably decode frames into it. Detached video elements are unreliable for frame extraction — `seeked` can fire before the pixel buffer updates.
  - Each pose detection is preceded by a double `requestAnimationFrame` so the new frame has actually painted into the video before MediaPipe reads it.
  - One-shot retry on null detection (33 ms wait + retry once). Eats most transient decode/render races.
  - Pipeline cleans up the attached video in `finally`.
  - Removed the dead per-frame `canvas.drawImage` loop in `pipeline.ts` (canvas was created and drawn into but never read).
- **`BottomNav.tsx`** — removed `hiddenOn` entirely. Bottom nav is now visible on every route including `/processing`, `/card`, `/highlight`, `/long-video`. Tab switching is always available.
- **`App.tsx`** — slotted `<ProcessingBanner />` between the routes outlet and `<BottomNav />`.
- **`CapturePage.tsx`** — record-and-stop and gallery-upload paths both call `startAnalyzeJob` / `startHighlightJob` via a shared `launchJob` helper, then navigate to `/processing` (analyze) or `/highlight` (highlight). The `> 120 s` long-video gate still applies for analyze intent.
- **`ProcessingPage.tsx`** — no longer runs the pipeline. Renders three branches off `currentJob`: running (spinner + progress + "feel free to switch tabs" hint), done (✓ + "View your DNA Card" button), error (message + Try again).
- **`CardPage.tsx`** — added in-progress and error branches that render before the full card. The hero image container was rebuilt to fix the scaling bug: `bg-black flex items-center justify-center` with `min-h-[40vh] max-h-[55vh]`, image with `object-contain` (was `aspect-[3/4] object-cover`). Portrait and landscape source videos both fit, the full body shows instead of just the player's shoes, and the page no longer scrolls past the biomechanics grid.
- **`HighlightReelPage.tsx`** — dropped its internal `extractHighlights` call; reads `currentReel` and `currentJob` from the store and derives the page phase from those. The reel rendering, fade-to-black cuts, shot-intro badges, and end card are unchanged.
- **`LongVideoPage.tsx`** — `handleAnalyzeDelivery` now starts a job via `startAnalyzeJob` before navigating to `/processing`. (Per-delivery sub-clip cutting is still a TODO.)

### Added — Persistence & auth
- **IndexedDB storage layer** at `src/lib/storage/`:
  - `types.ts` defines `StoredSession` (discriminated by `result.kind: 'analyze' | 'highlight'`), `SessionMode` (open enum: `analyze | highlight | pro_match | quick | technique`), `OwnerScope` (`'local' | 'google:<sub>'`), `SignedInUser`, and `CURRENT_SCHEMA_VERSION = 1`.
  - `db.ts` opens database `cricdna_v1`, object store `sessions`, indexed on `ownerScope`, `createdAt`, `mode`. Exposes `saveSession`, `getSession`, `listSessions(scope)`, `deleteSession`, `clearScope`, `estimateStorage`. `listSessions` returns light index entries (no full payload, no video blob) so the library renders fast.
  - `migrations.ts` holds a version-keyed migrator map; the loader runs migrators sequentially from a record's `schemaVersion` up to current. Future schema bumps add a single entry to the map; no record loader changes.
- **Google Sign-In** at `src/lib/auth/google.ts`:
  - Lazy-loads `https://accounts.google.com/gsi/client`, then renders Google's branded button into a container element via `google.accounts.id.renderButton`.
  - Receives the ID token (JWT), decodes it client-side to extract `sub`/`email`/`name`/`picture`, persists to localStorage so reloads remember the user.
  - Reads `VITE_GOOGLE_CLIENT_ID`. If missing, `isGoogleSignInConfigured()` returns false and the Me tab shows a "Configure Google sign-in" hint — nothing else breaks. Sessions save under `'local'` scope.
- **Auto-save on job completion** (`startAnalyzeJob` / `startHighlightJob` in the store). When a pipeline finishes successfully, the result + the source video Blob are written to IndexedDB tagged with the current `ownerScope`. Highlight sessions always save the video (the reel needs it for replay); analyze sessions opportunistically save it too.
- **`src/pages/LibraryPage.tsx`** rewritten to load from IndexedDB on mount. Grid view with mode badges (color-coded by mode), thumbnails, dates, captions. Filter chips at the top (`All / Cards / Reels / Pro Match / Quick / Technique`) — only chips with at least one session are shown. Tap a card to load it into the store and navigate to `/card` or `/highlight`. Long-press / corner button opens a delete confirm sheet.
- **`src/pages/MePage.tsx`** rewritten with real Google sign-in. When configured: renders the Google button via `google.accounts.id.renderButton`. When signed in: shows avatar + name + email + Sign Out. When not configured: shows the env-var configuration hint. Stats row reads from `savedSessions.length` (split into Cards vs Reels).
- **`src/pages/FeedPage.tsx`** — feature cards now navigate with `?mode=` params: `pro_match`, `technique`, `quick`, `highlight`. CapturePage reads the param and tags the saved session accordingly. The three placeholder modes still use the analyze pipeline today; storage is ready for them to differentiate later.
- **`README.md`** + **`.env.example`** — Google OAuth setup steps, env-var docs, storage layer overview.

### Forward-compatibility commitments

These are the explicit guarantees the storage layer makes so future versions of the app can keep reading data created today:

- Every record carries `schemaVersion: 1`. Future shape changes register a migrator in `src/lib/storage/migrations.ts` and bump `CURRENT_SCHEMA_VERSION`. The loader runs migrators sequentially, so v1.0 records can travel through v2 → v3 → v4 in one load.
- New fields are added optional. Removed fields go through a deprecation pass (a migrator that copies the data into a new shape) before they disappear.
- `SessionMode` is an open string enum. The library renders unknown values with a generic "Session" badge instead of crashing — so a v1.3 client opening sessions saved by v1.7 won't choke on a `'reaction_time'` mode it doesn't know about.
- The IndexedDB database version (`cricdna_v1`, version `1`) is separate from record schemaVersion. Adding new object stores or indexes goes through `onupgradeneeded`; adding fields stays at the record level.

### Changed (background jobs / reliability — repeated from earlier in this entry for completeness)
- `startAnalyzeJob` / `startHighlightJob` now take an options object: `{ videoUrl, videoFile, pipelineMode, sessionMode? }`. The added `sessionMode` lets a single pipeline produce sessions tagged for different modes.
- `BackgroundJob.sessionMode` carries the mode tag through to the auto-saved session.
- Store gained `signedInUser`, `setSignedInUser`, `signOut`, `ownerScope()`, `savedSessions`, `loadSavedSessions`, `loadSessionInto`, `deleteSavedSession`. The legacy in-memory `savedResults` is kept for now to avoid breaking any unaudited consumer.

### Added — Reel polish (post-review tweaks before push)
- **Skeleton overlay replay.** Each highlight now plays *twice* in the reel: first clean, then again with a neon pose-skeleton overlay drawn over the player (the same overlay style as the analyze-mode hero frame). A `REPLAY · BIOMECHANICS` badge appears top-right during the second pass. After the overlay pass, the reel advances to the next shot. Sweep frames computed during extraction are now stored on each `Highlight.poseFrames` so the overlay has data to draw. The canvas is positioned over the video's actual displayed rect (handles `object-contain` letterbox correctly) and uses the source video's natural pixel dimensions so the skeleton stays crisp at any display size. The progress bar at the bottom now fills to half during pass 1 and to full during pass 2 so the reader can see where they are in each shot's lifecycle.
- Older saved reels (from before this field existed) gracefully fall back to single-pass playback — `Highlight.poseFrames` is optional and the replay phase is skipped when it's missing.

### Changed — Reel reliability
- **Don't save empty highlight reels.** When extraction returns zero shots, `startHighlightJob` no longer auto-saves a session to the library. The page still surfaces the "no shots detected" state — only the persistence is suppressed. Stops the library getting cluttered with placeholder rows that have no content to view.
- **Looser shot detection thresholds.** A clip that produced a perfectly good DNA Card was returning "no shots detected" in highlight mode because the validator was too strict on short clips and fast swings. Concrete tweaks in `src/lib/ml/highlightExtractor.ts`:
  - `PEAK_VELOCITY_PERCENTILE` 0.85 → 0.70 (lets through 30 % more candidate peaks before validation).
  - `MIN_VISIBILITY` 0.45 → 0.35 (passes more frames where the player is partially occluded).
  - Backlift signature check is now **window-based** instead of single-point. The old code looked at exactly one frame at `peak.time - 0.4 s` and required wrist strictly above shoulder there — fast swings whose lookback frame happened to land mid-swing got rejected. New code searches every sweep frame in `[peak.time - 0.6, peak.time - 0.2]` and passes if *any* of them has wrist within 0.05 normalized units of (or above) the shoulder line.
  - Net effect: clips that previously returned zero shots should now produce reels in the common case, with the same NMS spacing and top-N cap so we still don't over-emit.

### Notes
- Single-job model: starting a new job while one is running orphans the previous promise — its callbacks are silently ignored via the job-id guard. The orphaned work eventually completes and self-cleans via the `finally` block. A real `AbortController` plumbed through the pipeline can come later if it becomes a problem.
- The legacy `isProcessing` / `processingProgress` / `processingStage` slots in the store are kept to avoid breaking any unaudited consumers; new code reads `currentJob` instead.
- Google Sign-In does NOT verify the JWT signature client-side — there's nothing to verify against without a backend, and we don't make authenticated API calls to anywhere. The token's claims are used only as a stable account-scoping key (the `sub` field). This is deliberate: it gives us per-account namespacing on a shared browser without standing up infrastructure.
- The skeleton replay overlay uses sweep frames at 3 fps (the same data the extractor already needs). At 60-fps RAF that's roughly one redraw per 20 ticks — a `lastDrawnTsRef` guard skips redundant draws so the canvas stays cheap. If you ever want smoother skeleton motion, the obvious next step is a refinement pass that captures higher-fps pose for each clip window.

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
