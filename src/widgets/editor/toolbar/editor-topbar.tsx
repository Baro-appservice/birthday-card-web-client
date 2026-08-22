'use client';

import { Button } from '@/shared/ui/button';
import { IconButton } from '@/shared/ui/icon-button';
import { useEditor, useEditorSaveCoordinator, useEditorUiStore } from '@/features/editor/hooks/use-editor';
import { birthdayCardFilename, downloadBlob } from '@/features/editor/lib/download-blob';

const saveLabels = {
  saving: '저장 중',
  saved: '저장됨',
  error: '저장 실패 · 다시 시도',
} as const;

export function EditorTopbar({ cardId, compact = false }: { cardId: string; compact?: boolean }) {
  const editor = useEditor();
  const saveCoordinator = useEditorSaveCoordinator();
  const saveStatus = useEditorUiStore((state) => state.saveStatus);
  const setError = useEditorUiStore((state) => state.setError);
  const setSaveError = useEditorUiStore((state) => state.setSaveError);
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
      downloadBlob(blob, birthdayCardFilename(cardId));
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'PNG를 저장하지 못했습니다. 다시 시도해 주세요.');
    }
  };
  const retrySave = async () => {
    try {
      await saveCoordinator.retry();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '저장을 다시 시도하지 못했습니다.');
    }
  };

  return (
    <header className="party-topbar flex h-14 items-center justify-between px-3 sm:h-16 sm:px-5">
      <div className="flex items-center gap-3">
        <span aria-hidden="true" className="party-brand-mark grid size-8 place-items-center rounded-lg font-[ui-rounded,Arial_Rounded_MT_Bold,system-ui] text-sm font-black">B</span>
        <div className={compact ? 'sr-only' : 'leading-none'}>
          <h1 className="font-[ui-rounded,Arial_Rounded_MT_Bold,system-ui] text-base font-black tracking-[-0.03em] text-[var(--ink)]">Birthday canvas</h1>
          <p className="mt-1 text-[9px] font-bold tracking-[0.14em] text-[var(--brand)]">TODAY&apos;S PARTY STUDIO</p>
        </div>
        <span role="status" aria-live="polite" aria-atomic="true" className={`font-mono text-xs ${compact ? '' : 'border-l border-[var(--border)] pl-3'} ${saveStatus === 'error' ? 'text-[var(--danger)]' : saveStatus === 'saving' ? 'text-[var(--ink-muted)]' : 'text-[var(--success)]'}`}>{saveLabels[saveStatus]}</span>
        {saveStatus === 'error' ? <button type="button" onClick={() => void retrySave()} className="text-xs font-semibold text-[var(--danger)] underline decoration-dotted underline-offset-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">다시 시도</button> : null}
      </div>
      <div className="flex items-center gap-1">
        <IconButton aria-label="실행 취소" className={compact ? 'size-11' : ''} onClick={() => void run(() => editor.undo(), '실행을 취소하지 못했습니다.')}>↶</IconButton>
        <IconButton aria-label="다시 실행" className={compact ? 'size-11' : ''} onClick={() => void run(() => editor.redo(), '다시 실행하지 못했습니다.')}>↷</IconButton>
        <Button aria-label="PNG 저장" variant="primary" className={`party-cta ml-1 ${compact ? 'min-h-11 px-3' : 'ml-2'}`} onClick={() => void download()}>{compact ? 'PNG' : <><span aria-hidden="true">✦</span> PNG 저장</>}</Button>
      </div>
    </header>
  );
}
