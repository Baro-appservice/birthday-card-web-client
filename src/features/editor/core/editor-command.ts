export interface EditorCommand {
  execute(): void;
  undo(): void;
  mergeWith?(next: EditorCommand): EditorCommand | null;
}

function rethrowWithCompensationErrors(
  originalError: unknown,
  compensationErrors: unknown[],
  operation: 'execute' | 'undo',
): never {
  if (compensationErrors.length === 0) throw originalError;
  throw new AggregateError(
    [originalError, ...compensationErrors],
    `복합 명령 ${operation} 보상 중 오류가 발생했습니다.`,
  );
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
      const compensationErrors: unknown[] = [];
      for (const command of executed.reverse()) {
        try {
          command.undo();
        } catch (compensationError) {
          compensationErrors.push(compensationError);
        }
      }
      rethrowWithCompensationErrors(error, compensationErrors, 'execute');
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
      const compensationErrors: unknown[] = [];
      for (const command of undone.reverse()) {
        try {
          command.execute();
        } catch (compensationError) {
          compensationErrors.push(compensationError);
        }
      }
      rethrowWithCompensationErrors(error, compensationErrors, 'undo');
    }
  }
}
