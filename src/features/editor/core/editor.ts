import {
  assertHexColor,
  assertImageCropFocus,
  assertImageCropZoom,
  assertTextFontSize,
  collectDesignAssetIds,
  type BaseElement,
  type Design,
  type DesignElement,
  type ImageElement,
  type ShapeElement,
  type TextElement,
} from '@/entities/design';
import type {
  AssetGateway,
  DesignExporter,
  EditorElementBounds,
  EditorEvent,
  EditorRenderer,
} from '@/features/editor/core/ports';
import type { DesignStore } from '@/features/editor/model/design-store';
import type { EditorRuntimeStore } from '@/features/editor/model/editor-runtime-store';

import { AddElementCommand } from '../commands/add-element-command';
import { ChangeBackgroundCommand } from '../commands/change-background-command';
import { DeleteElementCommand } from '../commands/delete-element-command';
import { ReorderElementCommand } from '../commands/reorder-element-command';
import { TransformElementCommand } from '../commands/transform-element-command';
import { UpdateElementCommand } from '../commands/update-element-command';
import { EditorHistory } from './editor-history';

const ASSET_GC_IDLE_MS = 2_000;
const DUPLICATE_OFFSET = 32;

export interface EditorDependencies {
  designStore: DesignStore;
  runtimeStore: EditorRuntimeStore;
  renderer: EditorRenderer;
  assetGateway: AssetGateway;
  exporter: DesignExporter;
  idGenerator: () => string;
  onDocumentChange: (design: Design) => void;
}

type CommonSelectionChanges = Partial<Pick<BaseElement, 'x' | 'y' | 'rotation' | 'opacity'>>;
type ImageSelectionChanges = Partial<Pick<ImageElement, 'cropZoom' | 'cropX' | 'cropY'>>;

export type SelectionPatch =
  | { type: 'common'; changes: CommonSelectionChanges }
  | {
      type: 'text';
      changes: Partial<Pick<TextElement,
        'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'color' | 'textAlign'>>;
    }
  | { type: 'image'; changes: ImageSelectionChanges }
  | { type: 'shape'; changes: Partial<Pick<ShapeElement, 'fill'>> };

export type CanvasAlignment =
  | 'left'
  | 'horizontal-center'
  | 'right'
  | 'top'
  | 'vertical-center'
  | 'bottom';

export interface UpdateSelectionOptions {
  historyGroup?: string;
}

export interface EditorApi {
  mount(canvas: HTMLCanvasElement): Promise<void>;
  addText(): Promise<void>;
  addShape(shape: ShapeElement['shape']): Promise<void>;
  addImage(file: File): Promise<void>;
  replaceSelectedImage(file: File): Promise<void>;
  updateSelection(patch: SelectionPatch, options?: UpdateSelectionOptions): Promise<void>;
  updateTextElement(
    pageId: string,
    elementId: string,
    text: string,
    options?: UpdateSelectionOptions,
  ): Promise<void>;
  duplicateSelection(): Promise<void>;
  deleteSelection(): Promise<void>;
  bringForward(): Promise<void>;
  sendBackward(): Promise<void>;
  bringToFront(): Promise<void>;
  sendToBack(): Promise<void>;
  alignSelection(alignment: CanvasAlignment): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  setZoom(zoom: number): void;
  selectElement(elementId: string): Promise<void>;
  clearSelection(): Promise<void>;
  setBackground(color: string, options?: UpdateSelectionOptions): Promise<void>;
  exportPng(): Promise<Blob>;
  flushMaintenance(): Promise<void>;
  close(): Promise<void>;
}

const DEFAULT_TEXT: Omit<TextElement, 'id'> = {
  type: 'text',
  x: 180,
  y: 180,
  width: 720,
  height: 120,
  rotation: 0,
  opacity: 1,
  text: '새로운 메시지',
  fontFamily: 'system-ui',
  fontSize: 48,
  fontWeight: 600,
  color: '#5a2740',
  textAlign: 'center',
};

function createShapeElement(id: string, shape: ShapeElement['shape']): ShapeElement {
  const isCircle = shape === 'circle';
  return {
    id,
    type: 'shape',
    x: 390,
    y: 560,
    width: 300,
    height: isCircle ? 300 : 220,
    rotation: 0,
    opacity: 1,
    shape,
    fill: '#ffb6cf',
  };
}

function fitInside(width: number, height: number, maxWidth: number, maxHeight: number) {
  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  return { width: width * scale, height: height * scale };
}

function hasActualChanges(element: DesignElement, changes: Partial<DesignElement>): boolean {
  const current = element as unknown as Record<string, unknown>;
  return Object.entries(changes).some(([key, value]) => current[key] !== value);
}

function assertFiniteProperty(name: string, value: number | undefined): void {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new Error(`${name} 값은 유한한 숫자여야 합니다.`);
  }
}

function assertCommonSelectionChanges(changes: CommonSelectionChanges): void {
  assertFiniteProperty('가로 위치', changes.x);
  assertFiniteProperty('세로 위치', changes.y);
  assertFiniteProperty('회전', changes.rotation);
  if (changes.opacity !== undefined
    && (!Number.isFinite(changes.opacity) || changes.opacity < 0 || changes.opacity > 1)) {
    throw new Error('투명도는 0에서 1 사이여야 합니다.');
  }
}

function assertImageSelectionChanges(changes: ImageSelectionChanges): void {
  if (changes.cropZoom !== undefined) assertImageCropZoom(changes.cropZoom);
  if (changes.cropX !== undefined) assertImageCropFocus(changes.cropX);
  if (changes.cropY !== undefined) assertImageCropFocus(changes.cropY);
}

function duplicateCoordinate(position: number, size: number, limit: number): number {
  const max = Math.max(0, limit - Math.min(Math.abs(size), limit));
  const current = Math.min(max, Math.max(0, position));
  const forward = Math.min(max, current + DUPLICATE_OFFSET);
  if (Math.abs(forward - current) >= 1) return forward;
  return Math.max(0, current - DUPLICATE_OFFSET);
}

function fallbackBounds(element: DesignElement): EditorElementBounds {
  return {
    left: element.x,
    top: element.y,
    width: element.width,
    height: element.height,
  };
}

function usableBounds(bounds: EditorElementBounds | undefined): bounds is EditorElementBounds {
  return Boolean(bounds
    && Number.isFinite(bounds.left)
    && Number.isFinite(bounds.top)
    && Number.isFinite(bounds.width)
    && Number.isFinite(bounds.height)
    && bounds.width >= 0
    && bounds.height >= 0);
}

function alignmentChange(
  element: DesignElement,
  bounds: EditorElementBounds,
  design: Design,
  alignment: CanvasAlignment,
): CommonSelectionChanges {
  if (alignment === 'left') return { x: element.x - bounds.left };
  if (alignment === 'horizontal-center') {
    return { x: element.x + design.width / 2 - (bounds.left + bounds.width / 2) };
  }
  if (alignment === 'right') {
    return { x: element.x + design.width - (bounds.left + bounds.width) };
  }
  if (alignment === 'top') return { y: element.y - bounds.top };
  if (alignment === 'vertical-center') {
    return { y: element.y + design.height / 2 - (bounds.top + bounds.height / 2) };
  }
  return { y: element.y + design.height - (bounds.top + bounds.height) };
}

export class Editor implements EditorApi {
  private readonly history = new EditorHistory();
  private readonly unsubscribe: () => void;
  private operationChain: Promise<void> = Promise.resolve();
  private assetGcTimer: ReturnType<typeof setTimeout> | null = null;
  private closePromise: Promise<void> | null = null;
  private mountAttempted = false;
  private disposed = false;
  private generation = 0;

  constructor(private readonly dependencies: EditorDependencies) {
    this.unsubscribe = dependencies.renderer.subscribe((event) => {
      const eventGeneration = this.generation;
      void this.handleRendererEvent(event, eventGeneration).catch(() => {
        if (this.isActiveGeneration(eventGeneration)) {
          this.dependencies.runtimeStore.getState().setCanvasStatus('error');
        }
      });
    });
  }

  async mount(canvas: HTMLCanvasElement): Promise<void> {
    return this.enqueue(async () => {
      const generation = this.activeGeneration();
      if (this.mountAttempted) throw new Error('이미 mount된 Editor입니다.');
      this.mountAttempted = true;
      try {
        this.dependencies.renderer.mount(canvas);
        this.assertGeneration(generation);
        await this.dependencies.renderer.render(this.design);
        this.assertGeneration(generation);
        this.dependencies.renderer.select(this.selectedElementIds);
        this.assertGeneration(generation);
        this.dependencies.runtimeStore.getState().setCanvasStatus('ready');
        this.scheduleAssetGarbageCollection();
      } catch (error) {
        if (this.isActiveGeneration(generation)) {
          this.dependencies.runtimeStore.getState().setCanvasStatus('error');
        }
        throw error;
      }
    });
  }

  async addText(): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      const id = this.dependencies.idGenerator();
      await this.applyDocumentMutation(() => this.history.execute(new AddElementCommand(
        this.dependencies.designStore,
        this.pageId,
        { ...DEFAULT_TEXT, id },
      )), [id]);
    });
  }

  async addShape(shape: ShapeElement['shape']): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      const id = this.dependencies.idGenerator();
      await this.applyDocumentMutation(() => this.history.execute(new AddElementCommand(
        this.dependencies.designStore,
        this.pageId,
        createShapeElement(id, shape),
      )), [id]);
    });
  }

  async addImage(file: File): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      const asset = await this.dependencies.assetGateway.upload(file);
      try {
        this.assertActive();
        const id = this.dependencies.idGenerator();
        const fitted = fitInside(asset.width, asset.height, 640, 480);
        await this.applyDocumentMutation(() => this.history.execute(new AddElementCommand(
          this.dependencies.designStore,
          this.pageId,
          {
            id,
            type: 'image',
            x: 220,
            y: 380,
            width: fitted.width,
            height: fitted.height,
            rotation: 0,
            opacity: 1,
            assetId: asset.id,
            cropZoom: 1,
            cropX: 0,
            cropY: 0,
          },
        )), [id]);
      } catch (error) {
        await this.rethrowAfterUploadedAssetCompensation(asset.id, error);
      }
    });
  }

  async replaceSelectedImage(file: File): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      const selected = this.singleSelectedElement();
      if (!selected || selected.type !== 'image') return;
      const asset = await this.dependencies.assetGateway.upload(file);
      try {
        this.assertActive();
        await this.applyDocumentMutation(() => this.history.execute(new UpdateElementCommand(
          this.dependencies.designStore,
          this.pageId,
          selected.id,
          { assetId: asset.id, cropZoom: 1, cropX: 0, cropY: 0 },
        )));
      } catch (error) {
        await this.rethrowAfterUploadedAssetCompensation(asset.id, error);
      }
    });
  }

  async updateSelection(
    patch: SelectionPatch,
    options?: UpdateSelectionOptions,
  ): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      const selected = this.singleSelectedElement();
      if (!selected) return;

      if (patch.type === 'common') {
        assertCommonSelectionChanges(patch.changes);
      } else if (patch.type === 'text') {
        if (selected.type !== 'text') return;
        if (patch.changes.fontSize !== undefined) assertTextFontSize(patch.changes.fontSize);
        if (patch.changes.color !== undefined) assertHexColor(patch.changes.color);
      } else if (patch.type === 'image') {
        if (selected.type !== 'image') return;
        assertImageSelectionChanges(patch.changes);
      } else {
        if (selected.type !== 'shape') return;
        if (patch.changes.fill !== undefined) assertHexColor(patch.changes.fill);
      }

      if (!hasActualChanges(selected, patch.changes as Partial<DesignElement>)) return;
      await this.applyDocumentMutation(() => this.history.execute(new UpdateElementCommand(
        this.dependencies.designStore,
        this.pageId,
        selected.id,
        patch.changes as Partial<DesignElement>,
        options?.historyGroup,
      )));
    });
  }

  async updateTextElement(
    pageId: string,
    elementId: string,
    text: string,
    options?: UpdateSelectionOptions,
  ): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      const page = this.design.pages.find((candidate) => candidate.id === pageId);
      const element = page?.elements.find((candidate) => candidate.id === elementId);
      if (!element || element.type !== 'text' || element.text === text) return;
      await this.applyDocumentMutation(() => this.history.execute(new UpdateElementCommand(
        this.dependencies.designStore,
        pageId,
        elementId,
        { text },
        options?.historyGroup,
      )));
    });
  }

  async duplicateSelection(): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      const selected = this.singleSelectedElement();
      const page = this.design.pages.find((candidate) => candidate.id === this.pageId);
      if (!selected || !page) return;
      const index = page.elements.findIndex((element) => element.id === selected.id);
      if (index < 0) return;

      const id = this.dependencies.idGenerator();
      const duplicate = {
        ...selected,
        id,
        x: duplicateCoordinate(selected.x, selected.width, this.design.width),
        y: duplicateCoordinate(selected.y, selected.height, this.design.height),
      } as DesignElement;
      await this.applyDocumentMutation(() => this.history.execute(new AddElementCommand(
        this.dependencies.designStore,
        this.pageId,
        duplicate,
        index + 1,
      )), [id]);
    });
  }

  async deleteSelection(): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      const elementId = this.selectedElementIds.find((id) => this.findElement(id));
      if (!elementId) return;
      await this.applyDocumentMutation(() => this.history.execute(new DeleteElementCommand(
        this.dependencies.designStore,
        this.pageId,
        elementId,
      )), []);
    });
  }

  async bringForward(): Promise<void> {
    await this.reorderSelection(1);
  }

  async sendBackward(): Promise<void> {
    await this.reorderSelection(-1);
  }

  async bringToFront(): Promise<void> {
    await this.reorderSelectionToEdge('front');
  }

  async sendToBack(): Promise<void> {
    await this.reorderSelectionToEdge('back');
  }

  async alignSelection(alignment: CanvasAlignment): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      const selected = this.singleSelectedElement();
      if (!selected) return;
      const measured = this.dependencies.renderer.measureElement?.(selected.id);
      const bounds = usableBounds(measured) ? measured : fallbackBounds(selected);
      const changes = alignmentChange(selected, bounds, this.design, alignment);
      if (!hasActualChanges(selected, changes as Partial<DesignElement>)) return;
      await this.applyDocumentMutation(() => this.history.execute(new UpdateElementCommand(
        this.dependencies.designStore,
        this.pageId,
        selected.id,
        changes as Partial<DesignElement>,
      )));
    });
  }

  async undo(): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      if (!this.history.canUndo()) return;
      const previousSelection = [...this.selectedElementIds];
      await this.applyDocumentMutation(() => {
        this.history.undo();
        const survivingSelection = previousSelection
          .filter((id) => this.findElement(id))
          .slice(0, 1);
        this.dependencies.runtimeStore.getState().setSelectedElementIds(survivingSelection);
      });
    });
  }

  async redo(): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      if (!this.history.canRedo()) return;
      const previousSelection = [...this.selectedElementIds];
      await this.applyDocumentMutation(() => {
        this.history.redo();
        const survivingSelection = previousSelection
          .filter((id) => this.findElement(id))
          .slice(0, 1);
        this.dependencies.runtimeStore.getState().setSelectedElementIds(survivingSelection);
      });
    });
  }

  setZoom(zoom: number): void {
    this.assertActive();
    this.dependencies.runtimeStore.getState().setZoom(zoom);
  }

  async selectElement(elementId: string): Promise<void> {
    return this.enqueue(async () => {
      const generation = this.activeGeneration();
      if (!this.findElement(elementId)) return;
      await this.applySelection([elementId], generation);
    });
  }

  async clearSelection(): Promise<void> {
    return this.enqueue(async () => {
      const generation = this.activeGeneration();
      await this.applySelection([], generation);
    });
  }

  async setBackground(color: string, options?: UpdateSelectionOptions): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      assertHexColor(color);
      const page = this.design.pages.find((candidate) => candidate.id === this.pageId);
      if (!page || page.background === color) return;
      await this.applyDocumentMutation(() => this.history.execute(new ChangeBackgroundCommand(
        this.dependencies.designStore,
        this.pageId,
        color,
        options?.historyGroup,
      )));
    });
  }

  exportPng(): Promise<Blob> {
    return this.enqueue(async () => {
      const generation = this.activeGeneration();
      const blob = await this.dependencies.exporter.exportPng(
        structuredClone(this.design),
        { width: 1080, height: 1350 },
      );
      this.assertGeneration(generation);
      return blob;
    });
  }

  flushMaintenance(): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      this.clearAssetGcTimer();
      await this.dependencies.assetGateway.garbageCollect?.(this.protectedAssetIds());
    });
  }

  close(): Promise<void> {
    if (this.closePromise) return this.closePromise;
    if (!this.disposed) {
      this.disposed = true;
      this.generation += 1;
      this.clearAssetGcTimer();
      this.unsubscribe();
    }

    try {
      this.closePromise = Promise.resolve(this.dependencies.renderer.dispose()).then(() => undefined);
    } catch (error) {
      this.closePromise = Promise.reject(error);
    }
    return this.closePromise;
  }

  dispose(): void {
    void this.close().catch(() => undefined);
  }

  private get design(): Design {
    return this.dependencies.designStore.getState().design;
  }

  private get pageId(): string {
    return this.dependencies.runtimeStore.getState().activePageId;
  }

  private get selectedElementIds(): string[] {
    return this.dependencies.runtimeStore.getState().selectedElementIds;
  }

  private findElement(elementId: string): DesignElement | undefined {
    return this.design.pages
      .find((page) => page.id === this.pageId)
      ?.elements.find((element) => element.id === elementId);
  }

  private singleSelectedElement(): DesignElement | undefined {
    if (this.selectedElementIds.length !== 1) return undefined;
    return this.findElement(this.selectedElementIds[0]);
  }

  private async reorderSelection(offset: -1 | 1): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      const selected = this.singleSelectedElement();
      const page = this.design.pages.find((candidate) => candidate.id === this.pageId);
      if (!selected || !page) return;

      const currentIndex = page.elements.findIndex((element) => element.id === selected.id);
      const nextIndex = currentIndex + offset;
      if (nextIndex < 0 || nextIndex >= page.elements.length) return;

      await this.applyDocumentMutation(() => this.history.execute(new ReorderElementCommand(
        this.dependencies.designStore,
        this.pageId,
        selected.id,
        nextIndex,
      )));
    });
  }

  private async reorderSelectionToEdge(edge: 'front' | 'back'): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      const selected = this.singleSelectedElement();
      const page = this.design.pages.find((candidate) => candidate.id === this.pageId);
      if (!selected || !page) return;
      const currentIndex = page.elements.findIndex((element) => element.id === selected.id);
      const targetIndex = edge === 'front' ? page.elements.length - 1 : 0;
      if (currentIndex < 0 || currentIndex === targetIndex) return;

      await this.applyDocumentMutation(() => this.history.execute(new ReorderElementCommand(
        this.dependencies.designStore,
        this.pageId,
        selected.id,
        targetIndex,
      )));
    });
  }

  private async applyDocumentMutation(
    mutation: () => void,
    selection?: string[],
  ): Promise<void> {
    const generation = this.activeGeneration();
    const previousDesign = structuredClone(this.design);
    const previousSelection = [...this.selectedElementIds];
    const previousHistory = this.history.snapshot();

    try {
      mutation();
      if (selection) this.dependencies.runtimeStore.getState().setSelectedElementIds(selection);
      await this.synchronizeDocument(this.design, this.selectedElementIds, generation);
    } catch (error) {
      this.dependencies.designStore.getState().replaceDesign(previousDesign);
      this.dependencies.runtimeStore.getState().setSelectedElementIds(previousSelection);
      this.history.restore(previousHistory);
      if (this.isActiveGeneration(generation)) {
        try {
          await this.dependencies.renderer.render(previousDesign);
          this.assertGeneration(generation);
          this.dependencies.renderer.select(previousSelection);
        } catch {
          if (this.isActiveGeneration(generation)) {
            this.dependencies.runtimeStore.getState().setCanvasStatus('error');
          }
        }
      }
      throw error;
    }
  }

  private async applyLiveTextMutation(
    mutation: () => void,
    generation: number,
  ): Promise<void> {
    const previousDesign = structuredClone(this.design);
    const previousSelection = [...this.selectedElementIds];
    const previousHistory = this.history.snapshot();

    try {
      mutation();
      this.assertGeneration(generation);
      this.dependencies.onDocumentChange(this.design);
      this.scheduleAssetGarbageCollection();
    } catch (error) {
      this.dependencies.designStore.getState().replaceDesign(previousDesign);
      this.dependencies.runtimeStore.getState().setSelectedElementIds(previousSelection);
      this.history.restore(previousHistory);
      if (this.isActiveGeneration(generation)) {
        try {
          await this.dependencies.renderer.render(previousDesign);
          this.assertGeneration(generation);
          this.dependencies.renderer.select(previousSelection);
        } catch {
          if (this.isActiveGeneration(generation)) {
            this.dependencies.runtimeStore.getState().setCanvasStatus('error');
          }
        }
      }
      throw error;
    }
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationChain.then(operation, operation);
    this.operationChain = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async synchronizeDocument(
    design: Design,
    selection: string[],
    generation: number,
  ): Promise<void> {
    await this.dependencies.renderer.render(design);
    this.assertGeneration(generation);
    this.dependencies.renderer.select(selection);
    this.assertGeneration(generation);
    this.dependencies.onDocumentChange(design);
    this.scheduleAssetGarbageCollection();
  }

  private async handleRendererEvent(event: EditorEvent, eventGeneration: number): Promise<void> {
    if (event.type === 'selection:changed') {
      await this.enqueue(async () => {
        this.assertGeneration(eventGeneration);
        this.dependencies.runtimeStore.getState().setSelectedElementIds(event.elementIds.slice(0, 1));
      });
      return;
    }
    if (event.type === 'element:transformed') {
      await this.enqueue(async () => {
        this.assertGeneration(eventGeneration);
        await this.applyDocumentMutation(() => this.history.execute(new TransformElementCommand(
          this.dependencies.designStore,
          this.pageId,
          event.elementId,
          { before: event.before, after: event.after },
        )));
      });
      return;
    }
    await this.enqueue(async () => {
      this.assertGeneration(eventGeneration);
      const selected = this.findElement(event.elementId);
      if (!selected || selected.type !== 'text' || selected.text === event.after) return;
      await this.applyLiveTextMutation(() => this.history.execute(new UpdateElementCommand(
        this.dependencies.designStore,
        this.pageId,
        event.elementId,
        { text: event.after },
        event.historyGroup,
      )), eventGeneration);
    });
  }

  private async applySelection(selection: string[], generation: number): Promise<void> {
    const previousSelection = [...this.selectedElementIds];
    try {
      this.dependencies.runtimeStore.getState().setSelectedElementIds(selection);
      this.dependencies.renderer.select(selection);
      this.assertGeneration(generation);
    } catch (error) {
      this.dependencies.runtimeStore.getState().setSelectedElementIds(previousSelection);
      if (this.isActiveGeneration(generation)) {
        try {
          this.dependencies.renderer.select(previousSelection);
          this.assertGeneration(generation);
        } catch {
          if (this.isActiveGeneration(generation)) {
            this.dependencies.runtimeStore.getState().setCanvasStatus('error');
          }
        }
      }
      throw error;
    }
  }

  private protectedAssetIds(): ReadonlySet<string> {
    return new Set([
      ...collectDesignAssetIds(this.design),
      ...this.history.referencedAssetIds(),
    ]);
  }

  private scheduleAssetGarbageCollection(): void {
    if (this.disposed || !this.dependencies.assetGateway.garbageCollect) return;
    this.clearAssetGcTimer();
    this.assetGcTimer = setTimeout(() => {
      this.assetGcTimer = null;
      void this.enqueue(async () => {
        if (this.disposed) return;
        await this.dependencies.assetGateway.garbageCollect?.(this.protectedAssetIds());
      }).catch(() => undefined);
    }, ASSET_GC_IDLE_MS);
  }

  private clearAssetGcTimer(): void {
    if (!this.assetGcTimer) return;
    clearTimeout(this.assetGcTimer);
    this.assetGcTimer = null;
  }

  private async rethrowAfterUploadedAssetCompensation(
    assetId: string,
    transactionError: unknown,
  ): Promise<never> {
    try {
      await this.dependencies.assetGateway.remove(assetId);
    } catch (cleanupError) {
      throw new AggregateError(
        [transactionError, cleanupError],
        `업로드 asset ${assetId} 보상 제거에 실패했습니다.`,
      );
    }
    throw transactionError;
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('이미 dispose된 Editor입니다.');
  }

  private activeGeneration(): number {
    this.assertActive();
    return this.generation;
  }

  private isActiveGeneration(generation: number): boolean {
    return !this.disposed && this.generation === generation;
  }

  private assertGeneration(generation: number): void {
    if (!this.isActiveGeneration(generation)) {
      throw new Error('이미 dispose된 Editor입니다.');
    }
  }
}
