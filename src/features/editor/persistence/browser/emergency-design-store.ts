import { designSchema, type Design } from '@/entities/design';

const PREFIX = 'birthday-canvas:emergency:';

interface EmergencyDesignRecord {
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
    target.setItem(`${PREFIX}${cardId}`, JSON.stringify(record));
  } catch {
    // Best effort only. IndexedDB remains the primary persistence layer.
  }
}

export function readEmergencyDesign(cardId: string): Design | null {
  const target = storage();
  if (!target) return null;
  const key = `${PREFIX}${cardId}`;
  try {
    const raw = target.getItem(key);
    if (!raw) return null;
    const record = JSON.parse(raw) as Partial<EmergencyDesignRecord>;
    const parsed = designSchema.safeParse(record.design);
    if (parsed.success) return structuredClone(parsed.data);
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
    target.removeItem(`${PREFIX}${cardId}`);
  } catch {
    // The stale snapshot is harmless; a future successful save can retry cleanup.
  }
}
