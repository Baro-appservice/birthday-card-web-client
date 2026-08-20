import type { EditorEvent } from '@/features/editor/core/ports';
import type { Canvas, FabricObject } from 'fabric';

import { readTransform } from './fabric-element-mapper';
import { getElementId } from './fabric-object-metadata';

type FabricEvent = { target?: FabricObject; selected?: FabricObject[] };
type TextFabricObject = FabricObject & { text?: string };

function dedupeElementIds(objects: FabricObject[] | undefined): string[] {
  const ids = new Set<string>();
  for (const object of objects ?? []) {
    const elementId = getElementId(object);
    if (elementId) ids.add(elementId);
  }
  return [...ids];
}

function isSameSelection(previous: string[], next: string[]): boolean {
  return previous.length === next.length && previous.every((id, index) => id === next[index]);
}

export class FabricEventAdapter {
  private readonly beforeTransforms = new WeakMap<FabricObject, ReturnType<typeof readTransform>>();
  private readonly beforeTexts = new WeakMap<FabricObject, string>();
  private selection: string[] = [];
  private disposed = false;

  private readonly handlers = {
    selectionCreated: (event: FabricEvent) => this.emitSelection(event.selected),
    selectionUpdated: (event: FabricEvent) => this.emitSelection(event.selected),
    selectionCleared: () => this.emitSelection([]),
    mouseDown: (event: FabricEvent) => this.captureTransform(event.target),
    objectMoving: (event: FabricEvent) => this.captureTransform(event.target),
    objectScaling: (event: FabricEvent) => this.captureTransform(event.target),
    objectRotating: (event: FabricEvent) => this.captureTransform(event.target),
    objectModified: (event: FabricEvent) => this.emitTransform(event.target),
    textEditingEntered: (event: FabricEvent) => this.captureText(event.target),
    textEditingExited: (event: FabricEvent) => this.emitText(event.target),
  };

  constructor(
    private readonly canvas: Canvas,
    private readonly emit: (event: EditorEvent) => void,
  ) {
    this.on('selection:created', this.handlers.selectionCreated);
    this.on('selection:updated', this.handlers.selectionUpdated);
    this.on('selection:cleared', this.handlers.selectionCleared);
    this.on('mouse:down', this.handlers.mouseDown);
    this.on('object:moving', this.handlers.objectMoving);
    this.on('object:scaling', this.handlers.objectScaling);
    this.on('object:rotating', this.handlers.objectRotating);
    this.on('object:modified', this.handlers.objectModified);
    this.on('text:editing:entered', this.handlers.textEditingEntered);
    this.on('text:editing:exited', this.handlers.textEditingExited);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.off('selection:created', this.handlers.selectionCreated);
    this.off('selection:updated', this.handlers.selectionUpdated);
    this.off('selection:cleared', this.handlers.selectionCleared);
    this.off('mouse:down', this.handlers.mouseDown);
    this.off('object:moving', this.handlers.objectMoving);
    this.off('object:scaling', this.handlers.objectScaling);
    this.off('object:rotating', this.handlers.objectRotating);
    this.off('object:modified', this.handlers.objectModified);
    this.off('text:editing:entered', this.handlers.textEditingEntered);
    this.off('text:editing:exited', this.handlers.textEditingExited);
  }

  private on(eventName: string, handler: (event: FabricEvent) => void): void {
    this.canvas.on(eventName as never, handler as never);
  }

  private off(eventName: string, handler: (event: FabricEvent) => void): void {
    this.canvas.off(eventName as never, handler as never);
  }

  private emitSelection(objects: FabricObject[] | undefined): void {
    const elementIds = dedupeElementIds(objects);
    if (isSameSelection(this.selection, elementIds)) return;
    this.selection = elementIds;
    this.emit({ type: 'selection:changed', elementIds });
  }

  private captureTransform(object: FabricObject | undefined): void {
    if (!object || !getElementId(object) || this.beforeTransforms.has(object)) return;
    this.beforeTransforms.set(object, readTransform(object));
  }

  private emitTransform(object: FabricObject | undefined): void {
    if (!object) return;
    const before = this.beforeTransforms.get(object);
    this.beforeTransforms.delete(object);
    const elementId = getElementId(object);
    if (!before || !elementId) return;
    const after = readTransform(object);
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.emit({ type: 'element:transformed', elementId, before, after });
  }

  private captureText(object: FabricObject | undefined): void {
    const textObject = object as TextFabricObject | undefined;
    const elementId = getElementId(object);
    if (!textObject || !elementId || typeof textObject.text !== 'string') return;
    this.beforeTexts.set(textObject, textObject.text);
  }

  private emitText(object: FabricObject | undefined): void {
    const textObject = object as TextFabricObject | undefined;
    if (!textObject) return;
    const before = this.beforeTexts.get(textObject);
    this.beforeTexts.delete(textObject);
    const elementId = getElementId(textObject);
    const after = textObject.text;
    if (!elementId || before === undefined || typeof after !== 'string' || before === after) return;
    this.emit({ type: 'text:edited', elementId, before, after });
  }
}
