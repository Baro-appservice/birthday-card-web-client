import type { DesignElement } from '@/entities/design';
import type { DesignStore } from '@/features/editor/model/design-store';

import type { EditorCommand } from '../core/editor-command';

function findCapturedElement(store: DesignStore, pageId: string, elementId: string): {
  element: DesignElement;
  index: number;
} {
  const page = store.getState().design.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error(`존재하지 않는 페이지입니다: ${pageId}`);
  const index = page.elements.findIndex((candidate) => candidate.id === elementId);
  if (index < 0) throw new Error(`존재하지 않는 요소입니다: ${elementId}`);
  return { element: page.elements[index], index };
}

export class DeleteElementCommand implements EditorCommand {
  private readonly element: DesignElement;
  private readonly index: number;

  constructor(
    private readonly store: DesignStore,
    private readonly pageId: string,
    private readonly elementId: string,
  ) {
    const captured = findCapturedElement(store, pageId, elementId);
    this.element = captured.element;
    this.index = captured.index;
  }

  execute(): void {
    this.store.getState().removeElement(this.pageId, this.elementId);
  }

  undo(): void {
    this.store.getState().addElement(this.pageId, this.element);
    this.store.getState().moveElement(this.pageId, this.elementId, this.index);
  }
}
