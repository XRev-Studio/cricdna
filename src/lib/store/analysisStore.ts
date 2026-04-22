import { create } from 'zustand';
import type { AnalysisMode, AnalysisResult, LongVideoResult, FramingFeedback } from '../types';

interface AnalysisState {
  mode: AnalysisMode;
  setMode: (mode: AnalysisMode) => void;

  isRecording: boolean;
  setRecording: (v: boolean) => void;

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

  longVideoResult: LongVideoResult | null;
  setLongVideoResult: (r: LongVideoResult | null) => void;

  savedResults: AnalysisResult[];
  saveResult: (r: AnalysisResult) => void;
  deleteResult: (id: string) => void;

  activeTab: string;
  setActiveTab: (tab: string) => void;
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

  longVideoResult: null,
  setLongVideoResult: (longVideoResult) => set({ longVideoResult }),

  savedResults: [],
  saveResult: (r) => set({ savedResults: [...get().savedResults, r] }),
  deleteResult: (id) =>
    set({ savedResults: get().savedResults.filter((r) => r.id !== id) }),

  activeTab: 'capture',
  setActiveTab: (activeTab) => set({ activeTab }),
}));
