import { createSampleDesign, type Design } from '@/entities/design';
import { FabricImage } from 'fabric';
import { describe, expect, it, vi } from 'vitest';

const fabricState = vi.hoisted(() => ({ canvases: [] as any[] }));

vi.mock('fabric', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fabric')>();
  class ActiveSelection {
    constructor(public readonly objects: unknown[], options: Record<string, unknown>) {
      Object.assign(this, options);
    }
  }
  class Canvas {
    lowerCanvasEl: HTMLCanvasElement;
    objects: any[] = [];
    activeObjects: any[] = [];
    handlers = new Map<string, (event: Record<string, unknown>) => void>();
    backgroundColor: string | undefined;
    add = vi.fn((...objects: any[]) => { this.objects.push(...objects); return this; });
    clear = vi.fn(() => { this.objects = []; this.activeObjects = []; return this; });
    setDimensions = vi.fn();
    requestRenderAll = vi.fn();
    discardActiveObject = vi.fn(() => { this.activeObjects = []; return this; });
    setActiveObject = vi.fn((object: any) => {
      this.activeObjects = object instanceof ActiveSelection ? object.objects : [object];
      return true;
    });
    dispose = vi.fn(async () => true);
    constructor(element: HTMLCanvasElement) { this.lowerCanvasEl = element; fabricState.canvases.push(this); }
    getObjects() { return this.objects; }
    getActiveObjects() { return this.activeObjects; }
    on(event: string, handler: (event: Record<string, unknown>) => void) { this.handlers.set(event, handler); return () => this.off(event, handler); }
    off(event: string, handler: (event: Record<string, unknown>) => void) { if (this.handlers.get(event) === handler) this.handlers.delete(event); }
  }
  return { ...actual, Canvas, ActiveSelection };
});

import { FabricEditorRenderer } from './fabric-editor-renderer';
import { getElementId } from './fabric-object-metadata';

const gateway = { resolveUrl: vi.fn().mockResolvedValue('/asset.png') };
const canvasElement = () => document.createElement('canvas');
const textDesign = (): Design => {
  const design = createSampleDesign();
  return { ...design, pages: [{ ...design.pages[0], elements: design.pages[0].elements.filter((element) => element.type === 'text') }] };
};

describe('FabricEditorRenderer', () => {
  it('render 전 선택을 복원하고 없는 ID는 안전하게 제외한다', async () => {
    const renderer = new FabricEditorRenderer(gateway);
    renderer.mount(canvasElement());
    const design = textDesign();

    await renderer.render(design);
    renderer.select(['title', 'not-found']);
    await renderer.render({ ...design, pages: [{ ...design.pages[0], elements: design.pages[0].elements.filter((element) => element.id !== 'name') }] });

    const canvas = fabricState.canvases.at(-1);
    expect(canvas.activeObjects.map(getElementId)).toEqual(['title']);
    renderer.dispose();
  });

  it('여러 요소 ActiveSelection은 Domain transform을 만들 수 없게 잠근다', async () => {
    const renderer = new FabricEditorRenderer(gateway);
    renderer.mount(canvasElement());
    const design = textDesign();
    await renderer.render(design);
    renderer.select(['title', 'name']);

    const canvas = fabricState.canvases.at(-1);
    const group = canvas.setActiveObject.mock.calls.at(-1)[0];
    expect(group).toMatchObject({ lockMovementX: true, lockMovementY: true, lockScalingX: true, lockScalingY: true, lockRotation: true });
    renderer.dispose();
  });

  it('느린 이전 이미지 render가 최신 render 결과를 덮어쓰지 않는다', async () => {
    const renderer = new FabricEditorRenderer(gateway);
    renderer.mount(canvasElement());
    let resolveImage: ((image: FabricImage) => void) | undefined;
    const image = new FabricImage(document.createElement('img'), { width: 100, height: 100 });
    vi.spyOn(FabricImage, 'fromURL').mockImplementationOnce(() => new Promise((resolve) => { resolveImage = resolve; }));
    const imageDesign: Design = { ...createSampleDesign(), pages: [{ id: 'image-page', background: '#fff', elements: [{ id: 'old-image', type: 'image', assetId: 'old', x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 }] }] };
    const latestDesign: Design = { ...imageDesign, pages: [{ id: 'latest-page', background: '#fff', elements: [{ id: 'latest-text', type: 'text', text: 'latest', x: 0, y: 0, width: 100, height: 50, rotation: 0, opacity: 1, fontFamily: 'Arial', fontSize: 20, fontWeight: 400, color: '#000', textAlign: 'left' }] }] };

    const stale = renderer.render(imageDesign);
    await renderer.render(latestDesign);
    resolveImage?.(image);
    await stale;

    const canvas = fabricState.canvases.at(-1);
    expect(canvas.objects.map(getElementId)).toEqual(['latest-text']);
    renderer.dispose();
  });

  it('중복 mount, subscribe 해제와 dispose teardown을 정확히 처리한다', async () => {
    const renderer = new FabricEditorRenderer(gateway);
    const element = canvasElement();
    renderer.mount(element);
    renderer.mount(element);
    const listener = vi.fn();
    const unsubscribe = renderer.subscribe(listener);
    const canvas = fabricState.canvases.at(-1);

    await renderer.render(textDesign());
    canvas.activeObjects = [canvas.objects[0]];
    canvas.handlers.get('selection:created')({ selected: [canvas.objects[0]] });
    unsubscribe();
    canvas.activeObjects = [];
    canvas.handlers.get('selection:cleared')({});
    renderer.dispose();
    renderer.dispose();

    expect(fabricState.canvases.filter((candidate) => candidate.lowerCanvasEl === element)).toHaveLength(1);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(canvas.dispose).toHaveBeenCalledTimes(1);
    expect(canvas.handlers).toHaveLength(0);
    expect(() => renderer.subscribe(listener)).toThrow('dispose');
  });
});
