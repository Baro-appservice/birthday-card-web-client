'use client';

import { useEditorUiStore } from '@/features/editor/hooks/use-editor';

export function Toast() {
  const operationError = useEditorUiStore((state) => state.error);
  const saveError = useEditorUiStore((state) => state.saveError);
  const setError = useEditorUiStore((state) => state.setError);
  const setSaveError = useEditorUiStore((state) => state.setSaveError);
  const error = operationError ?? saveError;
  if (!error) return null;
  return (
    <div role="alert" className="fixed bottom-5 right-5 z-50 flex max-w-sm items-start gap-3 rounded-xl border border-[var(--danger-border)] bg-[var(--surface)] p-4 text-sm text-[var(--ink)] shadow-[var(--shadow-float)]">
      <span className="mt-0.5 text-[var(--danger)]" aria-hidden="true">!</span>
      <p className="flex-1">{error}</p>
      <button
        type="button"
        aria-label="오류 닫기"
        onClick={() => operationError !== null ? setError(null) : setSaveError(null)}
        className="text-[var(--ink-muted)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
      >×</button>
    </div>
  );
}
