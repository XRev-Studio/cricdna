import type { StoredSession } from './types';
import { CURRENT_SCHEMA_VERSION } from './types';

/**
 * Migrators take a record at schema version N and return one at version N+1.
 * They run in order from `record.schemaVersion` up to CURRENT_SCHEMA_VERSION.
 *
 * Add a new entry whenever you bump CURRENT_SCHEMA_VERSION:
 *   1: (record) => ({ ...record, newField: defaultValue, schemaVersion: 2 }),
 *
 * Migrators must be pure and idempotent. If a migration can fail, return
 * null and the loader will skip the record (it stays in the DB but isn't
 * surfaced — better than crashing the whole library).
 */
const migrators: Record<number, (record: StoredSession) => StoredSession | null> = {
  // v1 is the initial schema; no migrator needed yet. Add v1 → v2 here later.
};

/**
 * Migrate a stored record to the current schema version.
 * Returns the migrated record or null if migration failed.
 */
export function migrateSession(record: StoredSession): StoredSession | null {
  let current: StoredSession = record;

  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const fn = migrators[current.schemaVersion];
    if (!fn) {
      // No migrator registered — fail safe, drop the record from the surface
      console.warn(
        `[cricdna storage] No migrator from v${current.schemaVersion} to v${current.schemaVersion + 1}; skipping record ${current.id}`,
      );
      return null;
    }
    const next = fn(current);
    if (!next) return null;
    current = next;
  }

  // If a record is from a NEWER version than this build understands, we
  // also surface it as-is and let the UI render with conservative defaults.
  // Don't crash; this is the "always linkable to newer version" guarantee
  // working in reverse — old client opening newer data.

  return current;
}
