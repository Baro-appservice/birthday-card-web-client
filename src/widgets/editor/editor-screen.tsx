'use client';

import { EditorProvider } from '@/features/editor/context/editor-provider';
import { useEditorSession } from '@/features/editor/hooks/use-editor-session';

import { EditorCanvas } from './canvas/editor-canvas';

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
    return <main className="grid min-h-dvh place-items-center">카드를 불러오고 있습니다.</main>;
  }
  if (session.status === 'error') {
    return <main className="grid min-h-dvh place-items-center">카드를 불러오지 못했습니다.</main>;
  }
  if (session.status === 'recoverable') {
    return (
      <main className="grid min-h-dvh place-items-center gap-4 p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold text-[#5a2740]">저장된 카드를 복구할까요?</h1>
          <p className="mt-2 text-sm text-[#7b3d58]">복구를 선택하기 전에는 저장 내용을 변경하지 않습니다.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => session.recover('backup')}>백업 복구</button>
          <button type="button" onClick={() => session.recover('sample')}>새 샘플로 시작</button>
        </div>
      </main>
    );
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-[#fff8fb] p-4">
      <EditorCanvas />
    </main>
  );
}
