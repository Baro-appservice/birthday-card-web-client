export interface EditorCommand {
  execute(): void;
  undo(): void;
}

export class CompositeEditorCommand implements EditorCommand {
  constructor(private readonly commands: readonly EditorCommand[]) {}

  execute(): void {
    for (const command of this.commands) command.execute();
  }

  undo(): void {
    for (const command of [...this.commands].reverse()) command.undo();
  }
}
