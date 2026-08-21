'use client';

import { EditorProvider } from '@/features/editor/context/editor-provider';
import { useEditor, useEditorRuntimeStore } from '@/features/editor/hooks/use-editor';
import { useEditorSession } from '@/features/editor/hooks/use-editor-session';
import { IconButton } from '@/shared/ui/icon-button';

import { EditorCanvas } from './canvas/editor-canvas';
import { EditorSidebar } from './sidebar/editor-sidebar';
import { ContextualToolbar } from './toolbar/contextual-toolbar';
import { EditorTopbar } from './toolbar/editor-topbar';

export function EditorScreen({ cardId }: { cardId: string }) {
  return (
    <EditorProvider cardId={cardId}>
      <EditorSessionScreen cardId={cardId} />
    </EditorProvider>
  );
}

function EditorSessionScreen({ cardId }: { cardId: string }) {
  const session = useEditorSession(cardId);

  if (session.status === 'loading') {
    return <main className="grid min-h-dvh place-items-center bg-[var(--workspace)] text-[var(--ink)]">카드를 불러오고 있습니다.</main>;
  }
  if (session.status === 'error') {
    return <main className="grid min-h-dvh place-items-center bg-[var(--workspace)] text-[var(--ink)]">카드를 불러오지 못했습니다.</main>;
  }
  if (session.status === 'recoverable') {
    return (
      <main className="grid min-h-dvh place-items-center gap-4 p-6 text-center">
        <div>
          <h1 className="font-[ui-rounded,Arial_Rounded_MT_Bold,system-ui] text-xl text-[var(--ink)]">저장된 카드를 복구할까요?</h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">복구를 선택하기 전에는 저장 내용을 변경하지 않습니다.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => session.recover('backup')}>백업 복구</button>
          <button type="button" onClick={() => session.recover('sample')}>새 샘플로 시작</button>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh grid-rows-[auto_minmax(0,1fr)] bg-[var(--workspace)]">
      <EditorTopbar />
      <div className="grid min-h-0 grid-cols-[minmax(17.5rem,22rem)_minmax(0,1fr)]">
        <EditorSidebar />
        <EditorWorkspace />
      </div>
    </main>
  );
}

function EditorWorkspace() {
  const editor = useEditor();
  const zoom = useEditorRuntimeStore((state) => state.zoom);
  return (
    <section aria-label="카드 편집 영역" className="min-w-0 overflow-auto p-5 lg:p-8">
      <div className="mx-auto flex min-h-full w-full min-w-[34rem] flex-col items-center gap-4">
        <div className="w-full max-w-[720px]"><ContextualToolbar /></div>
        <div className="relative flex w-full max-w-[720px] justify-center overflow-auto pb-3">
          <div className="absolute top-5 h-[calc(100%-2.5rem)] w-[min(88%,650px)] translate-x-5 -rotate-2 rounded-[1.8rem] bg-[var(--brand-soft)] shadow-[var(--paper-shadow)]" aria-hidden="true" />
          <div data-testid="editor-canvas" className="relative w-full origin-top transition-transform motion-reduce:transition-none" style={{ transform: `scale(${zoom})`, marginBottom: `${(zoom - 1) * 100}%` }}>
            <EditorCanvas />
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-1 shadow-[var(--shadow-soft)]" aria-label="확대 축소">
          <IconButton aria-label="축소" disabled={zoom <= 0.25} onClick={() => editor.setZoom(zoom - 0.25)}>−</IconButton>
          <output className="min-w-12 text-center font-mono text-xs text-[var(--ink-muted)]">{Math.round(zoom * 100)}%</output>
          <IconButton aria-label="확대" disabled={zoom >= 2} onClick={() => editor.setZoom(zoom + 0.25)}>+</IconButton>
        </div>
      </div>
    </section>
  );
}
