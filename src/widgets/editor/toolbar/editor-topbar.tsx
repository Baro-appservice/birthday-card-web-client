'use client';

import { Button } from '@/shared/ui/button';
import { IconButton } from '@/shared/ui/icon-button';
import { useEditor, useEditorSaveCoordinator, useEditorUiStore } from '@/features/editor/hooks/use-editor';

const saveLabels = {
  saving: '저장 중',
  saved: '저장됨',
  error: '저장 실패 · 다시 시도',
} as const;

export function EditorTopbar({ compact = false }: { compact?: boolean }) {
  const editor = useEditor();
  const saveCoordinator = useEditorSaveCoordinator();
  const saveStatus = useEditorUiStore((state) => state.saveStatus);
  const setError = useEditorUiStore((state) => state.setError);
  const run = async (action: () => Promise<void>, fallback: string) => {
    try {
      await action();
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : fallback);
    }
  };
  const download = async () => {
    try {
      const blob = await editor.exportPng();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'my-birthday-card.png';
      link.click();
      URL.revokeObjectURL(url);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'PNG를 저장하지 못했습니다. 다시 시도해 주세요.');
    }
  };

  return (
    <header className="flex h-14 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3 sm:h-16 sm:px-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="grid size-8 place-items-center rounded-lg bg-[var(--brand)] font-[ui-rounded,Arial_Rounded_MT_Bold,system-ui] text-sm text-white">B</span>
        <h1 className={compact ? 'sr-only' : 'font-[ui-rounded,Arial_Rounded_MT_Bold,system-ui] text-base tracking-tight text-[var(--ink)]'}>Birthday canvas</h1>
        <span role="status" aria-live="polite" aria-atomic="true" className={`font-mono text-xs ${compact ? '' : 'border-l border-[var(--border)] pl-3'} ${saveStatus === 'error' ? 'text-[var(--danger)]' : saveStatus === 'saving' ? 'text-[var(--ink-muted)]' : 'text-[var(--success)]'}`}>{saveLabels[saveStatus]}</span>
        {saveStatus === 'error' ? <button type="button" onClick={() => void run(() => saveCoordinator.retry(), '저장을 다시 시도하지 못했습니다.')} className="text-xs font-semibold text-[var(--danger)] underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">다시 시도</button> : null}
      </div>
      <div className="flex items-center gap-1">
        <IconButton aria-label="실행 취소" className={compact ? 'size-11' : ''} onClick={() => void run(() => editor.undo(), '실행을 취소하지 못했습니다.')}>↶</IconButton>
        <IconButton aria-label="다시 실행" className={compact ? 'size-11' : ''} onClick={() => void run(() => editor.redo(), '다시 실행하지 못했습니다.')}>↷</IconButton>
        <Button aria-label="PNG 저장" variant="primary" className={`ml-1 ${compact ? 'min-h-11 px-3' : 'ml-2'}`} onClick={() => void download()}>{compact ? 'PNG' : 'PNG 저장'}</Button>
      </div>
    </header>
  );
}
