import { migratePersistedDesign, type Design } from '@/entities/design';

export const EMERGENCY_DESIGN_PREFIX = 'birthday-canvas:emergency:';

export interface EmergencyDesignRecord {
  design: Design;
  updatedAt: number;
}

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

export function readEmergencyDesign(cardId: string): EmergencyDesignRecord | null {
  const target = storage();
  if (!target) return null;
  const key = `${EMERGENCY_DESIGN_PREFIX}${cardId}`;
  try {
    const raw = target.getItem(key);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<EmergencyDesignRecord>;
    const migrated = migratePersistedDesign(record.design);
    if (migrated.status === 'ok' && typeof record.updatedAt === 'number' && Number.isFinite(record.updatedAt)) {
      return { design: migrated.design, updatedAt: record.updatedAt };
    }
    target.removeItem(key);
  } catch {
    try { target.removeItem(key); } catch { /* ignore cleanup failure */ }
  }
  return null;
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
