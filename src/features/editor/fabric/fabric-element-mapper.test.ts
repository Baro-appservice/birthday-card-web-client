import { createSampleDesign, type DesignElement } from '@/entities/design';
import type { AssetGateway } from '@/features/editor/core/ports';
import { Ellipse, FabricImage, Rect, Textbox } from 'fabric';
import { describe, expect, it, vi } from 'vitest';

import { elementToFabricObject, readTransform } from './fabric-element-mapper';
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

  it('유효하지 않거나 0인 Fabric 값은 Domain snapshot으로 내보내지 않는다', () => {
    expect(readTransform({
      left: Number.NaN, top: 0, width: 100, height: 50, scaleX: 0, scaleY: Number.NaN, angle: Infinity,
    })).toEqual({ x: 0, y: 0, width: 100, height: 50, rotation: 0 });
  });

  it('텍스트 스타일과 left/top 원점 및 metadata를 Textbox로 옮긴다', async () => {
    const object = await elementToFabricObject(textElement, assetGateway);

    expect(object).toBeInstanceOf(Textbox);
    expect(object).toMatchObject({
      left: 120, top: 240, width: 600, angle: 12, opacity: 0.7,
      originX: 'left', originY: 'top', fontFamily: 'Pretendard', fontSize: 48,
      fontWeight: 700, fill: '#b52262', textAlign: 'center',
    });
    expect(getElementId(object)).toBe('title');
  });

  it('샘플 title은 Textbox base height와 무관하게 Domain transform을 round-trip한다', async () => {
    const title = createSampleDesign().pages[0].elements.find((element) => element.id === 'title');
    if (!title || title.type !== 'text') throw new Error('샘플 title이 없습니다.');

    const mapped = await elementToFabricObject(title, assetGateway);
    const editedAndRemapped = await elementToFabricObject({ ...title, text: '새로운 생일 문구' }, assetGateway);

    expect(readTransform(mapped)).toEqual({
      x: title.x, y: title.y, width: title.width, height: title.height, rotation: title.rotation,
    });
    expect(readTransform(editedAndRemapped)).toEqual({
      x: title.x, y: title.y, width: title.width, height: title.height, rotation: title.rotation,
    });
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

  it('이미지는 AssetGateway URL과 원본 비율을 사용해 Domain 크기로 맞춘다', async () => {
    const image = new FabricImage(document.createElement('img'), { width: 400, height: 200 });
    const fromUrl = vi.spyOn(FabricImage, 'fromURL').mockResolvedValue(image);
    vi.mocked(assetGateway.resolveUrl).mockResolvedValueOnce('/assets/party.png');

    const object = await elementToFabricObject({
      id: 'photo', type: 'image', assetId: 'asset-photo', x: 100, y: 200, width: 600, height: 500,
      rotation: 0, opacity: 1,
    }, assetGateway);

    expect(assetGateway.resolveUrl).toHaveBeenLastCalledWith('asset-photo');
    expect(fromUrl).toHaveBeenCalledWith('/assets/party.png');
    expect(object).toMatchObject({ left: 100, top: 200, scaleX: 1.5, scaleY: 2.5, originX: 'left', originY: 'top' });
    expect(getElementId(object)).toBe('photo');
  });
});
