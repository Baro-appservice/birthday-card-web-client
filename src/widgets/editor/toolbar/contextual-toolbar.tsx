'use client';

import type { DesignElement, TextElement } from '@/entities/design';
import { Button } from '@/shared/ui/button';
import { ColorInput } from '@/shared/ui/color-input';
import { useDesignStore, useEditor, useEditorRuntimeStore, useEditorUiStore } from '@/features/editor/hooks/use-editor';

function SelectionControls() {
  const editor = useEditor();
  const setError = useEditorUiStore((state) => state.setError);
  const run = async (action: () => Promise<void>, fallback: string) => {
    try {
      await action();
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : fallback);
    }
  };
  return (
    <>
      <div className="h-6 border-l border-[var(--border)]" aria-hidden="true" />
      <Button variant="ghost" onClick={() => void run(() => editor.bringForward(), '레이어를 앞으로 옮기지 못했습니다.')}>앞으로</Button>
      <Button variant="ghost" onClick={() => void run(() => editor.sendBackward(), '레이어를 뒤로 옮기지 못했습니다.')}>뒤로</Button>
      <Button variant="danger" onClick={() => void run(() => editor.deleteSelection(), '선택한 요소를 삭제하지 못했습니다.')}>삭제</Button>
    </>
  );
}

function TextControls({ selected }: { selected: Extract<DesignElement, { type: 'text' }> }) {
  const editor = useEditor();
  const setError = useEditorUiStore((state) => state.setError);
  const update = async (changes: Partial<Pick<TextElement,
    'fontFamily' | 'fontSize' | 'fontWeight' | 'color' | 'textAlign'>>) => {
    try {
      await editor.updateSelection({ type: 'text', changes });
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : '텍스트 서식을 바꾸지 못했습니다. 다시 시도해 주세요.');
    }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="font-family">글꼴</label>
      <select id="font-family" value={selected.fontFamily} onChange={(event) => void update({ fontFamily: event.target.value })} className="h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]">
        <option value="system-ui">system-ui</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option>
      </select>
      <label className="sr-only" htmlFor="font-size">글자 크기</label>
      <input id="font-size" aria-label="글자 크기" type="number" min="12" max="160" value={selected.fontSize} onChange={(event) => void update({ fontSize: Number(event.target.value) })} className="h-9 w-16 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]" />
      <Button variant={selected.fontWeight >= 600 ? 'primary' : 'secondary'} aria-label="굵게" onClick={() => void update({ fontWeight: selected.fontWeight >= 600 ? 400 : 700 })}>B</Button>
      <ColorInput label="글자색" value={selected.color} onChange={(color) => void update({ color })} />
      <div className="flex rounded-lg border border-[var(--border)] p-0.5" aria-label="텍스트 정렬">
        {(['left', 'center', 'right'] as const).map((alignment) => <button key={alignment} type="button" aria-label={`${alignment === 'left' ? '왼쪽' : alignment === 'center' ? '가운데' : '오른쪽'} 정렬`} aria-pressed={selected.textAlign === alignment} onClick={() => void update({ textAlign: alignment })} className={`size-8 rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${selected.textAlign === alignment ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'text-[var(--ink-muted)]'}`}>{alignment === 'left' ? '≡' : alignment === 'center' ? '≣' : '☰'}</button>)}
      </div>
    </div>
  );
}

function ImageControls() {
  const editor = useEditor();
  const setError = useEditorUiStore((state) => state.setError);
  const replace = async (file: File | undefined) => {
    if (!file) return;
    try {
      await editor.replaceSelectedImage(file);
      setError(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '사진을 교체하지 못했습니다. PNG, JPEG, WebP 파일인지 확인해 주세요.';
      setError(message);
    }
  };
  return <label className="inline-flex min-h-9 cursor-pointer items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] focus-within:ring-2 focus-within:ring-[var(--brand)]"><span>사진 교체</span><input aria-label="교체할 사진 파일 선택" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(event) => void replace(event.target.files?.[0])} /></label>;
}

function ShapeControls({ selected }: { selected: Extract<DesignElement, { type: 'shape' }> }) {
  const editor = useEditor();
  const setError = useEditorUiStore((state) => state.setError);
  const update = async (fill: string) => {
    try { await editor.updateSelection({ type: 'shape', changes: { fill } }); setError(null); } catch (error) { setError(error instanceof Error ? error.message : '도형 색을 바꾸지 못했습니다. 다시 시도해 주세요.'); }
  };
  return <ColorInput label="채우기" value={selected.fill} onChange={(color) => void update(color)} />;
}

export function ContextualToolbar() {
  const selectedElementIds = useEditorRuntimeStore((state) => state.selectedElementIds);
  const page = useDesignStore((state) => state.design.pages[0]);
  const selected = selectedElementIds.length === 1 ? page?.elements.find((element) => element.id === selectedElementIds[0]) : undefined;
  if (!selected) return <div className="min-h-12" aria-label="선택 도구" />;
  return (
    <section aria-label="선택 도구" className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-soft)]">
      {selected.type === 'text' && <TextControls selected={selected} />}
      {selected.type === 'image' && <ImageControls />}
      {selected.type === 'shape' && <ShapeControls selected={selected} />}
      <SelectionControls />
    </section>
  );
}
