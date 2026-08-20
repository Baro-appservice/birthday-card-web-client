export interface EditorCommand {
  execute(): void;
  undo(): void;
}

export class CompositeEditorCommand implements EditorCommand {
  constructor(private readonly commands: readonly EditorCommand[]) {}

  execute(): void {
    const executed: EditorCommand[] = [];
    try {
      for (const command of this.commands) {
        command.execute();
        executed.push(command);
      }
    } catch (error) {
      for (const command of executed.reverse()) {
        try {
          command.undo();
        } catch {
          // 가능한 명령을 모두 보상한 뒤 원래 오류를 유지한다.
        }
      }
      throw error;
    }
  }

  undo(): void {
    const undone: EditorCommand[] = [];
    try {
      for (const command of [...this.commands].reverse()) {
        command.undo();
        undone.push(command);
      }
    } catch (error) {
      for (const command of undone.reverse()) {
        try {
          command.execute();
        } catch {
          // 가능한 명령을 모두 복원한 뒤 원래 오류를 유지한다.
        }
      }
      throw error;
    }
  }
}
