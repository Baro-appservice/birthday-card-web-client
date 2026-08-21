import type { Design, DesignElement } from '@/entities/design';
import type { AssetGateway, EditorEvent, EditorRenderer } from '@/features/editor/core/ports';
import { Canvas, Ellipse, FabricImage, Rect, Textbox, type FabricObject } from 'fabric';

import { FabricEventAdapter } from './fabric-event-adapter';
import { elementToFabricObject } from './fabric-element-mapper';
import { getElementId } from './fabric-object-metadata';

const APPROVED_FONT_FAMILIES = new Set(['system-ui', 'Arial', 'Georgia']);

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

function positiveOr(value: number | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) > 0
    ? Math.abs(value)
    : fallback;
}

function canReuseObject(
  object: FabricObject,
  previous: DesignElement | undefined,
  next: DesignElement,
): boolean {
  if (!previous || previous.type !== next.type) return false;

  if (next.type === 'text') return object instanceof Textbox;
  if (next.type === 'shape') {
    if (previous.type !== 'shape' || previous.shape !== next.shape) return false;
    return next.shape === 'rectangle' ? object instanceof Rect : object instanceof Ellipse;
  }

  if (previous.type !== 'image' || previous.assetId !== next.assetId) return false;
  // Broken image placeholders are Rects. Keep them stable until the asset id changes
  // instead of retrying the same failed decode on every unrelated document mutation.
  return object instanceof FabricImage || object instanceof Rect;
}

function applyCommonProperties(object: FabricObject, element: DesignElement): void {
  object.set({
    left: element.x,
    top: element.y,
    angle: element.rotation,
    opacity: element.opacity,
  });
}

function patchObject(object: FabricObject, element: DesignElement): void {
  applyCommonProperties(object, element);

  if (element.type === 'text' && object instanceof Textbox) {
    object.set({
      text: element.text,
      width: element.width,
      fontFamily: APPROVED_FONT_FAMILIES.has(element.fontFamily)
        ? element.fontFamily
        : 'system-ui',
      fontSize: element.fontSize,
      fontWeight: element.fontWeight,
      fill: element.color,
      textAlign: element.textAlign,
      scaleX: 1,
      scaleY: 1,
    });
    object.initDimensions();
    object.setControlsVisibility({ mt: false, mb: false });
  } else if (element.type === 'shape' && element.shape === 'rectangle' && object instanceof Rect) {
    object.set({
      width: element.width,
      height: element.height,
      fill: element.fill,
      scaleX: 1,
      scaleY: 1,
    });
  } else if (element.type === 'shape' && element.shape === 'circle' && object instanceof Ellipse) {
    object.set({
      rx: element.width / 2,
      ry: element.height / 2,
      fill: element.fill,
      scaleX: 1,
      scaleY: 1,
    });
  } else if (element.type === 'image' && object instanceof FabricImage) {
    object.set({
      scaleX: element.width / positiveOr(object.width, element.width),
      scaleY: element.height / positiveOr(object.height, element.height),
    });
  } else if (element.type === 'image' && object instanceof Rect) {
    object.set({
      width: element.width,
      height: element.height,
      scaleX: 1,
      scaleY: 1,
    });
  }

  object.setCoords();
}

export class FabricEditorRenderer implements EditorRenderer {
  private canvas: Canvas | undefined;
  private eventAdapter: FabricEventAdapter | undefined;
  private readonly listeners = new Set<(event: EditorEvent) => void>();
  private readonly objectsById = new Map<string, FabricObject>();
  private readonly renderedElements = new Map<string, DesignElement>();
  private renderGeneration = 0;
  private disposed = false;

  constructor(private readonly assetGateway: Pick<AssetGateway, 'resolveUrl'>) {}

  mount(element: HTMLCanvasElement): void {
    this.assertUsable();
    if (this.canvas?.lowerCanvasEl === element) return;
    this.releaseCanvas();
    const canvas = new Canvas(element, {
      preserveObjectStacking: true,
      selection: false,
      selectionKey: null,
      altSelectionKey: null,
    });
    this.canvas = canvas;
    this.eventAdapter = new FabricEventAdapter(canvas, (event) => this.emit(event));
  }

  async render(design: Design): Promise<void> {
    const canvas = this.requireCanvas();
    const generation = ++this.renderGeneration;
    const selection = canvas.getActiveObjects().map(getElementId).filter((id): id is string => Boolean(id));
    const page = design.pages[0];
    if (!page) throw new Error('렌더링할 페이지가 없습니다.');

    const prepared = await Promise.all(page.elements.map(async (element) => {
      const existing = this.objectsById.get(element.id);
      const previous = this.renderedElements.get(element.id);
      if (existing && canReuseObject(existing, previous, element)) {
        return { element, object: existing, reused: true };
      }
      return {
        element,
        object: await elementToFabricObject(element, this.assetGateway),
        reused: false,
      };
    }));

    if (!this.isCurrent(generation, canvas)) return;

    try {
      for (const entry of prepared) {
        if (entry.reused) patchObject(entry.object, entry.element);
      }

      const nextObjects = prepared.map((entry) => entry.object);
      const nextObjectSet = new Set(nextObjects);
      const objectsToRemove = canvas.getObjects().filter((object) => !nextObjectSet.has(object));
      if (objectsToRemove.length > 0) canvas.remove(...objectsToRemove);

      const existingObjects = new Set(canvas.getObjects());
      for (const object of nextObjects) {
        if (!existingObjects.has(object)) canvas.add(object);
      }
      nextObjects.forEach((object, index) => canvas.moveObjectTo(object, index));

      canvas.setDimensions({ width: design.width, height: design.height });
      canvas.backgroundColor = page.background;

      this.objectsById.clear();
      this.renderedElements.clear();
      for (const entry of prepared) {
        this.objectsById.set(entry.element.id, entry.object);
        this.renderedElements.set(entry.element.id, entry.element);
      }

      this.select(selection);
      canvas.requestRenderAll();
    } catch (error) {
      if (this.isCurrent(generation, canvas)) canvas.requestRenderAll();
      throw error;
    }
  }

  select(elementIds: string[]): void {
    const canvas = this.requireCanvas();
    const requested = dedupe(elementIds);
    const object = requested
      .map((elementId) => this.objectsById.get(elementId)
        ?? canvas.getObjects().find((candidate) => getElementId(candidate) === elementId))
      .find((candidate): candidate is FabricObject => candidate !== undefined);
    const currentSelection = canvas.getActiveObjects();
    if ((!object && currentSelection.length === 0)
      || (object && currentSelection.length === 1 && currentSelection[0] === object)) {
      return;
    }

    canvas.discardActiveObject();
    if (object) canvas.setActiveObject(object);
    canvas.requestRenderAll();
  }

  subscribe(listener: (event: EditorEvent) => void): () => void {
    this.assertUsable();
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.renderGeneration += 1;
    this.listeners.clear();
    this.releaseCanvas();
  }

  private emit(event: EditorEvent): void {
    if (this.disposed) return;
    for (const listener of this.listeners) listener(event);
  }

  private requireCanvas(): Canvas {
    this.assertUsable();
    if (!this.canvas) throw new Error('Fabric renderer가 아직 mount되지 않았습니다.');
    return this.canvas;
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('이미 dispose된 Fabric renderer입니다.');
  }

  private isCurrent(generation: number, canvas: Canvas): boolean {
    return !this.disposed && this.renderGeneration === generation && this.canvas === canvas;
  }

  private releaseCanvas(): void {
    this.eventAdapter?.dispose();
    this.eventAdapter = undefined;
    this.objectsById.clear();
    this.renderedElements.clear();
    const canvas = this.canvas;
    this.canvas = undefined;
    if (canvas) void canvas.dispose();
  }
}
