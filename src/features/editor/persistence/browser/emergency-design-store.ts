import { migratePersistedDesign, type Design } from '@/entities/design';

export const EMERGENCY_DESIGN_PREFIX = 'birthday-canvas:emergency:';

export interface EmergencyDesignRecord {
  design: Design;
  updatedAt: number;
}

export type EmergencyDesignLoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; record: EmergencyDesignRecord }
  | { status: 'unsupported-version' };

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function writeEmergencyDesign(cardId: string, design: Design): void {
  const target = storage();
  if (!target) return;
  try {
    const record: EmergencyDesignRecord = {
      design: structuredClone(design),
      updatedAt: Date.now(),
    };
    target.setItem(`${EMERGENCY_DESIGN_PREFIX}${cardId}`, JSON.stringify(record));
  } catch {
    // Best effort only. IndexedDB remains the primary persistence layer.
  }
}

export function readEmergencyDesign(cardId: string): EmergencyDesignLoadResult {
  const target = storage();
  if (!target) return { status: 'empty' };
  const key = `${EMERGENCY_DESIGN_PREFIX}${cardId}`;
  try {
    const raw = target.getItem(key);
    if (!raw) return { status: 'empty' };
    const record = JSON.parse(raw) as Partial<EmergencyDesignRecord>;
    const migrated = migratePersistedDesign(record.design);
    if (
      migrated.status === 'ok'
      && typeof record.updatedAt === 'number'
      && Number.isFinite(record.updatedAt)
    ) {
      return {
        status: 'loaded',
        record: { design: migrated.design, updatedAt: record.updatedAt },
      };
    }
    if (migrated.status === 'error' && migrated.reason === 'unsupported-version') {
      // A stale client must never delete or overwrite recovery data written by a
      // newer Design version. Keep the raw localStorage record for a newer client.
      return { status: 'unsupported-version' };
    }
    target.removeItem(key);
  } catch {
    try { target.removeItem(key); } catch { /* ignore cleanup failure */ }
  }
  return { status: 'empty' };
}

export function clearEmergencyDesign(cardId: string): void {
  const target = storage();
  if (!target) return;
  try {
    target.removeItem(`${EMERGENCY_DESIGN_PREFIX}${cardId}`);
  } catch {
    // A future successful save can retry cleanup.
  }
}
