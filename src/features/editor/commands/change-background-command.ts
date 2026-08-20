import type { DesignStore } from '@/features/editor/model/design-store';

import type { EditorCommand } from '../core/editor-command';

function findBackground(store: DesignStore, pageId: string): string {
  const page = store.getState().design.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error(`존재하지 않는 페이지입니다: ${pageId}`);
  return page.background;
}

export class ChangeBackgroundCommand implements EditorCommand {
  private readonly before: string;

  constructor(
    private readonly store: DesignStore,
    private readonly pageId: string,
    private readonly after: string,
  ) {
    this.before = findBackground(store, pageId);
  }

  execute(): void {
    this.store.getState().setBackground(this.after, this.pageId);
  }

  undo(): void {
    this.store.getState().setBackground(this.before, this.pageId);
  }
}
