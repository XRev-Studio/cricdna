# CricDNA — What's new from v1.2 to v1.3

A reader-friendly walkthrough of everything that changed between the v1.2 deploy on Vercel and the v1.3 release. Aimed at someone who'll open the site after this update and want to know what they're looking at.

For the file-level technical breakdown, see `CHANGELOG.md`. For an architecture map of the codebase, see `ARCHITECTURE.md`.

---

## TL;DR

In one sentence: **the app stopped feeling like a prototype**. Processing no longer blocks the rest of the UI, the same clip now reliably produces detection results, the DNA Card image fits on screen, every analysis is auto-saved into a real library that survives reloads, and you can sign in with Google to keep your stuff separate from anyone else using the same browser. The Auto Highlight reel got smarter and prettier.

---

## v1.2 — the deploy fix

Before any new features, v1.2 simply made the site safe to deploy on Vercel as a single-page app. A `vercel.json` was added with two configurations:

1. A SPA fallback rewrite, so refreshing the page on `/capture` or `/highlight` (or any other client-side route) now loads the app instead of returning a 404.
2. A long-lived cache header on `/assets/*`, the Vite-fingerprinted bundle directory.

This was a one-file change but a necessary one. Without it, anyone landing directly on a sub-route via a shared link or browser refresh would have hit a blank 404.

---

## v1.3 — the substantive update

Seven things changed at the user-facing level. They land together because they reinforce each other.

### 1. The bottom nav is always there

In v1.2, when an analysis or a highlight reel was being processed, the entire bottom navigation bar disappeared. The only way to leave the processing screen was the in-page back button. If you clicked away by reflex, you lost your progress.

In v1.3, the **Feed / Library / Capture / Leaderboards / Me** bar is visible on every single screen, including during processing. You can tap any tab at any time. The active analysis or reel keeps running in the background — it doesn't care which page you're on.

The technical model behind this: processing functions used to live inside the page that was running them, so when you navigated away the work was orphaned. They've been moved into a global "background jobs" slice of the app's state. The page is now just a *view of* the running job, not the owner of it.

### 2. A global progress banner

Sitting just above the bottom nav, a thin progress strip appears whenever a job is running. It shows what's happening (`Analyzing your technique · 47 %`) and gives you a tap-target to jump to the relevant page. When the job finishes, the banner switches to a green pulsing dot with the message `Done — tap to view ↗`. Tap it once to land on your DNA Card or your reel; an `X` button dismisses without navigating.

The banner is colour-tinted by job type — green for analyze, purple for the highlight reel — so a glance is enough to know what's running.

### 3. Reliable pose detection

There was a real reliability bug in v1.2. The same uploaded video would sometimes produce a clean DNA Card and sometimes return "no poses detected" — with no obvious explanation. The cause was a frame-decoding race: the analysis pipeline was using a `<video>` element that was never attached to the DOM, and Chrome (and Safari to a lesser extent) is unreliable at decoding frames into detached video elements. On top of that, MediaPipe was being asked to read a frame *immediately* after the seek event fired, sometimes before the new frame had actually been painted into the element.

Three small changes fixed this:

- The hidden video element is now attached to the page (offscreen, invisible) so the browser reliably decodes frames into it.
- After every seek, we wait for two animation frames before asking MediaPipe to read.
- If a single frame still comes back empty, we wait 33 ms and try once more before giving up.

In practice: detection that used to fail 1 in 4 attempts on the same input now works on the first try.

### 4. DNA Card image fits on screen

A small but visible bug: the analysis result page used a fixed `3:4` aspect ratio with `object-cover`. On a portrait video the image fit; on a landscape video it cropped to just the player's shoes. On desktop it stretched to the full viewport width and pushed the biomechanics grid below the fold.

The hero block was rebuilt to use `object-contain` inside a black-backgrounded container with a height cap of `55vh`. The full frame is visible regardless of orientation, the biomechanics grid sits cleanly below it on both phone and desktop, and the archetype label sits on the bottom letterbox bar — looks intentional rather than broken.

### 5. A real library

In v1.2, the Library tab held analyses **in memory only**. Refresh the page and your library was empty. There was no "save your work and come back later" flow.

In v1.3, **every completed analysis is auto-saved to the device** — DNA Cards, highlight reels, and the source videos that produced them — using IndexedDB (the browser's structured storage). Tap the Library tab and you see:

- A grid of past sessions with thumbnails.
- Mode badges so you can tell at a glance which entry is a DNA Card, which is a reel, etc.
- Filter chips at the top so you can focus on just one mode.
- Tap any entry to re-open it on its own page (cards open in `/card`, reels in `/highlight` and replay).
- A delete button per entry with a confirmation sheet.

The data carries a schema-version field (`schemaVersion: 1`). If a future release of the app changes the data shape, a single migration entry handles it on read, so today's saves stay readable indefinitely. Sessions tagged with `mode` values the future app doesn't recognize are rendered with a generic "Session" badge rather than crashing the page — i.e. the storage layer is forward-compatible by design.

### 6. Sign in with Google

The Me tab now has a working **Sign in with Google** button. It uses Google Identity Services (frontend-only OAuth — no backend, no API calls) to identify the user, and tags every session saved while they're signed in with that account's identifier. When they sign out, or someone else signs in, the Library only shows that account's sessions.

A few things to note about how this works:

- All data still lives **on this device**. Signing in is just a key for separating your sessions from the next person's on the same browser. There's no cloud sync — that would need a backend.
- The user stays signed in across reloads (the credential is remembered).
- Without a Google OAuth Client ID configured on the server, the button shows a polite "Configure Google sign-in" notice and the rest of the app keeps working under a `local` scope. Setup is two minutes in Google Cloud Console; instructions are in the README.

### 7. Five modes, one storage

Today the four feature cards on the Feed (`Pro Match`, `Technique Score`, `Quick Analysis`, `Auto Highlight`) all funnel through the same analysis pipeline. The only one that's truly differentiated right now is **Auto Highlight**, which runs the dedicated reel-extraction pipeline.

In v1.3 the storage layer carries a `mode` tag for every session, so even though the placeholder modes share a pipeline today, the data they produce is **labelled as the mode the user clicked**. When future versions implement Pro Match, Technique Score, and Quick Analysis as their own pipelines, the existing library entries already have correct labels — nothing has to be backfilled.

The Library reflects this with colour-coded badges and per-mode filters.

---

## Auto Highlight — three improvements

The reel feature got three notable upgrades that deserve their own section.

### 7a. Empty reels are no longer saved

If you handed the highlight extractor a clip and it found zero shots, v1.2 still wrote an empty session to the Library — leaving rows that opened to nothing. That auto-save now skips the no-shots case. The "no shots detected" page still surfaces on screen so you know what happened, but it doesn't pollute the library.

### 7b. The detector finds more real shots

Previously a clip that produced a perfectly good DNA Card could still come back as "no shots detected" in highlight mode. The cause was that the validator was too strict: it required the wrist to be strictly above shoulder height at exactly one specific moment before each candidate peak, and on a fast swing whose 3 fps sample happened to land mid-swing, that moment had the wrist already on its way down — so a real shot was getting rejected.

The validator was loosened in three ways:

- It now searches a 0.4-second window before each candidate, not just a single frame, and passes if **any** frame in that window has the wrist near or above the shoulder line.
- The "wrist above shoulder" tolerance was relaxed.
- The peak-velocity threshold was lowered so weaker (but still real) shots make it into the candidate set.

The non-maximum-suppression spacing (3.5 s between accepted shots) and top-8 cap stay the same, so we still don't over-emit candidates.

### 7c. Each shot now plays twice — clean, then with biomechanics

The signature feature of this release. Every shot in the reel now plays **twice in a row**:

- **Pass 1**: the clean clip — same as before.
- **Pass 2**: the same clip immediately again, with the neon-green pose skeleton drawn over the player. A `REPLAY · BIOMECHANICS` chip appears top-right.

Then the reel cuts to the next shot. The progress bar at the bottom fills to half during pass 1 and full during pass 2, so you can see where you are inside each shot.

How it works: every accepted highlight now stores the pose data for its window inside the saved session. The reel page mounts a transparent canvas positioned exactly over the video's visible area (computed correctly for both portrait and landscape sources, accounting for letterbox bars). During pass 2, the page picks the closest pose frame to the current playback time and redraws the skeleton — only when the closest frame actually changes, so it's cheap.

Older saved reels (created before this field existed) fall back to single-pass playback gracefully.

---

## How to actually use it (a guided run)

If you've never seen the app before:

1. Open the site (currently `cricdna.vercel.app` once v1.3 ships). You land on **Feed**.
2. Tap any feature card or the big **Analyze Your Technique** CTA. You're taken to **Capture**, where you can record an 8-second clip with the camera or upload one from your gallery.
3. After capture, you land on **Processing** with a spinner and a progress bar. The bottom nav is visible — feel free to tap **Library** or **Feed** while it runs. You'll see a thin green progress strip above the nav telling you where the job is.
4. When the job finishes, the strip turns green-pulsing with `Done — tap to view`. Tap it (or wait until you're ready) to land on your **DNA Card**: a hero frame with neon skeleton, six biomechanics metrics, top-3 pro-player matches, and a weakness diagnosis.
5. Open **Library**. Your card is there — tagged with the mode you used. Refresh the page. It's still there.
6. Now go back to Feed and tap **Auto Highlight**. Upload a multi-shot match clip. After processing, you land on the reel. Each shot plays clean, then replays with the skeleton overlay, then advances. At the end, a card shows total shots and the dominant archetype with a "Tap to replay" button.
7. Open **Me**. Tap **Sign in with Google**. Now do another analysis. Library shows it under your account. Sign out. Library now shows only the local sessions from before. Sign back in. Your account's sessions reappear.

That's the v1.3 flow.

---

## Setup note for deploying

The only setup change between v1.2 and v1.3 is one optional environment variable:

```
VITE_GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
```

Set it in Vercel's project settings → Environment Variables to enable Google sign-in. Without it, sign-in is hidden and the app continues to work under a `local` scope. Full setup instructions (creating the OAuth Client in Google Cloud Console, the authorized origins, etc.) are in the README.

No other config or schema migration is needed. v1.2 deployments had no persisted data to migrate.

---

## Where the work lives

A high-level map of the new pieces in case anyone needs to dig in:

| What | Where |
| --- | --- |
| Background-job state and auto-save | `src/lib/store/analysisStore.ts` |
| Shared video helpers (DOM-attach, double rAF, retry) | `src/lib/ml/videoUtils.ts` |
| IndexedDB storage layer + schema versioning | `src/lib/storage/` |
| Google Identity Services integration | `src/lib/auth/google.ts` |
| The progress banner that always sits above the nav | `src/components/layout/ProcessingBanner.tsx` |
| Library page (rewritten) | `src/pages/LibraryPage.tsx` |
| Me page with real sign-in | `src/pages/MePage.tsx` |
| Reel page with skeleton-overlay replay | `src/pages/HighlightReelPage.tsx` |
| Looser shot detection thresholds + window-based backlift check | `src/lib/ml/highlightExtractor.ts` |
| DNA Card image scaling fix + in-progress states | `src/pages/CardPage.tsx` |
| SPA rewrite for Vercel | `vercel.json` (added in v1.2) |
| Full file-level diff history | `CHANGELOG.md` |

If you want the architectural overview that matches all of this back to the original codebase, `ARCHITECTURE.md` is the orientation doc.
