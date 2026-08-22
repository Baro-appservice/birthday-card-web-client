import { collectElementAssetIds, type DesignElement } from '@/entities/design';
import type { DesignStore } from '@/features/editor/model/design-store';

import type { EditorCommand } from '../core/editor-command';

export class AddElementCommand implements EditorCommand {
  private readonly index: number;

  constructor(
    private readonly store: DesignStore,
    private readonly pageId: string,
    private readonly element: DesignElement,
    index?: number,
  ) {
    const page = store.getState().design.pages.find((candidate) => candidate.id === pageId);
    if (!page) throw new Error(`존재하지 않는 페이지입니다: ${pageId}`);
    const targetIndex = index ?? page.elements.length;
    if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex > page.elements.length) {
      throw new Error(`유효하지 않은 요소 추가 위치입니다: ${targetIndex}`);
    }
    this.index = targetIndex;
  }

  execute(): void {
    this.store.getState().addElement(this.pageId, this.element);
    this.store.getState().moveElement(this.pageId, this.element.id, this.index);
  }

  undo(): void {
    this.store.getState().removeElement(this.pageId, this.element.id);
  }

  referencedAssetIds(): ReadonlySet<string> {
    return new Set(collectElementAssetIds(this.element));
  }
}
