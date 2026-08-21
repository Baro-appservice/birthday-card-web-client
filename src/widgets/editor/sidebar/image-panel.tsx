'use client';

import { useEditor, useEditorUiStore } from '@/features/editor/hooks/use-editor';
import { Toast } from '@/shared/ui/toast';

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp';

export function ImagePanel() {
  const editor = useEditor();
  const error = useEditorUiStore((state) => state.error);
  const setError = useEditorUiStore((state) => state.setError);
  const upload = async (file: File | undefined) => {
    if (!file) return;
    try {
      await editor.addImage(file);
    } catch (error) {
      setError(error instanceof Error ? error.message : '사진을 추가하지 못했습니다. PNG, JPEG, WebP 파일인지 확인해 주세요.');
    }
  };
  return (
    <section aria-label="사진 도구" className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-[var(--ink)]">사진</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">PNG, JPEG, WebP 사진을 카드에 추가합니다.</p>
      </div>
      <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-strong)] bg-[var(--surface-muted)] px-3 text-center text-sm font-semibold text-[var(--brand)] focus-within:ring-2 focus-within:ring-[var(--brand)] focus-within:ring-offset-2">
        <span>사진 추가</span>
        <span className="mt-1 text-xs font-normal text-[var(--ink-muted)]">PNG · JPEG · WebP</span>
        <input aria-label="사진 파일 선택" type="file" accept={IMAGE_ACCEPT} className="sr-only" onChange={(event) => void upload(event.target.files?.[0])} />
      </label>
      {error ? <Toast /> : null}
    </section>
  );
}
