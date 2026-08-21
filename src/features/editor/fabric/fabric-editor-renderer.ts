import type { Design } from '@/entities/design';
import type { AssetGateway, EditorEvent, EditorRenderer } from '@/features/editor/core/ports';
import { Canvas, type FabricObject } from 'fabric';

import { FabricEventAdapter } from './fabric-event-adapter';
import { pageToFabricObjects } from './fabric-element-mapper';
import { getElementId } from './fabric-object-metadata';

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}

export class FabricEditorRenderer implements EditorRenderer {
  private canvas: Canvas | undefined;
  private eventAdapter: FabricEventAdapter | undefined;
  private readonly listeners = new Set<(event: EditorEvent) => void>();
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

    let objects: FabricObject[];
    try {
      objects = await pageToFabricObjects(page, this.assetGateway);
    } catch (error) {
      if (this.isCurrent(generation, canvas)) canvas.clear();
      if (this.isCurrent(generation, canvas)) throw error;
      return;
    }
    if (!this.isCurrent(generation, canvas)) return;

    try {
      canvas.clear();
      canvas.setDimensions({ width: design.width, height: design.height });
      canvas.backgroundColor = page.background;
      canvas.add(...objects);
      this.select(selection);
      canvas.requestRenderAll();
    } catch (error) {
      if (this.isCurrent(generation, canvas)) canvas.clear();
      throw error;
    }
  }

  select(elementIds: string[]): void {
    const canvas = this.requireCanvas();
    const requested = dedupe(elementIds);
    const object = requested
      .map((elementId) => canvas.getObjects().find((candidate) => getElementId(candidate) === elementId))
      .find((candidate): candidate is FabricObject => candidate !== undefined);
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
    const canvas = this.canvas;
    this.canvas = undefined;
    if (canvas) void canvas.dispose();
  }
}
