import type {
  OwnerScope,
  SessionIndexEntry,
  StoredSession,
} from './types';
import { migrateSession } from './migrations';

const DB_NAME = 'cricdna_v1';
const STORE_SESSIONS = 'sessions';
/**
 * IndexedDB version (separate from record schemaVersion).
 * Bump this when you add an object store or a new index.
 */
const DB_VERSION = 1;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_SESSIONS)) {
        const store = db.createObjectStore(STORE_SESSIONS, { keyPath: 'id' });
        store.createIndex('ownerScope', 'ownerScope', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
        store.createIndex('mode', 'mode', { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB open failed'));
  });
  return dbPromise;
}

function tx(db: IDBDatabase, mode: IDBTransactionMode = 'readonly'): IDBObjectStore {
  return db.transaction(STORE_SESSIONS, mode).objectStore(STORE_SESSIONS);
}

function promisify<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IDB request failed'));
  });
}

/** Save (or replace) a session. */
export async function saveSession(session: StoredSession): Promise<void> {
  const db = await openDB();
  await promisify(tx(db, 'readwrite').put(session));
}

/** Load a single session by id, running migrations as needed. */
export async function getSession(id: string): Promise<StoredSession | null> {
  const db = await openDB();
  const raw = (await promisify(tx(db).get(id))) as StoredSession | undefined;
  if (!raw) return null;
  return migrateSession(raw);
}

/** Delete a session. */
export async function deleteSession(id: string): Promise<void> {
  const db = await openDB();
  await promisify(tx(db, 'readwrite').delete(id));
}

/**
 * List sessions for a given owner scope, newest first. Returns light index
 * entries (no full payload, no video blob) so the library renders fast.
 */
export async function listSessions(
  scope: OwnerScope,
): Promise<SessionIndexEntry[]> {
  const db = await openDB();
  const store = tx(db);
  const idx = store.index('ownerScope');
  const all = (await promisify(idx.getAll(scope))) as StoredSession[];

  const migrated: StoredSession[] = [];
  for (const raw of all) {
    const m = migrateSession(raw);
    if (m) migrated.push(m);
  }

  // Newest first
  migrated.sort((a, b) => b.createdAt - a.createdAt);

  return migrated.map(toIndexEntry);
}

/** Convert a full session into a light index entry. */
function toIndexEntry(s: StoredSession): SessionIndexEntry {
  let thumbnailUrl: string | undefined;
  let caption: string | undefined;

  if (s.result.kind === 'analyze') {
    thumbnailUrl = s.result.data.heroFrameDataUrl;
    caption = s.result.data.archetype;
  } else if (s.result.kind === 'highlight') {
    thumbnailUrl = s.result.data.highlights[0]?.thumbnailUrl;
    const n = s.result.data.highlights.length;
    caption = `${n} ${n === 1 ? 'shot' : 'shots'}${
      s.result.data.topArchetype ? ` · ${s.result.data.topArchetype}` : ''
    }`;
  }

  return {
    id: s.id,
    schemaVersion: s.schemaVersion,
    createdAt: s.createdAt,
    ownerScope: s.ownerScope,
    ownerEmail: s.ownerEmail,
    mode: s.mode,
    pipelineMode: s.pipelineMode,
    title: s.title,
    thumbnailUrl,
    caption,
    hasVideo: !!s.video,
  };
}

/** Clear every session for the given scope. Useful for "sign out + wipe local". */
export async function clearScope(scope: OwnerScope): Promise<void> {
  const db = await openDB();
  const store = tx(db, 'readwrite');
  const idx = store.index('ownerScope');
  const ids = (await promisify(idx.getAllKeys(scope))) as IDBValidKey[];
  for (const id of ids) {
    await promisify(store.delete(id));
  }
}

/**
 * Best-effort guess at how much storage we're using. Used to warn the user
 * before saving very large videos.
 */
export async function estimateStorage(): Promise<{ usage: number; quota: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const est = await navigator.storage.estimate();
  return {
    usage: est.usage ?? 0,
    quota: est.quota ?? 0,
  };
}
