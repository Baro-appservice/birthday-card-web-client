import { createSampleDesign, type DesignElement } from '@/entities/design';
import type { AssetGateway } from '@/features/editor/core/ports';
import { Ellipse, FabricImage, Rect, Textbox } from 'fabric';
import { describe, expect, it, vi } from 'vitest';

import {
  applyImageCrop,
  elementToFabricObject,
  readTextTransform,
  readTransform,
} from './fabric-element-mapper';
import { getElementId } from './fabric-object-metadata';

const textElement: DesignElement = {
  id: 'title', type: 'text', x: 120, y: 240, width: 600, height: 90, rotation: 12, opacity: 0.7,
  text: '생일 축하해요', fontFamily: 'Pretendard', fontSize: 48, fontWeight: 700,
  color: '#b52262', textAlign: 'center',
};

const assetGateway: AssetGateway = {
  upload: vi.fn(),
  resolveUrl: vi.fn().mockResolvedValue('/assets/birthday.png'),
  remove: vi.fn(),
};

describe('fabric element mapper', () => {
  it('Fabric scale을 Domain width와 height로 정규화한다', () => {
    expect(readTransform({
      left: 120, top: 240, width: 200, height: 100, scaleX: 1.5, scaleY: 2, angle: 12,
    })).toEqual({ x: 120, y: 240, width: 300, height: 200, rotation: 12 });
  });

  it('텍스트 corner scale을 width와 fontSize로 정규화한다', () => {
    expect(readTextTransform({
      left: 120,
      top: 240,
      width: 600,
      height: 80,
      scaleX: 1.5,
      scaleY: 1.5,
      angle: 12,
      fontSize: 48,
    })).toEqual({
      x: 120,
      y: 240,
      width: 900,
      height: 120,
      rotation: 12,
      fontSize: 72,
    });
  });

  it('유효하지 않거나 0인 Fabric 값은 Domain snapshot으로 내보내지 않는다', () => {
    expect(readTransform({
      left: Number.NaN, top: 0, width: 100, height: 50, scaleX: 0, scaleY: Number.NaN, angle: Infinity,
    })).toEqual({ x: 0, y: 0, width: 100, height: 50, rotation: 0 });
  });

  it('유한한 입력의 곱셈이 overflow하면 안전한 양의 크기로 정규화한다', () => {
    const transform = readTransform({
      width: Number.MAX_VALUE,
      height: Number.MAX_VALUE,
      scaleX: 2,
      scaleY: 2,
    });

    expect(Number.isFinite(transform.width)).toBe(true);
    expect(Number.isFinite(transform.height)).toBe(true);
    expect(transform.width).toBeGreaterThan(0);
    expect(transform.height).toBeGreaterThan(0);
  });

  it('텍스트 스타일과 left/top 원점 및 metadata를 Textbox로 옮긴다', async () => {
    const object = await elementToFabricObject(textElement, assetGateway);

    expect(object).toBeInstanceOf(Textbox);
    expect(object).toMatchObject({
      left: 120, top: 240, width: 600, angle: 12, opacity: 0.7,
      originX: 'left', originY: 'top', fontFamily: 'system-ui', fontSize: 48,
      fontWeight: 700, fill: '#b52262', textAlign: 'center', scaleX: 1, scaleY: 1,
    });
    expect(getElementId(object)).toBe('title');
  });

  it('텍스트 height는 저장값으로 글자를 늘이지 않고 내용에서 자연스럽게 계산한다', async () => {
    const title = createSampleDesign().pages[0].elements.find((element) => element.id === 'title');
    if (!title || title.type !== 'text') throw new Error('샘플 title이 없습니다.');

    const mapped = await elementToFabricObject(title, assetGateway);
    const editedAndRemapped = await elementToFabricObject({ ...title, text: '새로운 생일 문구\n두 번째 줄' }, assetGateway);

    expect(mapped).toMatchObject({ width: title.width, fontSize: title.fontSize, scaleX: 1, scaleY: 1 });
    expect(editedAndRemapped).toMatchObject({ width: title.width, fontSize: title.fontSize, scaleX: 1, scaleY: 1 });
    expect(readTransform(mapped).width).toBeCloseTo(title.width, 8);
    expect(readTransform(editedAndRemapped).height).toBeGreaterThan(0);
  });

  it.each([
    ['rectangle', Rect],
    ['circle', Ellipse],
  ] as const)('%s 도형을 순서를 보존할 Fabric 객체로 만든다', async (shape, Constructor) => {
    const object = await elementToFabricObject({
      id: `${shape}-1`, type: 'shape', shape, x: 10, y: 20, width: 80, height: 40,
      rotation: 4, opacity: 0.5, fill: '#ffe0ec',
    }, assetGateway);

    expect(object).toBeInstanceOf(Constructor);
    expect(object).toMatchObject({ left: 10, top: 20, angle: 4, opacity: 0.5, originX: 'left', originY: 'top' });
    expect(getElementId(object)).toBe(`${shape}-1`);
  });

  it('이미지는 기본 crop을 중앙 cover로 계산해 Domain 프레임에 맞춘다', async () => {
    const image = new FabricImage(document.createElement('img'), { width: 400, height: 200 });
    vi.spyOn(image, 'getOriginalSize').mockReturnValue({ width: 400, height: 200 });
    const fromUrl = vi.spyOn(FabricImage, 'fromURL').mockResolvedValue(image);
    vi.mocked(assetGateway.resolveUrl).mockResolvedValueOnce('/assets/party.png');

    const object = await elementToFabricObject({
      id: 'photo', type: 'image', assetId: 'asset-photo', x: 100, y: 200, width: 600, height: 500,
      rotation: 0, opacity: 1, cropZoom: 1, cropX: 0, cropY: 0,
    }, assetGateway);

    expect(assetGateway.resolveUrl).toHaveBeenLastCalledWith('asset-photo');
    expect(fromUrl).toHaveBeenCalledWith('/assets/party.png');
    expect(object).toMatchObject({
      left: 100,
      top: 200,
      cropX: 80,
      cropY: 0,
      width: 240,
      height: 200,
      scaleX: 2.5,
      scaleY: 2.5,
      originX: 'left',
      originY: 'top',
    });
    expect(getElementId(object)).toBe('photo');
  });

  it('crop 확대와 focus를 원본 범위 안에서 계산한다', () => {
    const image = new FabricImage(document.createElement('img'), { width: 400, height: 200 });
    vi.spyOn(image, 'getOriginalSize').mockReturnValue({ width: 400, height: 200 });

    applyImageCrop(image, {
      id: 'photo',
      type: 'image',
      assetId: 'asset-photo',
      x: 0,
      y: 0,
      width: 600,
      height: 500,
      rotation: 0,
      opacity: 1,
      cropZoom: 2,
      cropX: 1,
      cropY: -1,
    });

    expect(image).toMatchObject({
      cropX: 280,
      cropY: 0,
      width: 120,
      height: 100,
      scaleX: 5,
      scaleY: 5,
    });
  });

  it.each(['resolve', 'decode'] as const)(
    '이미지 %s 실패는 element transform과 ID를 보존한 Fabric placeholder로 격리한다',
    async (failurePoint) => {
      const gateway = { resolveUrl: vi.fn().mockResolvedValue('/assets/broken.png') };
      if (failurePoint === 'resolve') gateway.resolveUrl.mockRejectedValueOnce(new Error('missing asset'));
      else vi.spyOn(FabricImage, 'fromURL').mockRejectedValueOnce(new Error('decode failed'));

      const object = await elementToFabricObject({
        id: 'broken-photo', type: 'image', assetId: 'asset-broken', x: 101, y: 202,
        width: 303, height: 404, rotation: 17, opacity: 0.6,
        cropZoom: 1, cropX: 0, cropY: 0,
      }, gateway);

      expect(object).toBeInstanceOf(Rect);
      expect(object).toMatchObject({
        left: 101,
        top: 202,
        width: 303,
        height: 404,
        angle: 17,
        opacity: 0.6,
      });
      expect(getElementId(object)).toBe('broken-photo');
    },
  );
});
