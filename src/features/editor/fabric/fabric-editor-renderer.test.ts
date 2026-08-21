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
    remove = vi.fn((...objects: any[]) => {
      const removed = new Set(objects);
      this.objects = this.objects.filter((object) => !removed.has(object));
      this.activeObjects = this.activeObjects.filter((object) => !removed.has(object));
      return objects;
    });
    moveObjectTo = vi.fn((object: any, index: number) => {
      const currentIndex = this.objects.indexOf(object);
      if (currentIndex < 0) return false;
      const boundedIndex = Math.max(0, Math.min(index, this.objects.length - 1));
      if (currentIndex === boundedIndex) return false;
      this.objects.splice(currentIndex, 1);
      this.objects.splice(boundedIndex, 0, object);
      return true;
    });
    clear = vi.fn(() => { this.objects = []; this.activeObjects = []; return this; });
    setDimensions = vi.fn();
    requestRenderAll = vi.fn();
    discardActiveObject = vi.fn(() => { this.activeObjects = []; return this; });
    setActiveObject = vi.fn((object: any) => {
      this.activeObjects = object instanceof ActiveSelection ? object.objects : [object];
      return true;
    });
    dispose = vi.fn(async () => true);
    constructor(element: HTMLCanvasElement, public readonly options: Record<string, unknown>) { this.lowerCanvasEl = element; fabricState.canvases.push(this); }
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
  it('marquee와 modifier 다중 선택을 실제 Canvas 구성 경계에서 끈다', () => {
    const renderer = new FabricEditorRenderer(gateway);
    renderer.mount(canvasElement());

    expect(fabricState.canvases.at(-1).options).toMatchObject({
      preserveObjectStacking: true,
      selection: false,
      selectionKey: null,
      altSelectionKey: null,
    });
    renderer.dispose();
  });

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

  it('같은 element 수정은 Fabric 객체 identity를 유지하고 scale을 정규화한 채 Canvas 전체를 clear하지 않는다', async () => {
    const renderer = new FabricEditorRenderer(gateway);
    renderer.mount(canvasElement());
    const design = textDesign();

    await renderer.render(design);
    const canvas = fabricState.canvases.at(-1);
    const title = canvas.objects.find((object: any) => getElementId(object) === 'title');
    title.set({ scaleX: 1.25, scaleY: 1.25 });
    const updatedTitle = design.pages[0].elements.find((element) => element.id === 'title' && element.type === 'text');
    if (!updatedTitle || updatedTitle.type !== 'text') throw new Error('title 텍스트가 없습니다.');
    const expectedX = updatedTitle.x + 40;
    const updated: Design = {
      ...design,
      pages: [{
        ...design.pages[0],
        elements: design.pages[0].elements.map((element) => element.id === 'title' && element.type === 'text'
          ? { ...element, text: '객체를 유지한 채 수정', color: '#123456', x: expectedX }
          : element),
      }],
    };

    await renderer.render(updated);

    const renderedTitle = canvas.objects.find((object: any) => getElementId(object) === 'title');
    expect(renderedTitle).toBe(title);
    expect(renderedTitle).toMatchObject({
      text: '객체를 유지한 채 수정',
      fill: '#123456',
      left: expectedX,
      scaleX: 1,
      scaleY: 1,
    });
    expect(canvas.clear).not.toHaveBeenCalled();
    renderer.dispose();
  });

  it('programmatic 다중 ID도 첫 요소 하나만 선택해 ActiveSelection을 만들지 않는다', async () => {
    const renderer = new FabricEditorRenderer(gateway);
    renderer.mount(canvasElement());
    const design = textDesign();
    await renderer.render(design);
    renderer.select(['title', 'name']);

    const canvas = fabricState.canvases.at(-1);
    expect(canvas.activeObjects.map(getElementId)).toEqual(['title']);
    expect(canvas.setActiveObject.mock.calls.at(-1)[0]).toBe(canvas.objects[0]);
    renderer.dispose();
  });

  it('깨진 이미지 하나는 placeholder로 격리하고 나머지 요소와 선택을 유지한다', async () => {
    const partialGateway = {
      resolveUrl: vi.fn((assetId: string) => assetId === 'broken'
        ? Promise.reject(new Error('missing'))
        : Promise.resolve('/asset.png')),
    };
    const renderer = new FabricEditorRenderer(partialGateway);
    renderer.mount(canvasElement());
    const design: Design = {
      ...createSampleDesign(),
      pages: [{
        id: 'page-1',
        background: '#fff',
        elements: [
          { id: 'kept-text', type: 'text', text: 'kept', x: 0, y: 0, width: 100, height: 50, rotation: 0, opacity: 1, fontFamily: 'system-ui', fontSize: 20, fontWeight: 400, color: '#000', textAlign: 'left' },
          { id: 'broken-image', type: 'image', assetId: 'broken', x: 10, y: 70, width: 100, height: 100, rotation: 0, opacity: 1 },
          { id: 'kept-shape', type: 'shape', shape: 'rectangle', x: 10, y: 200, width: 100, height: 50, rotation: 0, opacity: 1, fill: '#fff' },
        ],
      }],
    };

    await renderer.render(design);
    renderer.select(['broken-image']);

    const canvas = fabricState.canvases.at(-1);
    expect(canvas.objects.map(getElementId)).toEqual(['kept-text', 'broken-image', 'kept-shape']);
    expect(canvas.activeObjects.map(getElementId)).toEqual(['broken-image']);
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
