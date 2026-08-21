import {
  assertTextFontSize,
  type Design,
  type DesignElement,
  type ShapeElement,
  type TextElement,
} from '@/entities/design';
import type {
  AssetGateway,
  DesignExporter,
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

export interface EditorDependencies {
  designStore: DesignStore;
  runtimeStore: EditorRuntimeStore;
  renderer: EditorRenderer;
  assetGateway: AssetGateway;
  exporter: DesignExporter;
  idGenerator: () => string;
  onDocumentChange: (design: Design) => void;
}

export type SelectionPatch =
  | {
      type: 'text';
      changes: Partial<Pick<TextElement,
        'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'color' | 'textAlign'>>;
    }
  | { type: 'shape'; changes: Partial<Pick<ShapeElement, 'fill'>> };

export interface UpdateSelectionOptions {
  historyGroup?: string;
}

export interface EditorApi {
  mount(canvas: HTMLCanvasElement): Promise<void>;
  addText(): Promise<void>;
  addShape(shape: 'rectangle' | 'circle'): Promise<void>;
  addImage(file: File): Promise<void>;
  replaceSelectedImage(file: File): Promise<void>;
  updateSelection(patch: SelectionPatch, options?: UpdateSelectionOptions): Promise<void>;
  deleteSelection(): Promise<void>;
  bringForward(): Promise<void>;
  sendBackward(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  setZoom(zoom: number): void;
  selectElement(elementId: string): Promise<void>;
  setBackground(color: string): Promise<void>;
  exportPng(): Promise<Blob>;
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
  return {
    id,
    type: 'shape',
    x: 390,
    y: 560,
    width: 300,
    height: 220,
    rotation: 0,
    opacity: 1,
    shape,
    fill: '#ffb6cf',
  };
}

export class Editor implements EditorApi {
  private readonly history = new EditorHistory();
  private readonly unsubscribe: () => void;
  private operationChain: Promise<void> = Promise.resolve();
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
        await this.applyDocumentMutation(() => this.history.execute(new AddElementCommand(
          this.dependencies.designStore,
          this.pageId,
          {
            id,
            type: 'image',
            x: 220,
            y: 380,
            width: Math.min(asset.width, 640),
            height: Math.min(asset.height, 480),
            rotation: 0,
            opacity: 1,
            assetId: asset.id,
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
          { assetId: asset.id },
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
      if (patch.type === 'text' && patch.changes.fontSize !== undefined) {
        assertTextFontSize(patch.changes.fontSize);
      }
      const selected = this.singleSelectedElement();
      if (!selected || selected.type !== patch.type) return;
      await this.applyDocumentMutation(() => this.history.execute(new UpdateElementCommand(
        this.dependencies.designStore,
        this.pageId,
        selected.id,
        patch.changes as Partial<DesignElement>,
        options?.historyGroup,
      )));
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

  async undo(): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      if (!this.history.canUndo()) return;
      await this.applyDocumentMutation(() => { this.history.undo(); }, []);
    });
  }

  async redo(): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      if (!this.history.canRedo()) return;
      await this.applyDocumentMutation(() => { this.history.redo(); }, []);
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
      const previousSelection = [...this.selectedElementIds];
      try {
        this.dependencies.runtimeStore.getState().setSelectedElementIds([elementId]);
        this.dependencies.renderer.select([elementId]);
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
    });
  }

  async setBackground(color: string): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      await this.applyDocumentMutation(() => this.history.execute(new ChangeBackgroundCommand(
        this.dependencies.designStore,
        this.pageId,
        color,
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

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.generation += 1;
    this.unsubscribe();
    this.dependencies.renderer.dispose();
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
      if (!selected || selected.type !== 'text') return;
      await this.applyDocumentMutation(() => this.history.execute(new UpdateElementCommand(
        this.dependencies.designStore,
        this.pageId,
        event.elementId,
        { text: event.after },
      )));
    });
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
