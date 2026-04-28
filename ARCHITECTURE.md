# CricDNA — Architecture Tour

A short map of the codebase so anyone new can find their way around. Generated from a read-through on 2026-04-27.

## What it does

CricDNA is a mobile-first web app that analyzes a short cricket video clip and produces a "DNA Card" — a hero frame of the player with a neon skeleton overlay, a pro-player match, six biomechanics metrics, a diagnosed weakness, and an archetype label. There are two modes: **bat** and **bowl**. A long-video flow segments a longer clip into individual deliveries and lets the user analyze any one of them.

Everything runs **client-side**. There is no backend. Pose estimation uses MediaPipe Tasks Vision (the `pose_landmarker_heavy` model loaded from a Google CDN) and runs against an off-DOM `<video>` element.

## Tech stack

- **React 19** + **react-router-dom v7** for routing
- **Vite** as bundler (dev port 5180), with the `@tailwindcss/vite` plugin
- **Tailwind v4** with a custom theme of CSS variables in `src/index.css` (dark UI, neon-green and cyan accents, glassmorphism utility, JetBrains Mono for numerics)
- **Zustand** for global state (one store: `useAnalysisStore`)
- **Framer Motion** for stagger-in animations on the card and timeline
- **react-i18next** for copy (single bundled English locale at `src/lib/i18n/locales/en.json`)
- **MediaPipe Tasks Vision** for pose landmarking
- **lucide-react** for iconography

There are no tests, no e2e harness, and no persistence layer.

## Route map

`App.tsx` sets up the router. `BottomNav` is rendered globally and hidden on `/processing`, `/card`, and `/long-video`.

| Path | Page | Role |
| --- | --- | --- |
| `/` | redirect → `/feed` | |
| `/feed` | `FeedPage` | Marketing-style hero + four feature cards + "How it works" |
| `/library` | `LibraryPage` | Grid of saved cards from `savedResults` |
| `/capture` | `CapturePage` | Live camera, record/upload, mode toggle, framing coach |
| `/leaderboards` | `LeaderboardsPage` | Static mock list of top players |
| `/me` | `MePage` | Profile placeholder, sign-in prompt, settings list |
| `/processing` | `ProcessingPage` | Spinner + progress bar driven by the analysis pipeline |
| `/card` | `CardPage` | Animated DNA Card with deep-dive accordion |
| `/long-video` | `LongVideoPage` | Delivery timeline for clips longer than 120 s |

## End-to-end data flow

```
CapturePage
  ├─ camera stream → MediaRecorder → Blob → object URL → setCurrentVideo()
  └─ file upload  ─────────────────────────→ setCurrentVideo()
                  │
                  └─ if clip > 120 s → /long-video
                                      └─ detectDeliveries() → list of Delivery → tap → /processing
                  └─ else → /processing

ProcessingPage
  └─ runAnalysisPipeline({ videoUrl, mode })
       ├─ initPoseDetector()                       (MediaPipe, GPU delegate, 2 poses)
       ├─ extractFramesFromVideo() at 15 fps       (returns timestamps only)
       ├─ for each timestamp: seek video → detectPoseOnFrame() → PoseFrame[]
       ├─ detectHandedness(poseFrames)             (computed but unused downstream)
       ├─ mode === 'bat'
       │    detectBattingEvents → computeBattingMetrics → matchProPlayers
       │    diagnoseBattingWeakness → classifyBattingArchetype → computeConfidence
       └─ mode === 'bowl'
            detectBowlingEvents → computeBowlingMetrics → matchBowlingProPlayers
            diagnoseBowlingWeakness → classifyBowlingArchetype → computeConfidence
       └─ captureHeroFrame() — seek to contact frame, redraw with neon skeleton, JPEG data URL
       → setCurrentResult() → /card

CardPage
  └─ reads currentResult → MetricsGrid + ProMatchBar + WeaknessCard + CricketXCTA + ShareButtons
       └─ Save → saveResult() (in-memory only)
       └─ Share → shareToplatform() → renderCardToCanvas() + watermark → navigator.share or download
```

## The ML pipeline

Three modules under `src/lib/ml/`:

**`poseDetector.ts`** owns the MediaPipe lifecycle. `initPoseDetector` loads the WASM bundle and the `heavy` float16 model (note: this is a large download — first run will be slow). `detectPoseOnFrame` calls `detectForVideo` and normalizes the result into a `PoseFrame { timestamp, landmarks, worldLandmarks }`. `extractFramesFromVideo` only returns a list of timestamps at the requested fps; it does not actually decode frames. `drawSkeleton` paints a configurable colored skeleton onto a 2D canvas.

**`battingAnalyzer.ts`** is the deepest file. It detects six events (`stance`, `trigger`, `backlift_peak`, `downswing`, `contact`, `follow_through`) from the wrist-velocity profile, then computes six metrics:

- `stanceWidth` — ankle distance ÷ hip width
- `backliftAngle` — wrist–shoulder–hip angle at backlift peak
- `headPosition` — lateral offset of the nose from the hip midline at contact (mm-scaled)
- `frontKneeAngle` — hip–knee–ankle angle at contact
- `batSwingPlane` — atan2 of wrist trajectory between backlift and contact
- `followThroughExtension` — wrist height above shoulder at follow-through

A static dictionary of eight pro players (`PRO_PROFILES`) is matched via cosine similarity. Weakness diagnosis is rule-based and short-circuits on the first matching threshold; archetype classification picks one of seven labels (`The Destroyer`, `The Wall`, `The Dasher`, `The Surgeon`, `The Accumulator`, `The Anchor`, `The Improviser`).

**`bowlingAnalyzer.ts`** mirrors the structure for bowling. It identifies a single release point as the highest wrist position, then computes `releaseHeight`, `actionType` (side-on / front-on / mixed by shoulder–camera alignment), `estimatedSpeed` (linear-mapped from peak wrist velocity, clamped 80–160 km/h), `seamAngle`, an `injuryRisk` triple (back hyperextension, knee stress, shoulder load), and `runUpRhythm` (variance of stride lengths). Eight pro bowlers in `BOWLING_PRO_PROFILES`, same cosine match. Archetypes: `The Express`, `The Wizard`, `The Metronome`, `The Enforcer`, `The Maverick`.

**`deliveryDetector.ts`** is independent of pose. It samples the video at 2 fps, downsizes to 320×180, computes per-frame pixel diff motion scores, thresholds at 1.5× the mean to find active segments ≥ 2 s, expands their boundaries (run-up −1 s, follow-through +2 s), grabs JPEG thumbnails at the segment midpoint, and merges segments separated by less than 3 s.

## State

A single Zustand store (`src/lib/store/analysisStore.ts`) holds everything: `mode`, recording / processing flags, the current video URL+File, framing feedback, the current `AnalysisResult`, the list of `savedResults`, the `longVideoResult`, and an `activeTab`. There is no persistence middleware — refreshing the page wipes the library.

Types live in `src/lib/types.ts`. The discriminated union for metrics is `BattingMetrics | BowlingMetrics`; the active branch is determined by `AnalysisResult.mode`.

## Theming, copy, and animation

`src/index.css` defines design tokens at the `@theme` layer (`--color-bg-*`, `--color-accent-*`, confidence colors, fonts). Utility classes `glass`, `neon-glow`, `text-gradient`, `safe-bottom`, and `shimmer` live in the `@layer utilities` block. The viewport meta tag locks scale and respects `viewport-fit=cover` for notched devices.

All player-facing strings route through `t()` from `react-i18next`. The single locale file is bundled at build time. Adding a language is a matter of dropping a JSON next to `en.json` and registering it in `src/lib/i18n/index.ts`.

Framer Motion is used sparingly: stagger-in transitions on the card sections, the cricket-ball spinner on `/processing`, and the timeline reveal on `/long-video`.

## Sharing and export

`src/lib/export/cardRenderer.ts` does two things: `captureHeroFrame` produces the JPEG data URL embedded into every `AnalysisResult`, and `renderCardToCanvas` re-renders that hero into an arbitrary aspect ratio with a vertical gradient overlay. `shareFormatter.ts` wraps the canvas in `navigator.share` with file fallback to download. Three preset formats: Instagram (1080×1920), WhatsApp (1080×1080), TikTok (1080×1920, 8 s cap).

## Things worth knowing before you change something

A few things that surprised me while reading. None are urgent, but they are likely to bite later.

The capture record button is wired to **three** events: `onPointerDown` starts recording, `onPointerUp` stops, and `onClick` runs `handleTapRecord` which then re-starts recording because `isRecording` has flipped back to `false` by the time the click fires. A press-and-release will start, stop, and immediately start again — almost certainly not the intended UX.

`detectHandedness(poseFrames)` is computed and stored on the result, but downstream analyzers always use the `LEFT_*` MediaPipe indices for the dominant side. Left-handed players will get inverted readings for stance width, backlift angle, head position, front-knee angle, and so on.

`runAnalysisPipeline` allocates a `canvas` and `ctx` and draws each video frame to it inside the seek loop. The drawing is never read — `detectPoseOnFrame` runs against the `<video>` element directly. The canvas allocation and `drawImage` call per frame is dead work that can be removed.

`extractFramesFromVideo` accepts an `onProgress` callback in its signature but never calls it.

`LongVideoPage.handleAnalyzeDelivery(delivery)` ignores its argument and just navigates to `/processing` with the full original video — the per-delivery sub-clip flow is still a TODO.

`savedResults` is in-memory only. There is no `zustand/middleware/persist`, no IndexedDB, no localStorage — closing the tab discards the library. Easy fix: wrap the store in `persist`.

Pro-player matching uses raw cosine similarity over a metric vector with very different scales (`stanceWidth` ~1, `backliftAngle` ~135, `followThroughExtension` ~30). Cosine similarity will be dominated by the largest-magnitude dimensions. Z-scoring or per-dimension normalization would produce more meaningful matches.

`cosineSimilarity` is defined identically in both `battingAnalyzer.ts` and `bowlingAnalyzer.ts`. Worth lifting into a shared math util alongside `angle`, `dist`, `midpoint`.

The two `BattingDeepDive` / `BowlingDeepDive` components live as private functions inside `CardPage.tsx`. They are big enough to deserve their own files under `src/components/card/`.

ESLint runs with `tseslint.configs.recommended` (not the type-checked variant). Several files have unused imports (`CricketEvent` in `battingAnalyzer.ts`, the unused `delivery` argument in `LongVideoPage`) that would surface under stricter rules.

The `pose_landmarker_heavy` model is downloaded on first analysis. It's the slowest variant — switching to `pose_landmarker_full` or `_lite` would noticeably improve cold-start time at a small accuracy cost on mobile.

`ProcessingPage` uses a `ran` ref + `[]` deps to dodge React Strict Mode's double-invoke. It's a known pattern, but the linter will complain — explicitly disabling exhaustive-deps with a comment would document the intent.

## Suggested first changes if you want to ship

In rough priority order: persist `savedResults`, fix the record button event collision, route `isLeftHanded` into the analyzers (mirror landmark indices when true), normalize the pro-player match vectors, implement the actual sub-clip cut in `/long-video`, and extract the deep-dive sections out of `CardPage.tsx`.
