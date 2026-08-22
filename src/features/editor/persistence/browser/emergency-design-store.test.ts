import { beforeEach, describe, expect, it } from 'vitest';

import { createSampleDesign } from '@/entities/design';

import {
  EMERGENCY_DESIGN_PREFIX,
  readEmergencyDesign,
  writeEmergencyDesign,
} from './emergency-design-store';

const cardId = 'emergency-version-safety';
const key = `${EMERGENCY_DESIGN_PREFIX}${cardId}`;

describe('emergency design store', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('현재 버전 emergency snapshot을 읽는다', () => {
    const design = createSampleDesign();
    writeEmergencyDesign(cardId, design);

    const result = readEmergencyDesign(cardId);

    expect(result.status).toBe('loaded');
    if (result.status === 'loaded') {
      expect(result.record.design).toEqual(design);
      expect(result.record.design.version).toBe(3);
      expect(result.record.updatedAt).toBeGreaterThan(0);
    }
  });

  it('미래 버전 emergency snapshot은 구버전 클라이언트가 삭제하지 않는다', () => {
    const design = { ...createSampleDesign(), version: 4 };
    const raw = JSON.stringify({ design, updatedAt: Date.now() });
    localStorage.setItem(key, raw);

    expect(readEmergencyDesign(cardId)).toEqual({ status: 'unsupported-version' });
    expect(localStorage.getItem(key)).toBe(raw);
  });

  it('복구 불가능한 corrupt snapshot만 제거한다', () => {
    localStorage.setItem(key, JSON.stringify({ design: { version: 1 }, updatedAt: Date.now() }));

    expect(readEmergencyDesign(cardId)).toEqual({ status: 'empty' });
    expect(localStorage.getItem(key)).toBeNull();
  });
});
