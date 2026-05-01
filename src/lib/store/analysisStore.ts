import { create } from 'zustand';
import type {
  AnalysisMode,
  AnalysisResult,
  LongVideoResult,
  FramingFeedback,
} from '../types';
import type { HighlightReel } from '../ml/highlightExtractor';
import type {
  OwnerScope,
  SessionIndexEntry,
  SessionMode,
  SignedInUser,
  StoredSession,
  StoredVideo,
} from '../storage/types';
import { CURRENT_SCHEMA_VERSION } from '../storage/types';
import {
  deleteSession as dbDeleteSession,
  getSession as dbGetSession,
  listSessions as dbListSessions,
  saveSession as dbSaveSession,
} from '../storage/db';
import { loadSignedInUser, signOut as authSignOut } from '../auth/google';
import { runAnalysisPipeline } from '../ml/pipeline';
import { extractHighlights } from '../ml/highlightExtractor';

export type JobType = 'analyze' | 'highlight';
export type JobStatus = 'running' | 'done' | 'error';

export interface BackgroundJob {
  id: string;
  type: JobType;
  status: JobStatus;
  progress: number;
  stage: string;
  startedAt: number;
  videoUrl: string;
  mode: AnalysisMode;
  /** Tag carried into the saved session. */
  sessionMode: SessionMode;
  error?: string;
}

interface StartAnalyzeOptions {
  videoUrl: string;
  videoFile: File | null;
  pipelineMode: AnalysisMode;
  /** Defaults to 'analyze'; pass 'pro_match'|'quick'|'technique' for tagging. */
  sessionMode?: SessionMode;
}

interface StartHighlightOptions {
  videoUrl: string;
  videoFile: File | null;
  pipelineMode: AnalysisMode;
  sessionMode?: SessionMode;
}

interface AnalysisState {
  mode: AnalysisMode;
  setMode: (mode: AnalysisMode) => void;

  isRecording: boolean;
  setRecording: (v: boolean) => void;

  // Legacy in-page processing flags (kept for compat)
  isProcessing: boolean;
  processingProgress: number;
  processingStage: string;
  setProcessing: (v: boolean, stage?: string) => void;
  setProgress: (p: number, stage?: string) => void;

  currentVideo: string | null;
  currentVideoFile: File | null;
  setCurrentVideo: (url: string | null, file?: File | null) => void;

  framingFeedback: FramingFeedback;
  setFramingFeedback: (f: FramingFeedback) => void;

  currentResult: AnalysisResult | null;
  setCurrentResult: (r: AnalysisResult | null) => void;

  currentReel: HighlightReel | null;
  setCurrentReel: (r: HighlightReel | null) => void;

  longVideoResult: LongVideoResult | null;
  setLongVideoResult: (r: LongVideoResult | null) => void;

  // Legacy in-memory list (kept for compat with old callers)
  savedResults: AnalysisResult[];
  saveResult: (r: AnalysisResult) => void;
  deleteResult: (id: string) => void;

  activeTab: string;
  setActiveTab: (tab: string) => void;

  // ----- Background jobs -----
  currentJob: BackgroundJob | null;
  startAnalyzeJob: (options: StartAnalyzeOptions) => void;
  startHighlightJob: (options: StartHighlightOptions) => void;
  acknowledgeJob: () => void;

  // ----- Auth -----
  signedInUser: SignedInUser | null;
  setSignedInUser: (u: SignedInUser | null) => void;
  signOut: () => void;
  ownerScope: () => OwnerScope;

  // ----- Library (persisted) -----
  savedSessions: SessionIndexEntry[];
  loadSavedSessions: () => Promise<void>;
  loadSessionInto: (id: string) => Promise<StoredSession | null>;
  deleteSavedSession: (id: string) => Promise<void>;
}

function ownerScopeOf(user: SignedInUser | null): OwnerScope {
  return user ? `google:${user.googleId}` : 'local';
}

async function blobFromFile(file: File | null): Promise<StoredVideo | undefined> {
  if (!file) return undefined;
  try {
    // Read into a stable Blob (File extends Blob, but read defensively
    // to avoid handles to the user's filesystem)
    const buf = await file.arrayBuffer();
    const blob = new Blob([buf], { type: file.type || 'video/webm' });
    const duration = await videoDuration(blob).catch(() => 0);
    return {
      blob,
      mimeType: blob.type,
      duration,
    };
  } catch {
    return undefined;
  }
}

function videoDuration(blob: Blob): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => {
      const d = v.duration;
      URL.revokeObjectURL(url);
      resolve(isFinite(d) ? d : 0);
    };
    v.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('metadata load failed'));
    };
    v.src = url;
  });
}

export const useAnalysisStore = create<AnalysisState>((set, get) => ({
  mode: 'bat',
  setMode: (mode) => set({ mode }),

  isRecording: false,
  setRecording: (isRecording) => set({ isRecording }),

  isProcessing: false,
  processingProgress: 0,
  processingStage: '',
  setProcessing: (isProcessing, stage = '') =>
    set({ isProcessing, processingProgress: 0, processingStage: stage }),
  setProgress: (processingProgress, stage) =>
    set(stage ? { processingProgress, processingStage: stage } : { processingProgress }),

  currentVideo: null,
  currentVideoFile: null,
  setCurrentVideo: (currentVideo, currentVideoFile = null) =>
    set({ currentVideo, currentVideoFile }),

  framingFeedback: { status: 'searching', message: 'Position yourself in frame' },
  setFramingFeedback: (framingFeedback) => set({ framingFeedback }),

  currentResult: null,
  setCurrentResult: (currentResult) => set({ currentResult }),

  currentReel: null,
  setCurrentReel: (currentReel) => set({ currentReel }),

  longVideoResult: null,
  setLongVideoResult: (longVideoResult) => set({ longVideoResult }),

  savedResults: [],
  saveResult: (r) => set({ savedResults: [...get().savedResults, r] }),
  deleteResult: (id) =>
    set({ savedResults: get().savedResults.filter((r) => r.id !== id) }),

  activeTab: 'capture',
  setActiveTab: (activeTab) => set({ activeTab }),

  // -------- Background jobs ------------------------------------------------

  currentJob: null,

  startAnalyzeJob: ({ videoUrl, videoFile, pipelineMode, sessionMode = 'analyze' }) => {
    const id = crypto.randomUUID();
    set({
      currentJob: {
        id,
        type: 'analyze',
        status: 'running',
        progress: 0,
        stage: 'Starting...',
        startedAt: Date.now(),
        videoUrl,
        mode: pipelineMode,
        sessionMode,
      },
      currentResult: null,
    });

    runAnalysisPipeline({
      videoUrl,
      videoFile,
      mode: pipelineMode,
      onProgress: (progress, stage) => {
        const job = get().currentJob;
        if (!job || job.id !== id) return;
        set({ currentJob: { ...job, progress, stage } });
      },
    })
      .then(async (result) => {
        const job = get().currentJob;
        if (!job || job.id !== id) return;
        set({
          currentJob: { ...job, status: 'done', progress: 100, stage: 'Done' },
          currentResult: result,
        });

        // Auto-save to the library
        try {
          const user = get().signedInUser;
          const video = await blobFromFile(videoFile);
          const session: StoredSession = {
            id: crypto.randomUUID(),
            schemaVersion: CURRENT_SCHEMA_VERSION,
            createdAt: Date.now(),
            ownerScope: ownerScopeOf(user),
            ownerEmail: user?.email,
            mode: sessionMode,
            pipelineMode,
            title: result.archetype,
            result: { kind: 'analyze', data: result },
            video,
          };
          await dbSaveSession(session);
          await get().loadSavedSessions();
        } catch (err) {
          console.warn('[cricdna] failed to auto-save analyze session', err);
        }
      })
      .catch((err: unknown) => {
        const job = get().currentJob;
        if (!job || job.id !== id) return;
        const message = err instanceof Error ? err.message : 'Something went wrong';
        set({ currentJob: { ...job, status: 'error', error: message } });
      });
  },

  startHighlightJob: ({ videoUrl, videoFile, pipelineMode, sessionMode = 'highlight' }) => {
    const id = crypto.randomUUID();
    set({
      currentJob: {
        id,
        type: 'highlight',
        status: 'running',
        progress: 0,
        stage: 'Starting...',
        startedAt: Date.now(),
        videoUrl,
        mode: pipelineMode,
        sessionMode,
      },
      currentReel: null,
    });

    extractHighlights({
      videoUrl,
      mode: pipelineMode,
      onProgress: (progress, stage) => {
        const job = get().currentJob;
        if (!job || job.id !== id) return;
        set({ currentJob: { ...job, progress, stage } });
      },
    })
      .then(async (reel) => {
        const job = get().currentJob;
        if (!job || job.id !== id) return;
        set({
          currentJob: { ...job, status: 'done', progress: 100, stage: 'Done' },
          currentReel: reel,
        });

        // Don't pollute the library with empty reels — when extraction finds
        // zero shots, the page still surfaces the "no shots detected" state
        // but nothing gets persisted.
        if (reel.highlights.length === 0) return;

        // Auto-save the reel + source video (the reel needs the video for replay)
        try {
          const user = get().signedInUser;
          const video = await blobFromFile(videoFile);
          const title =
            reel.topArchetype ?? `${reel.highlights.length} shot${reel.highlights.length === 1 ? '' : 's'}`;
          const session: StoredSession = {
            id: crypto.randomUUID(),
            schemaVersion: CURRENT_SCHEMA_VERSION,
            createdAt: Date.now(),
            ownerScope: ownerScopeOf(user),
            ownerEmail: user?.email,
            mode: sessionMode,
            pipelineMode,
            title,
            result: { kind: 'highlight', data: reel },
            video,
          };
          await dbSaveSession(session);
          await get().loadSavedSessions();
        } catch (err) {
          console.warn('[cricdna] failed to auto-save highlight session', err);
        }
      })
      .catch((err: unknown) => {
        const job = get().currentJob;
        if (!job || job.id !== id) return;
        const message = err instanceof Error ? err.message : 'Something went wrong';
        set({ currentJob: { ...job, status: 'error', error: message } });
      });
  },

  acknowledgeJob: () => {
    set({ currentJob: null });
  },

  // -------- Auth -----------------------------------------------------------

  signedInUser: loadSignedInUser(),

  setSignedInUser: (u) => {
    set({ signedInUser: u });
    // Reload library for the new scope
    void get().loadSavedSessions();
  },

  signOut: () => {
    authSignOut();
    set({ signedInUser: null });
    void get().loadSavedSessions();
  },

  ownerScope: () => ownerScopeOf(get().signedInUser),

  // -------- Library --------------------------------------------------------

  savedSessions: [],

  loadSavedSessions: async () => {
    const scope = ownerScopeOf(get().signedInUser);
    try {
      const entries = await dbListSessions(scope);
      set({ savedSessions: entries });
    } catch (err) {
      console.warn('[cricdna] failed to list sessions', err);
      set({ savedSessions: [] });
    }
  },

  loadSessionInto: async (id) => {
    try {
      const session = await dbGetSession(id);
      if (!session) return null;
      if (session.result.kind === 'analyze') {
        set({ currentResult: session.result.data });
        if (session.video) {
          const url = URL.createObjectURL(session.video.blob);
          set({ currentVideo: url });
        }
      } else if (session.result.kind === 'highlight') {
        set({ currentReel: session.result.data });
        if (session.video) {
          const url = URL.createObjectURL(session.video.blob);
          set({ currentVideo: url });
        }
      }
      return session;
    } catch (err) {
      console.warn('[cricdna] failed to load session', err);
      return null;
    }
  },

  deleteSavedSession: async (id) => {
    try {
      await dbDeleteSession(id);
      await get().loadSavedSessions();
    } catch (err) {
      console.warn('[cricdna] failed to delete session', err);
    }
  },
}));

// Kick off an initial library load on store creation. Async, fire-and-forget.
useAnalysisStore.getState().loadSavedSessions();
