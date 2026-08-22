import type { Design } from '@/entities/design';
import { describe, expect, it, vi } from 'vitest';

const fabricState = vi.hoisted(() => ({ staticCanvases: [] as any[], nextBlob: undefined as Blob | null | undefined, nextError: undefined as Error | undefined }));

vi.mock('fabric', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fabric')>();
  class StaticCanvas {
    backgroundColor: string | undefined;
    add = vi.fn();
    requestRenderAll = vi.fn();
    dispose = vi.fn(async () => true);
    toBlob = vi.fn(async () => {
      if (fabricState.nextError) throw fabricState.nextError;
      return fabricState.nextBlob === undefined ? new Blob(['png'], { type: 'image/png' }) : fabricState.nextBlob;
    });
    constructor(public readonly element: HTMLCanvasElement, public readonly options: Record<string, unknown>) {
      fabricState.staticCanvases.push(this);
    }
  }
  return { ...actual, StaticCanvas };
});

import { FabricDesignExporter } from './fabric-design-exporter';

const design: Design = {
  version: 3, width: 1080, height: 1350,
  pages: [{
    id: 'page-1', background: '#fff', elements: [{
      id: 'title', type: 'text', text: '생일', x: 10, y: 20, width: 300, height: 80, rotation: 0, opacity: 1,
      fontFamily: 'Arial', fontSize: 32, fontWeight: 700, color: '#000', textAlign: 'left',
    }],
  }],
};

describe('FabricDesignExporter', () => {
  it('1080x1350 StaticCanvas에 모두 렌더한 PNG Blob을 반환한다', async () => {
    const exporter = new FabricDesignExporter({ resolveUrl: vi.fn() });
    const blob = await exporter.exportPng(design, { width: 1080, height: 1350 });
    const canvas = fabricState.staticCanvases.at(-1);

    expect(canvas.options).toMatchObject({ width: 1080, height: 1350 });
    expect(canvas.add).toHaveBeenCalledTimes(1);
    expect(canvas.toBlob).toHaveBeenCalledWith({ format: 'png', multiplier: 1, enableRetinaScaling: false });
    expect(blob.type).toBe('image/png');
    expect(canvas.dispose).toHaveBeenCalledTimes(1);
  });

  it('깨진 이미지가 있으면 placeholder PNG를 만들지 않고 실패한다', async () => {
    const partialDesign: Design = {
      ...design,
      pages: [{
        ...design.pages[0],
        elements: [
          ...design.pages[0].elements,
          {
            id: 'broken-image',
            type: 'image',
            assetId: 'missing',
            x: 10,
            y: 120,
            width: 200,
            height: 150,
            rotation: 9,
            opacity: 1,
            cropZoom: 1,
            cropX: 0,
            cropY: 0,
          },
        ],
      }],
    };
    const exporter = new FabricDesignExporter({
      resolveUrl: vi.fn().mockRejectedValue(new Error('missing asset')),
    });

    await expect(exporter.exportPng(partialDesign, { width: 1080, height: 1350 }))
      .rejects.toThrow('이미지를 렌더링할 수 없습니다');
    expect(fabricState.staticCanvases.at(-1).dispose).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['null Blob', undefined, null],
    ['toBlob 오류', new Error('blob failed'), undefined],
  ])('%s에도 canvas를 항상 dispose한다', async (_name, error, blob) => {
    fabricState.nextError = error;
    fabricState.nextBlob = blob;
    const exporter = new FabricDesignExporter({ resolveUrl: vi.fn() });

    await expect(exporter.exportPng(design, { width: 1080, height: 1350 })).rejects.toThrow(error ? 'blob failed' : 'PNG Blob');
    expect(fabricState.staticCanvases.at(-1).dispose).toHaveBeenCalledTimes(1);
    fabricState.nextError = undefined;
    fabricState.nextBlob = undefined;
  });
});
