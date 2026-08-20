import type {
  Design,
  DesignElement,
  ShapeElement,
  TextElement,
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
import { CompositeEditorCommand, type EditorCommand } from './editor-command';
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

export interface EditorApi {
  mount(canvas: HTMLCanvasElement): Promise<void>;
  addText(): Promise<void>;
  addShape(shape: 'rectangle' | 'circle'): Promise<void>;
  addImage(file: File): Promise<void>;
  replaceSelectedImage(file: File): Promise<void>;
  updateSelection(patch: SelectionPatch): Promise<void>;
  deleteSelection(): Promise<void>;
  bringForward(): Promise<void>;
  sendBackward(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  setZoom(zoom: number): void;
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
  fontFamily: 'Pretendard',
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
  private disposed = false;

  constructor(private readonly dependencies: EditorDependencies) {
    this.unsubscribe = dependencies.renderer.subscribe((event) => {
      void this.handleRendererEvent(event).catch(() => {
        this.dependencies.runtimeStore.getState().setCanvasStatus('error');
      });
    });
  }

  async mount(canvas: HTMLCanvasElement): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      this.dependencies.renderer.mount(canvas);
      try {
        await this.dependencies.renderer.render(this.design);
        this.dependencies.renderer.select(this.selectedElementIds);
        this.dependencies.runtimeStore.getState().setCanvasStatus('ready');
      } catch (error) {
        this.dependencies.runtimeStore.getState().setCanvasStatus('error');
        throw error;
      }
    });
  }

  async addText(): Promise<void> {
    const id = this.dependencies.idGenerator();
    await this.execute(new AddElementCommand(this.dependencies.designStore, this.pageId, {
      ...DEFAULT_TEXT,
      id,
    }), [id]);
  }

  async addShape(shape: ShapeElement['shape']): Promise<void> {
    const id = this.dependencies.idGenerator();
    await this.execute(
      new AddElementCommand(this.dependencies.designStore, this.pageId, createShapeElement(id, shape)),
      [id],
    );
  }

  async addImage(file: File): Promise<void> {
    const asset = await this.dependencies.assetGateway.upload(file);
    const id = this.dependencies.idGenerator();
    await this.execute(new AddElementCommand(this.dependencies.designStore, this.pageId, {
      id,
      type: 'image',
      x: 220,
      y: 380,
      width: Math.min(asset.width, 640),
      height: Math.min(asset.height, 480),
      rotation: 0,
      opacity: 1,
      assetId: asset.id,
    }), [id]);
  }

  async replaceSelectedImage(file: File): Promise<void> {
    const selected = this.singleSelectedElement();
    if (!selected || selected.type !== 'image') return;

    const asset = await this.dependencies.assetGateway.upload(file);
    await this.execute(new UpdateElementCommand(
      this.dependencies.designStore,
      this.pageId,
      selected.id,
      { assetId: asset.id },
    ));
  }

  async updateSelection(patch: SelectionPatch): Promise<void> {
    const selected = this.singleSelectedElement();
    if (!selected || selected.type !== patch.type) return;

    await this.execute(new UpdateElementCommand(
      this.dependencies.designStore,
      this.pageId,
      selected.id,
      patch.changes as Partial<DesignElement>,
    ));
  }

  async deleteSelection(): Promise<void> {
    const selectedIds = this.selectedElementIds.filter((id) => this.findElement(id));
    if (selectedIds.length === 0) return;

    const commands = selectedIds.map((elementId) => new DeleteElementCommand(
      this.dependencies.designStore,
      this.pageId,
      elementId,
    ));
    await this.execute(new CompositeEditorCommand(commands), []);
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
      if (!this.history.undo()) return;
      this.dependencies.runtimeStore.getState().setSelectedElementIds([]);
      await this.synchronizeDocument();
    });
  }

  async redo(): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      if (!this.history.redo()) return;
      this.dependencies.runtimeStore.getState().setSelectedElementIds([]);
      await this.synchronizeDocument();
    });
  }

  setZoom(zoom: number): void {
    this.assertActive();
    this.dependencies.runtimeStore.getState().setZoom(zoom);
  }

  async setBackground(color: string): Promise<void> {
    await this.execute(new ChangeBackgroundCommand(
      this.dependencies.designStore,
      this.pageId,
      color,
    ));
  }

  exportPng(): Promise<Blob> {
    this.assertActive();
    return this.dependencies.exporter.exportPng(this.design, { width: 1080, height: 1350 });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
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
    const selected = this.singleSelectedElement();
    const page = this.design.pages.find((candidate) => candidate.id === this.pageId);
    if (!selected || !page) return;

    const currentIndex = page.elements.findIndex((element) => element.id === selected.id);
    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= page.elements.length) return;

    await this.execute(new ReorderElementCommand(
      this.dependencies.designStore,
      this.pageId,
      selected.id,
      nextIndex,
    ));
  }

  private async execute(command: EditorCommand, selection?: string[]): Promise<void> {
    return this.enqueue(async () => {
      this.assertActive();
      this.history.execute(command);
      if (selection) this.dependencies.runtimeStore.getState().setSelectedElementIds(selection);
      await this.synchronizeDocument();
    });
  }

  private enqueue(operation: () => Promise<void>): Promise<void> {
    const result = this.operationChain.then(operation, operation);
    this.operationChain = result.catch(() => undefined);
    return result;
  }

  private async synchronizeDocument(): Promise<void> {
    await this.dependencies.renderer.render(this.design);
    this.dependencies.onDocumentChange(this.design);
    this.dependencies.renderer.select(this.selectedElementIds);
  }

  private async handleRendererEvent(event: EditorEvent): Promise<void> {
    if (this.disposed) return;
    if (event.type === 'selection:changed') {
      this.dependencies.runtimeStore.getState().setSelectedElementIds(event.elementIds);
      return;
    }
    if (event.type === 'element:transformed') {
      await this.execute(new TransformElementCommand(
        this.dependencies.designStore,
        this.pageId,
        event.elementId,
        { before: event.before, after: event.after },
      ));
      return;
    }
    const selected = this.findElement(event.elementId);
    if (!selected || selected.type !== 'text') return;
    await this.execute(new UpdateElementCommand(
      this.dependencies.designStore,
      this.pageId,
      event.elementId,
      { text: event.after },
    ));
  }

  private assertActive(): void {
    if (this.disposed) throw new Error('이미 dispose된 Editor입니다.');
  }
}
