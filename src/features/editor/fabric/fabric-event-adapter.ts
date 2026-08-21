import type { EditorEvent } from '@/features/editor/core/ports';
import { Textbox, type Canvas, type FabricObject } from 'fabric';

import { readTextTransform, readTransform } from './fabric-element-mapper';
import { getElementId } from './fabric-object-metadata';

type FabricEvent = { target?: FabricObject; selected?: FabricObject[] };
type TextFabricObject = FabricObject & { text?: string };

type TransformSnapshot = Extract<EditorEvent, { type: 'element:transformed' }>['before'];

let nextCanvasTextSession = 1;

function firstElementId(objects: FabricObject[] | undefined): string[] {
  for (const object of objects ?? []) {
    const elementId = getElementId(object);
    if (elementId) return [elementId];
  }
  return [];
}

function isSameSelection(previous: string[], next: string[]): boolean {
  return previous.length === next.length && previous.every((id, index) => id === next[index]);
}

function readObjectTransform(object: FabricObject): TransformSnapshot {
  return object instanceof Textbox ? readTextTransform(object) : readTransform(object);
}

export class FabricEventAdapter {
  private readonly beforeTransforms = new WeakMap<FabricObject, TransformSnapshot>();
  private readonly lastTexts = new WeakMap<FabricObject, string>();
  private readonly textHistoryGroups = new WeakMap<FabricObject, string>();
  private selection: string[] = [];
  private disposed = false;
  private suppressSelectionEvents = 0;

  private readonly handlers = {
    selectionCreated: () => this.emitSelection(this.canvas.getActiveObjects()),
    selectionUpdated: () => this.emitSelection(this.canvas.getActiveObjects()),
    selectionCleared: () => this.emitSelection([]),
    beforeTransform: (event: FabricEvent) => this.captureTransform(event.target, true),
    objectMoving: (event: FabricEvent) => this.captureTransform(event.target),
    objectScaling: (event: FabricEvent) => this.captureTransform(event.target),
    objectRotating: (event: FabricEvent) => this.captureTransform(event.target),
    objectModified: (event: FabricEvent) => this.emitTransform(event.target),
    textEditingEntered: (event: FabricEvent) => this.captureText(event.target),
    textChanged: (event: FabricEvent) => this.emitText(event.target),
    textEditingExited: (event: FabricEvent) => this.finishText(event.target),
  };

  constructor(
    private readonly canvas: Canvas,
    private readonly emit: (event: EditorEvent) => void,
  ) {
    this.on('selection:created', this.handlers.selectionCreated);
    this.on('selection:updated', this.handlers.selectionUpdated);
    this.on('selection:cleared', this.handlers.selectionCleared);
    this.on('before:transform', this.handlers.beforeTransform);
    this.on('object:moving', this.handlers.objectMoving);
    this.on('object:scaling', this.handlers.objectScaling);
    this.on('object:rotating', this.handlers.objectRotating);
    this.on('object:modified', this.handlers.objectModified);
    this.on('text:editing:entered', this.handlers.textEditingEntered);
    this.on('text:changed', this.handlers.textChanged);
    this.on('text:editing:exited', this.handlers.textEditingExited);
  }

  runWithoutSelectionEvents<T>(operation: () => T): T {
    this.suppressSelectionEvents += 1;
    try {
      return operation();
    } finally {
      this.suppressSelectionEvents -= 1;
      // Programmatic selection changes intentionally suppress Fabric events, but
      // the adapter's dedupe snapshot must still follow the actual Canvas state.
      // Otherwise a later user selection can be mistaken for a duplicate and be
      // dropped, leaving Canvas selection and runtime selection out of sync.
      if (this.suppressSelectionEvents === 0) {
        this.selection = firstElementId(this.canvas.getActiveObjects());
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.off('selection:created', this.handlers.selectionCreated);
    this.off('selection:updated', this.handlers.selectionUpdated);
    this.off('selection:cleared', this.handlers.selectionCleared);
    this.off('before:transform', this.handlers.beforeTransform);
    this.off('object:moving', this.handlers.objectMoving);
    this.off('object:scaling', this.handlers.objectScaling);
    this.off('object:rotating', this.handlers.objectRotating);
    this.off('object:modified', this.handlers.objectModified);
    this.off('text:editing:entered', this.handlers.textEditingEntered);
    this.off('text:changed', this.handlers.textChanged);
    this.off('text:editing:exited', this.handlers.textEditingExited);
  }

  private on(eventName: string, handler: (event: FabricEvent) => void): void {
    this.canvas.on(eventName as never, handler as never);
  }

  private off(eventName: string, handler: (event: FabricEvent) => void): void {
    this.canvas.off(eventName as never, handler as never);
  }

  private emitSelection(objects: FabricObject[] | undefined): void {
    if (this.suppressSelectionEvents > 0) return;
    const elementIds = firstElementId(objects);
    if (isSameSelection(this.selection, elementIds)) return;
    this.selection = elementIds;
    this.emit({ type: 'selection:changed', elementIds });
  }

  private captureTransform(object: FabricObject | undefined, overwrite = false): void {
    if (!object || !getElementId(object)) return;
    if (!overwrite && this.beforeTransforms.has(object)) return;
    this.beforeTransforms.set(object, readObjectTransform(object));
  }

  private emitTransform(object: FabricObject | undefined): void {
    if (!object) return;
    const before = this.beforeTransforms.get(object);
    this.beforeTransforms.delete(object);
    const elementId = getElementId(object);
    if (!before || !elementId) return;
    const after = readObjectTransform(object);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.emit({ type: 'element:transformed', elementId, before, after });
  }

  private captureText(object: FabricObject | undefined): void {
    const textObject = object as TextFabricObject | undefined;
    const elementId = getElementId(object);
    if (!textObject || !elementId || typeof textObject.text !== 'string') return;
    this.lastTexts.set(textObject, textObject.text);
    this.textHistoryGroups.set(
      textObject,
      `canvas-text:${elementId}:${nextCanvasTextSession++}`,
    );
  }

  private emitText(object: FabricObject | undefined): void {
    const textObject = object as TextFabricObject | undefined;
    if (!textObject) return;
    const before = this.lastTexts.get(textObject);
    const elementId = getElementId(textObject);
    const after = textObject.text;
    if (!elementId || before === undefined || typeof after !== 'string' || before === after) return;
    this.lastTexts.set(textObject, after);
    this.emit({
      type: 'text:edited',
      elementId,
      before,
      after,
      historyGroup: this.textHistoryGroups.get(textObject),
    });
  }

  private finishText(object: FabricObject | undefined): void {
    if (!object) return;
    this.emitText(object);
    this.lastTexts.delete(object);
    this.textHistoryGroups.delete(object);
  }
}
