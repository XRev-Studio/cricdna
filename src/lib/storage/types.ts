import type { AnalysisMode, AnalysisResult } from '../types';
import type { HighlightReel } from '../ml/highlightExtractor';

/**
 * Forward-compatible session storage types.
 *
 * Versioning rules:
 *   - Every record carries `schemaVersion`. Bump CURRENT_SCHEMA_VERSION
 *     and add a migrator in migrations.ts when the shape changes.
 *   - Add new fields as optional. Don't remove fields without a deprecation
 *     migration that copies the data into a new shape.
 *   - `mode` is intentionally an open-ended string union. UI must tolerate
 *     unknown values (render with a generic label) so a user opening v1.3
 *     after using v1.7 doesn't crash.
 */

export const CURRENT_SCHEMA_VERSION = 1 as const;

/**
 * Each entry on the Feed corresponds to a SessionMode. They share the
 * underlying storage but the library can group/render differently per mode.
 */
export type SessionMode =
  | 'analyze'
  | 'highlight'
  | 'pro_match'
  | 'quick'
  | 'technique';

export type OwnerScope = 'local' | `google:${string}`;

export interface SignedInUser {
  googleId: string; // 'sub' from Google ID token
  email: string;
  name: string;
  picture?: string;
}

export interface StoredVideo {
  blob: Blob;
  mimeType: string;
  duration: number;
}

/**
 * The persisted session record. Discriminated by `result.kind` so future
 * modes can add their own payload shape without confusing earlier ones.
 */
export interface StoredSession {
  id: string;
  schemaVersion: number;
  createdAt: number;
  ownerScope: OwnerScope;
  ownerEmail?: string;

  /** What feature the user used. Open enum — tolerate unknown values. */
  mode: SessionMode;
  /** The analyzer axis used (current pipeline only knows bat/bowl). */
  pipelineMode: AnalysisMode;

  /** Optional user-set label. Defaults to derived from result (e.g. archetype). */
  title?: string;

  /** Mode-specific payload. */
  result:
    | { kind: 'analyze'; data: AnalysisResult }
    | { kind: 'highlight'; data: HighlightReel };

  /**
   * Source video kept for replay / re-analyze. Highlights need this — the
   * reel page seeks through it. Analyze sessions can be displayed without
   * the video (the hero frame data URL is already on the result).
   */
  video?: StoredVideo;
}

/**
 * Light index entry — what the library lists without loading the full
 * payload. Used by listSessions to keep the grid render snappy.
 */
export interface SessionIndexEntry {
  id: string;
  schemaVersion: number;
  createdAt: number;
  ownerScope: OwnerScope;
  ownerEmail?: string;
  mode: SessionMode;
  pipelineMode: AnalysisMode;
  title?: string;
  /** Either the analyze hero frame or the first highlight thumbnail. */
  thumbnailUrl?: string;
  /** Short caption — archetype for analyze, "N shots" for highlight. */
  caption?: string;
  hasVideo: boolean;
}
