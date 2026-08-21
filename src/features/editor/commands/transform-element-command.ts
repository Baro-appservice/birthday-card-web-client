import {
  clampTextFontSize,
  type DesignElement,
  type ElementTransformSnapshot,
  type TextTransformSnapshot,
} from '@/entities/design';
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

function applyTextTransform(
  element: Extract<DesignElement, { type: 'text' }>,
  transform: TextTransformSnapshot,
): DesignElement {
  const fontSize = clampTextFontSize(transform.fontSize);
  const scaleCorrection = transform.fontSize > 0 ? fontSize / transform.fontSize : 1;

  return {
    ...element,
    x: transform.x,
    y: transform.y,
    width: transform.width * scaleCorrection,
    // v1 compatibility field only. Text height is content-derived and must not
    // be overwritten by Fabric scale/measurement values.
    height: element.height,
    rotation: transform.rotation,
    fontSize,
  };
}

function applyTransform(
  element: DesignElement,
  transform: ElementTransformSnapshot,
): DesignElement {
  if (element.type === 'text' && 'fontSize' in transform) {
    return applyTextTransform(element, transform);
  }

  return {
    ...element,
    x: transform.x,
    y: transform.y,
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
  };
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
    // The design store is the canonical pre-transform state. Renderer snapshots
    // are interaction data and can contain transient Fabric scale values.
    this.before = element;
    this.after = applyTransform(element, change.after);
  }

  execute(): void {
    this.store.getState().replaceElement(this.pageId, this.elementId, this.after);
  }

  undo(): void {
    this.store.getState().replaceElement(this.pageId, this.elementId, this.before);
  }
}
