import type { EditorCommand } from './editor-command';

export interface EditorHistorySnapshot {
  undoStack: EditorCommand[];
  redoStack: EditorCommand[];
}

export class EditorHistory {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];

  execute(command: EditorCommand): void {
    command.execute();
    this.undoStack.push(command);
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
    return true;
  }

  snapshot(): EditorHistorySnapshot {
    return {
      undoStack: [...this.undoStack],
      redoStack: [...this.redoStack],
    };
  }

  restore(snapshot: EditorHistorySnapshot): void {
    this.undoStack = [...snapshot.undoStack];
    this.redoStack = [...snapshot.redoStack];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }
}
