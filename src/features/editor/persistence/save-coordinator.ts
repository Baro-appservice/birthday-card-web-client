import type { Design } from '@/entities/design';
import type { DesignRepository } from '@/features/editor/core/ports';
import type { EditorUiStore } from '@/features/editor/model/editor-ui-store';

const SAVE_DEBOUNCE_MS = 600;

interface PendingSave {
  design: Design;
  revision: number;
}

function cloneDesign(design: Design): Design {
  return structuredClone(design);
}

export class SaveCoordinator {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: PendingSave | null = null;
  private lastFailed: Design | null = null;
  private writePromise: Promise<void> | null = null;
  private revision = 0;
  private disposed = false;

  constructor(
    private readonly cardId: string,
    private readonly repository: DesignRepository,
    private readonly uiStore: EditorUiStore,
  ) {}

  schedule(design: Design): void {
    if (this.disposed) return;
    this.revision += 1;
    this.pending = { design: cloneDesign(design), revision: this.revision };
    this.lastFailed = null;
    this.uiStore.getState().setSaveStatus('saving');
    this.uiStore.getState().setError(null);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.flushScheduled();
    }, SAVE_DEBOUNCE_MS);
  }

  async flush(): Promise<void> {
    if (this.disposed) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    while (!this.disposed) {
      if (this.writePromise) await this.writePromise;
      const pending = this.pending;
      if (!pending) return;
      this.pending = null;
      await this.write(pending);
    }
  }

  async retry(): Promise<void> {
    if (this.disposed) return;
    if (this.lastFailed) {
      this.revision += 1;
      this.pending = { design: cloneDesign(this.lastFailed), revision: this.revision };
      this.lastFailed = null;
      this.uiStore.getState().setSaveStatus('saving');
      this.uiStore.getState().setError(null);
    }
    await this.flush();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.revision += 1;
    this.pending = null;
    this.lastFailed = null;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private async write(pending: PendingSave): Promise<void> {
    const operation = Promise.resolve().then(() => this.repository.save(this.cardId, pending.design));
    const settled = operation.then(
      () => ({ status: 'fulfilled' as const }),
      (error: unknown) => ({ status: 'rejected' as const, error }),
    );
    const writeCompletion = settled.then(() => undefined);
    this.writePromise = writeCompletion;
    const result = await settled;
    try {
      if (result.status === 'fulfilled') {
        if (!this.disposed && pending.revision === this.revision && !this.pending) {
          this.uiStore.getState().setSaveStatus('saved');
          this.uiStore.getState().setError(null);
        }
        return;
      }
      if (!this.disposed && pending.revision === this.revision && !this.pending) {
        this.lastFailed = cloneDesign(pending.design);
        this.uiStore.getState().setSaveStatus('error');
        this.uiStore.getState().setError(
          result.error instanceof Error ? result.error.message : '카드를 저장하지 못했습니다.',
        );
      }
    } finally {
      if (this.writePromise === writeCompletion) this.writePromise = null;
    }
  }

  private async flushScheduled(): Promise<void> {
    if (this.disposed) return;
    if (this.writePromise) await this.writePromise;
    if (this.disposed || !this.pending) return;
    const pending = this.pending;
    this.pending = null;
    await this.write(pending);
  }
}
