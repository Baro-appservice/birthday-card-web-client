import { useEffect } from 'react';

import type { EditorApi } from '@/features/editor/core/editor';

type ShortcutEditor = Pick<
  EditorApi,
  | 'deleteSelection'
  | 'duplicateSelection'
  | 'undo'
  | 'redo'
  | 'bringForward'
  | 'sendBackward'
>;

interface KeyboardShortcutOptions {
  enabled?: boolean;
  onError?(message: string): void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return target.matches('input, textarea, select, [contenteditable="true"]');
}

function isTypingIntoEditor(event: KeyboardEvent): boolean {
  return event.isComposing || isEditableTarget(event.target) || isEditableTarget(document.activeElement);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : '단축키 작업을 완료하지 못했습니다. 다시 시도해 주세요.';
}

export function useKeyboardShortcuts(
  editor: ShortcutEditor,
  { enabled = true, onError }: KeyboardShortcutOptions = {},
): void {
  useEffect(() => {
    if (!enabled) return undefined;

    const dispatch = (event: KeyboardEvent, action: () => Promise<void>) => {
      event.preventDefault();
      void action().catch((error: unknown) => onError?.(errorMessage(error)));
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingIntoEditor(event)) return;

      const key = event.key.toLowerCase();
      const hasPrimaryModifier = event.ctrlKey !== event.metaKey && (event.ctrlKey || event.metaKey);
      const onlyPrimaryModifier = hasPrimaryModifier && !event.altKey;

      if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        if (event.key === 'Delete' || event.key === 'Backspace') dispatch(event, () => editor.deleteSelection());
        return;
      }
      if (!onlyPrimaryModifier) return;

      if (key === 'z' && !event.shiftKey) {
        dispatch(event, () => editor.undo());
      } else if ((key === 'z' && event.shiftKey) || (key === 'y' && !event.shiftKey)) {
        dispatch(event, () => editor.redo());
      } else if (key === 'd' && !event.shiftKey) {
        dispatch(event, () => editor.duplicateSelection());
      } else if (key === ']' && !event.shiftKey) {
        dispatch(event, () => editor.bringForward());
      } else if (key === '[' && !event.shiftKey) {
        dispatch(event, () => editor.sendBackward());
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editor, enabled, onError]);
}
