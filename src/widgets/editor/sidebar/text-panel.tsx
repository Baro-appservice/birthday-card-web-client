'use client';

import { Button } from '@/shared/ui/button';
import { useEditor, useEditorUiStore } from '@/features/editor/hooks/use-editor';

export function TextPanel() {
  const editor = useEditor();
  const setError = useEditorUiStore((state) => state.setError);
  const addText = async () => {
    try {
      await editor.addText();
    } catch (error) {
      setError(error instanceof Error ? error.message : '텍스트를 추가하지 못했습니다. 다시 시도해 주세요.');
    }
  };
  return (
    <section aria-label="텍스트 도구" className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-[var(--ink)]">텍스트</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">카드 위에 새 메시지를 놓고 바로 편집하세요.</p>
      </div>
      <Button variant="primary" className="w-full" onClick={() => void addText()}>텍스트 추가</Button>
    </section>
  );
}
