import type { DesignElement, ElementTransformSnapshot } from '@/entities/design';
import type { DesignStore } from '@/features/editor/model/design-store';

import type { EditorCommand } from '../core/editor-command';

interface TransformChange {
  before: ElementTransformSnapshot;
  after: ElementTransformSnapshot;
}

function findElement(store: DesignStore, pageId: string, elementId: string): DesignElement {
  const page = store.getState().design.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error(`존재하지 않는 페이지입니다: ${pageId}`);
  const element = page.elements.find((candidate) => candidate.id === elementId);
  if (!element) throw new Error(`존재하지 않는 요소입니다: ${elementId}`);
  return element;
}

function applyTransform(
  element: DesignElement,
  transform: ElementTransformSnapshot,
): DesignElement {
  const transformed = {
    ...element,
    x: transform.x,
    y: transform.y,
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
  };

  if (element.type === 'text' && 'fontSize' in transform) {
    return {
      ...transformed,
      fontSize: transform.fontSize,
    };
  }

  return transformed;
}

export class TransformElementCommand implements EditorCommand {
  private readonly before: DesignElement;
  private readonly after: DesignElement;

  constructor(
    private readonly store: DesignStore,
    private readonly pageId: string,
    private readonly elementId: string,
    change: TransformChange,
  ) {
    const element = findElement(store, pageId, elementId);
    this.before = applyTransform(element, change.before);
    this.after = applyTransform(element, change.after);
  }

  execute(): void {
    this.store.getState().replaceElement(this.pageId, this.elementId, this.after);
  }

  undo(): void {
    this.store.getState().replaceElement(this.pageId, this.elementId, this.before);
  }
}
