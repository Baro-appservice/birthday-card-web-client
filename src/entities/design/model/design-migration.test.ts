import { describe, expect, it } from 'vitest';

import { createSampleDesign } from './sample-design';
import {
  migratePersistedDesign,
  normalizeDesign,
  prepareDesignForPersistence,
} from './design-migration';

function rotatedOffset(x: number, y: number, degrees: number) {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function visualCenter(element: { x: number; y: number; width: number; height: number; rotation: number }) {
  const offset = rotatedOffset(element.width / 2, element.height / 2, element.rotation);
  return { x: element.x + offset.x, y: element.y + offset.y };
}

describe('Design migration pipeline', () => {
  it('현재 v1 문서는 변경 없이 통과한다', () => {
    const design = createSampleDesign();

    const result = migratePersistedDesign(design);

    expect(result).toMatchObject({ status: 'ok', changed: false });
    if (result.status !== 'ok') throw new Error('현재 문서를 읽지 못했습니다.');
    expect(result.design).toEqual(design);
    expect(result.design).not.toBe(design);
  });

  it('지원 범위 밖 typography는 editor canonical 값으로 normalize한다', () => {
    const design = createSampleDesign();
    const title = design.pages[0].elements.find((element) => element.id === 'title');
    if (!title || title.type !== 'text') throw new Error('title 텍스트가 없습니다.');
    title.fontFamily = 'LegacyRemoteFont';
    title.fontSize = 999;

    const result = migratePersistedDesign(design);

    expect(result).toMatchObject({ status: 'ok', changed: true });
    if (result.status !== 'ok') throw new Error('normalize 결과가 없습니다.');
    expect(result.design.pages[0].elements.find((element) => element.id === 'title'))
      .toMatchObject({ fontFamily: 'system-ui', fontSize: 160 });
  });

  it('legacy 비정원 circle은 회전된 시각 중심을 유지하며 정원으로 normalize한다', () => {
    const design = createSampleDesign();
    design.pages[0].elements.push({
      id: 'legacy-circle',
      type: 'shape',
      shape: 'circle',
      x: 120,
      y: 220,
      width: 300,
      height: 180,
      rotation: 27,
      opacity: 1,
      fill: '#ffffff',
    });
    const before = design.pages[0].elements.at(-1)!;
    const beforeCenter = visualCenter(before);

    const normalized = normalizeDesign(design);
    const circle = normalized.design.pages[0].elements.find((element) => element.id === 'legacy-circle');
    if (!circle) throw new Error('정규화된 circle이 없습니다.');
    const afterCenter = visualCenter(circle);

    expect(normalized.changed).toBe(true);
    expect(circle).toMatchObject({ width: 300, height: 300 });
    expect(afterCenter.x).toBeCloseTo(beforeCenter.x, 8);
    expect(afterCenter.y).toBeCloseTo(beforeCenter.y, 8);
  });

  it('버전이 없거나 스키마가 깨진 현재 문서는 corrupt로 분류한다', () => {
    expect(migratePersistedDesign({ pages: [] })).toEqual({
      status: 'error', reason: 'corrupt',
    });
    expect(migratePersistedDesign({
      ...createSampleDesign(),
      width: '1080',
    })).toEqual({
      status: 'error', reason: 'corrupt',
    });
  });

  it('미래 버전과 비정상 이전 버전은 현재 클라이언트에서 unsupported로 보존한다', () => {
    expect(migratePersistedDesign({ version: 2 })).toEqual({
      status: 'error', reason: 'unsupported-version',
    });
    expect(migratePersistedDesign({ version: 0 })).toEqual({
      status: 'error', reason: 'unsupported-version',
    });
  });

  it('저장 직전에도 같은 canonical normalization을 적용한다', () => {
    const design = createSampleDesign();
    const title = design.pages[0].elements.find((element) => element.id === 'title');
    if (!title || title.type !== 'text') throw new Error('title 텍스트가 없습니다.');
    title.fontFamily = 'NotInstalledFont';
    title.fontSize = 4;

    const prepared = prepareDesignForPersistence(design);
    const persistedTitle = prepared.pages[0].elements.find((element) => element.id === 'title');

    expect(persistedTitle).toMatchObject({ fontFamily: 'system-ui', fontSize: 12 });
  });
});
