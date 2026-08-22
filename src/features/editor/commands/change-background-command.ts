import type { DesignStore } from '@/features/editor/model/design-store';

import type { EditorCommand } from '../core/editor-command';

interface ChangeBackgroundState {
  before: string;
  after: string;
}

function findBackground(store: DesignStore, pageId: string): string {
  const page = store.getState().design.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error(`존재하지 않는 페이지입니다: ${pageId}`);
  return page.background;
}

export class ChangeBackgroundCommand implements EditorCommand {
  private readonly before: string;
  private readonly after: string;

  constructor(
    private readonly store: DesignStore,
    private readonly pageId: string,
    after: string,
    private readonly historyGroup?: string,
    state?: ChangeBackgroundState,
  ) {
    this.before = state?.before ?? findBackground(store, pageId);
    this.after = state?.after ?? after;
  }

  execute(): void {
    this.store.getState().setBackground(this.after, this.pageId);
  }

  undo(): void {
    this.store.getState().setBackground(this.before, this.pageId);
  }

  mergeWith(next: EditorCommand): EditorCommand | null {
    if (!(next instanceof ChangeBackgroundCommand)) return null;
    if (!this.historyGroup || this.historyGroup !== next.historyGroup) return null;
    if (this.store !== next.store || this.pageId !== next.pageId) return null;
    return new ChangeBackgroundCommand(
      this.store,
      this.pageId,
      next.after,
      this.historyGroup,
      { before: this.before, after: next.after },
    );
  }
}
