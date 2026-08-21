import type { DesignElement, TransformSnapshot } from '@/entities/design';
import type { DesignStore } from '@/features/editor/model/design-store';

import type { EditorCommand } from '../core/editor-command';

interface TransformChange {
  before: TransformSnapshot;
  after: TransformSnapshot;
}

function findElement(store: DesignStore, pageId: string, elementId: string): DesignElement {
  const page = store.getState().design.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error(`존재하지 않는 페이지입니다: ${pageId}`);
  const element = page.elements.find((candidate) => candidate.id === elementId);
  if (!element) throw new Error(`존재하지 않는 요소입니다: ${elementId}`);
  return element;
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
    this.before = { ...element, ...change.before };
    this.after = { ...element, ...change.after };
  }

  execute(): void {
    this.store.getState().replaceElement(this.pageId, this.elementId, this.after);
  }

  undo(): void {
    this.store.getState().replaceElement(this.pageId, this.elementId, this.before);
  }
}
