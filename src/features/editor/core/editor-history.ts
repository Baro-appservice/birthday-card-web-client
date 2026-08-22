import type { EditorCommand } from './editor-command';

export const EDITOR_HISTORY_LIMIT = 150;

export interface EditorHistorySnapshot {
  undoStack: EditorCommand[];
  redoStack: EditorCommand[];
}

function trimToLimit(commands: EditorCommand[], limit: number): EditorCommand[] {
  return commands.length <= limit ? commands : commands.slice(commands.length - limit);
}

export class EditorHistory {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];

  constructor(private readonly limit = EDITOR_HISTORY_LIMIT) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new Error('History limit은 1 이상의 정수여야 합니다.');
    }
  }

  execute(command: EditorCommand): void {
    const previous = this.undoStack.at(-1);
    const merged = previous?.mergeWith?.(command) ?? null;

    command.execute();
    if (merged && this.undoStack.length > 0) {
      this.undoStack[this.undoStack.length - 1] = merged;
    } else {
      this.undoStack.push(command);
      this.undoStack = trimToLimit(this.undoStack, this.limit);
    }
    this.redoStack = [];
  }

  undo(): boolean {
    const command = this.undoStack.at(-1);
    if (!command) return false;
    command.undo();
    this.undoStack.pop();
    this.redoStack.push(command);
    return true;
  }

  redo(): boolean {
    const command = this.redoStack.at(-1);
    if (!command) return false;
    command.execute();
    this.redoStack.pop();
    this.undoStack.push(command);
    this.undoStack = trimToLimit(this.undoStack, this.limit);
    return true;
  }

  snapshot(): EditorHistorySnapshot {
    return {
      undoStack: [...this.undoStack],
      redoStack: [...this.redoStack],
    };
  }

  restore(snapshot: EditorHistorySnapshot): void {
    this.undoStack = trimToLimit([...snapshot.undoStack], this.limit);
    this.redoStack = trimToLimit([...snapshot.redoStack], this.limit);
  }

  referencedAssetIds(): ReadonlySet<string> {
    const ids = new Set<string>();
    for (const command of [...this.undoStack, ...this.redoStack]) {
      for (const assetId of command.referencedAssetIds?.() ?? []) ids.add(assetId);
    }
    return ids;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
