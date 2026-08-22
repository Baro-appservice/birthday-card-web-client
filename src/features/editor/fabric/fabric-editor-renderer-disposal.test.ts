import { createSampleDesign, type Design } from '@/entities/design';
import { FabricImage } from 'fabric';
import { describe, expect, it, vi } from 'vitest';

const fabricState = vi.hoisted(() => ({ canvases: [] as any[] }));

vi.mock('fabric', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fabric')>();
  class Canvas {
    lowerCanvasEl: HTMLCanvasElement;
    objects: any[] = [];
    activeObjects: any[] = [];
    backgroundColor: string | undefined;
    handlers = new Map<string, (event: Record<string, unknown>) => void>();
    constructor(element: HTMLCanvasElement) {
      this.lowerCanvasEl = element;
      fabricState.canvases.push(this);
    }
    getObjects() { return this.objects; }
    getActiveObjects() { return this.activeObjects; }
    add(...objects: any[]) { this.objects.push(...objects); return this; }
    remove(...objects: any[]) {
      const removed = new Set(objects);
      this.objects = this.objects.filter((object) => !removed.has(object));
      this.activeObjects = this.activeObjects.filter((object) => !removed.has(object));
      return objects;
    }
    moveObjectTo(object: any, index: number) {
      const currentIndex = this.objects.indexOf(object);
      if (currentIndex < 0 || currentIndex === index) return false;
      this.objects.splice(currentIndex, 1);
      this.objects.splice(index, 0, object);
      return true;
    }
    setDimensions() {}
    requestRenderAll() {}
    discardActiveObject() { this.activeObjects = []; return this; }
    setActiveObject(object: any) { this.activeObjects = [object]; return true; }
    on(event: string, handler: (event: Record<string, unknown>) => void) {
      this.handlers.set(event, handler);
      return () => this.off(event, handler);
    }
    off(event: string, handler: (event: Record<string, unknown>) => void) {
      if (this.handlers.get(event) === handler) this.handlers.delete(event);
    }
    async dispose() { return true; }
  }
  return { ...actual, Canvas };
});

import { FabricEditorRenderer } from './fabric-editor-renderer';
import { getElementId } from './fabric-object-metadata';

const gateway = { resolveUrl: vi.fn().mockResolvedValue('/asset.png') };

function oneTextDesign(): Design {
  const design = createSampleDesign();
  return {
    ...design,
    pages: [{
      ...design.pages[0],
      elements: design.pages[0].elements.filter((element) => element.id === 'title'),
    }],
  };
}

describe('FabricEditorRenderer object disposal', () => {
  it('Design에서 빠진 Fabric 객체를 Canvas 제거 직후 dispose한다', async () => {
    const renderer = new FabricEditorRenderer(gateway);
    renderer.mount(document.createElement('canvas'));
    const design = oneTextDesign();
    await renderer.render(design);

    const canvas = fabricState.canvases.at(-1);
    const title = canvas.objects.find((object: any) => getElementId(object) === 'title');
    const dispose = vi.spyOn(title, 'dispose');

    await renderer.render({
      ...design,
      pages: [{ ...design.pages[0], elements: [] }],
    });

    expect(dispose).toHaveBeenCalledOnce();
    expect(canvas.objects).not.toContain(title);
    await renderer.dispose();
  });

  it('dispose 중 완료된 stale 이미지 render의 미사용 객체도 dispose한다', async () => {
    const renderer = new FabricEditorRenderer(gateway);
    renderer.mount(document.createElement('canvas'));
    let resolveImage: ((image: FabricImage) => void) | undefined;
    const image = new FabricImage(document.createElement('img'), { width: 100, height: 100 });
    const imageDispose = vi.spyOn(image, 'dispose');
    vi.spyOn(FabricImage, 'fromURL').mockImplementationOnce(() => new Promise((resolve) => {
      resolveImage = resolve;
    }));
    const design: Design = {
      ...createSampleDesign(),
      pages: [{
        id: 'page-1',
        background: '#ffffff',
        elements: [{
          id: 'slow-image',
          type: 'image',
          assetId: 'asset:slow',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          cropZoom: 1,
          cropFocusX: 0,
          cropFocusY: 0,
        }],
      }],
    };

    const rendering = renderer.render(design);
    const closing = renderer.dispose();
    resolveImage?.(image);

    await rendering;
    await closing;

    expect(imageDispose).toHaveBeenCalledOnce();
  });
});
