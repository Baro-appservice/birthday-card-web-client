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

function asV2(design: ReturnType<typeof createSampleDesign>) {
  return {
    ...structuredClone(design),
    version: 2,
    pages: design.pages.map((page) => ({
      ...structuredClone(page),
      elements: page.elements.map((element) => {
        if (element.type !== 'image') return structuredClone(element);
        return {
          id: element.id,
          type: element.type,
          x: element.x,
          y: element.y,
          width: element.width,
          height: element.height,
          rotation: element.rotation,
          opacity: element.opacity,
          assetId: element.assetId,
        };
      }),
    })),
  };
}

function asV1(design: ReturnType<typeof createSampleDesign>) {
  return { ...asV2(design), version: 1 };
}

describe('Design migration pipeline', () => {
  it('현재 v3 문서는 변경 없이 통과한다', () => {
    const design = createSampleDesign();

    const result = migratePersistedDesign(design);

    expect(result).toMatchObject({ status: 'ok', changed: false });
    if (result.status !== 'ok') throw new Error('현재 문서를 읽지 못했습니다.');
    expect(result.design).toEqual(design);
    expect(result.design).not.toBe(design);
    expect(result.design.version).toBe(3);
  });

  it('실제 v2 문서를 v3로 single-hop migration하며 이미지 crop 기본값을 채운다', () => {
    const current = createSampleDesign();
    const v2 = asV2(current);

    const result = migratePersistedDesign(v2);

    expect(result).toMatchObject({ status: 'ok', changed: true });
    if (result.status !== 'ok') throw new Error('v2 migration 결과가 없습니다.');
    expect(result.design.version).toBe(3);
    expect(result.design.pages[0].elements.find((element) => element.id === 'photo'))
      .toMatchObject({ cropZoom: 1, cropFocusX: 0, cropFocusY: 0 });
  });

  it('실제 v1 문서를 v1→v2→v3 순서로 migration한다', () => {
    const current = createSampleDesign();
    const v1 = asV1(current);

    const result = migratePersistedDesign(v1);

    expect(result).toMatchObject({ status: 'ok', changed: true });
    if (result.status !== 'ok') throw new Error('v1 migration 결과가 없습니다.');
    expect(result.design.version).toBe(3);
    expect(result.design.pages[0].elements.map((element) => element.id))
      .toEqual(current.pages[0].elements.map((element) => element.id));
  });

  it('v1에서 허용되던 중복 ID는 순서와 데이터를 유지하며 결정적으로 고유화한다', () => {
    const current = createSampleDesign();
    const v1Current = asV1(current);
    const duplicate = structuredClone(v1Current.pages[0].elements[0]);
    duplicate.id = v1Current.pages[0].elements[0].id;
    const duplicatePage = structuredClone(v1Current.pages[0]);
    const v1 = {
      ...v1Current,
      pages: [
        { ...v1Current.pages[0], elements: [...v1Current.pages[0].elements, duplicate] },
        { ...duplicatePage },
      ],
    };

    const result = migratePersistedDesign(v1);

    expect(result.status).toBe('ok');
    if (result.status !== 'ok') throw new Error('중복 ID migration 결과가 없습니다.');
    expect(result.design.pages.map((page) => page.id)).toEqual(['page-1', 'page-1~2']);
    expect(result.design.pages[0].elements.at(-1)?.id).toBe('top-decoration~2');
    expect(result.design.pages[0].elements.at(-1)).toMatchObject({
      type: duplicate.type,
      x: duplicate.x,
      y: duplicate.y,
    });
  });

  it('v1에 존재하지 않았던 ellipse를 version 1이라고 위장한 문서는 corrupt로 거부한다', () => {
    const current = asV1(createSampleDesign());
    const v1WithEllipse = {
      ...current,
      pages: [{
        ...current.pages[0],
        elements: [...current.pages[0].elements, {
          id: 'not-v1-ellipse',
          type: 'shape',
          shape: 'ellipse',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          rotation: 0,
          opacity: 1,
          fill: '#ffffff',
        }],
      }],
    };

    expect(migratePersistedDesign(v1WithEllipse)).toEqual({
      status: 'error', reason: 'corrupt',
    });
  });

  it('지원 범위 밖 typography와 color는 editor canonical 값으로 normalize한다', () => {
    const design = createSampleDesign();
    const title = design.pages[0].elements.find((element) => element.id === 'title');
    if (!title || title.type !== 'text') throw new Error('title 텍스트가 없습니다.');
    title.fontFamily = 'LegacyRemoteFont';
    title.fontSize = 999;
    title.color = '#ABC';

    const result = migratePersistedDesign(design);

    expect(result).toMatchObject({ status: 'ok', changed: true });
    if (result.status !== 'ok') throw new Error('normalize 결과가 없습니다.');
    expect(result.design.pages[0].elements.find((element) => element.id === 'title'))
      .toMatchObject({ fontFamily: 'system-ui', fontSize: 160, color: '#aabbcc' });
  });

  it('in-memory image crop 값은 저장 전에 canonical 범위로 normalize한다', () => {
    const design = createSampleDesign();
    const photo = design.pages[0].elements.find((element) => element.id === 'photo');
    if (!photo || photo.type !== 'image') throw new Error('photo 이미지가 없습니다.');
    photo.cropZoom = 9;
    photo.cropFocusX = -4;
    photo.cropFocusY = 5;

    const normalized = normalizeDesign(design);

    expect(normalized.changed).toBe(true);
    expect(normalized.design.pages[0].elements.find((element) => element.id === 'photo'))
      .toMatchObject({ cropZoom: 3, cropFocusX: -1, cropFocusY: 1 });
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

  it('버전이 없거나 스키마가 깨진 문서는 corrupt로 분류한다', () => {
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
    expect(migratePersistedDesign({ version: 4 })).toEqual({
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

    expect(prepared.version).toBe(3);
    expect(persistedTitle).toMatchObject({ fontFamily: 'system-ui', fontSize: 12 });
  });
});
