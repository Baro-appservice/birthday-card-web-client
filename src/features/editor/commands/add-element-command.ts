import type { DesignElement } from '@/entities/design';
import type { DesignStore } from '@/features/editor/model/design-store';

import type { EditorCommand } from '../core/editor-command';

export class AddElementCommand implements EditorCommand {
  private readonly index: number;

  constructor(
    private readonly store: DesignStore,
    private readonly pageId: string,
    private readonly element: DesignElement,
  ) {
    const page = store.getState().design.pages.find((candidate) => candidate.id === pageId);
    if (!page) throw new Error(`존재하지 않는 페이지입니다: ${pageId}`);
    this.index = page.elements.length;
  }

  execute(): void {
    this.store.getState().addElement(this.pageId, this.element);
    this.store.getState().moveElement(this.pageId, this.element.id, this.index);
  }

  undo(): void {
    this.store.getState().removeElement(this.pageId, this.element.id);
  }
}
