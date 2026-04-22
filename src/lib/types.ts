export type AnalysisMode = 'bat' | 'bowl';

export interface PoseLandmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export interface PoseFrame {
  timestamp: number;
  landmarks: PoseLandmark[];
  worldLandmarks: PoseLandmark[];
}

export type CricketEvent =
  | 'stance'
  | 'trigger'
  | 'backlift_peak'
  | 'downswing'
  | 'contact'
  | 'follow_through';

export interface DetectedEvent {
  type: CricketEvent;
  frameIndex: number;
  timestamp: number;
  confidence: number;
}

export interface BattingMetrics {
  stanceWidth: number;
  backliftAngle: number;
  headPosition: number;
  frontKneeAngle: number;
  batSwingPlane: number;
  followThroughExtension: number;
}

export interface BowlingMetrics {
  releaseHeight: number;
  actionType: 'side-on' | 'front-on' | 'mixed';
  estimatedSpeed: number;
  seamAngle: number;
  injuryRisk: {
    backHyperextension: boolean;
    kneeStress: boolean;
    shoulderLoad: boolean;
  };
  runUpRhythm: number;
}

export interface ProMatch {
  name: string;
  similarity: number;
  imageUrl?: string;
}

export interface WeaknessDiagnosis {
  symptom: string;
  mechanism: string;
  consequence: string;
  cricketXDrill: string;
}

export type Archetype =
  | 'The Accumulator'
  | 'The Destroyer'
  | 'The Anchor'
  | 'The Improviser'
  | 'The Wall'
  | 'The Dasher'
  | 'The Surgeon'
  | 'The Express'
  | 'The Wizard'
  | 'The Enforcer'
  | 'The Metronome'
  | 'The Maverick';

export interface AnalysisResult {
  id: string;
  mode: AnalysisMode;
  videoUrl: string;
  heroFrameIndex: number;
  heroFrameDataUrl?: string;
  poseFrames: PoseFrame[];
  events: DetectedEvent[];
  metrics: BattingMetrics | BowlingMetrics;
  proMatches: ProMatch[];
  weakness: WeaknessDiagnosis;
  archetype: Archetype;
  confidence: number;
  isLeftHanded: boolean;
  createdAt: number;
}

export interface Delivery {
  index: number;
  startTime: number;
  endTime: number;
  contactTime: number;
  thumbnailUrl?: string;
  analysis?: AnalysisResult;
}

export interface LongVideoResult {
  id: string;
  videoUrl: string;
  deliveries: Delivery[];
  totalDuration: number;
  processingTime: number;
}

export type FramingStatus = 'searching' | 'partial' | 'good' | 'recording';

export interface FramingFeedback {
  status: FramingStatus;
  message: string;
  details?: string;
}

export interface ShareFormat {
  platform: 'instagram' | 'whatsapp' | 'tiktok';
  width: number;
  height: number;
  maxDuration?: number;
}

export const SHARE_FORMATS: Record<string, ShareFormat> = {
  instagram: { platform: 'instagram', width: 1080, height: 1920 },
  whatsapp: { platform: 'whatsapp', width: 1080, height: 1080 },
  tiktok: { platform: 'tiktok', width: 1080, height: 1920, maxDuration: 8 },
};
