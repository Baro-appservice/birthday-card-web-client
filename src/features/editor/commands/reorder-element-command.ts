import type { DesignStore } from '@/features/editor/model/design-store';

import type { EditorCommand } from '../core/editor-command';

function findElementIndex(store: DesignStore, pageId: string, elementId: string): number {
  const page = store.getState().design.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error(`존재하지 않는 페이지입니다: ${pageId}`);
  const index = page.elements.findIndex((candidate) => candidate.id === elementId);
  if (index < 0) throw new Error(`존재하지 않는 요소입니다: ${elementId}`);
  return index;
}

export class ReorderElementCommand implements EditorCommand {
  private readonly beforeIndex: number;

  constructor(
    private readonly store: DesignStore,
    private readonly pageId: string,
    private readonly elementId: string,
    private readonly afterIndex: number,
  ) {
    this.beforeIndex = findElementIndex(store, pageId, elementId);
  }

  execute(): void {
    this.store.getState().moveElement(this.pageId, this.elementId, this.afterIndex);
  }

  undo(): void {
    this.store.getState().moveElement(this.pageId, this.elementId, this.beforeIndex);
  }
}
