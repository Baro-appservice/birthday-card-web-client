'use client';

import { Button } from '@/shared/ui/button';
import { useEditor, useEditorUiStore } from '@/features/editor/hooks/use-editor';

export function ShapePanel() {
  const editor = useEditor();
  const setError = useEditorUiStore((state) => state.setError);
  const addShape = async (shape: 'rectangle' | 'circle' | 'ellipse') => {
    try {
      await editor.addShape(shape);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : '도형을 추가하지 못했습니다. 다시 시도해 주세요.');
    }
  };
  return (
    <section aria-label="도형 도구" className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-[var(--ink)]">도형</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">은은한 색 면으로 카드에 리듬을 더하세요.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => void addShape('rectangle')}>사각형</Button>
        <Button onClick={() => void addShape('circle')}>원</Button>
        <Button onClick={() => void addShape('ellipse')}>타원</Button>
      </div>
    </section>
  );
}
