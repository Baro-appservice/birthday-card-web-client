'use client';

import { useEffect, useRef, useState } from 'react';

import {
  TEXT_FONT_SIZE_MAX,
  TEXT_FONT_SIZE_MIN,
  clampTextFontSize,
  type DesignElement,
  type TextElement,
} from '@/entities/design';
import { Button } from '@/shared/ui/button';
import { ColorInput } from '@/shared/ui/color-input';
import { useDesignStore, useEditor, useEditorRuntimeStore, useEditorUiStore } from '@/features/editor/hooks/use-editor';

const propertyTouchTargetClass = 'property-touch-target min-h-11 min-w-11';
const approvedFontFamilies = ['system-ui', 'Arial', 'Georgia'] as const;
const textCommitDelayMs = 160;
let nextTextEditSessionId = 1;

function createTextHistoryGroup(elementId: string): string {
  const sessionId = nextTextEditSessionId;
  nextTextEditSessionId += 1;
  return `text:${elementId}:${sessionId}`;
}

function TextContentInput({
  selected,
  property,
  onCommit,
}: {
  selected: Extract<DesignElement, { type: 'text' }>;
  property: boolean;
  onCommit(text: string, historyGroup: string): Promise<void>;
}) {
  const [draft, setDraft] = useState(selected.text);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submittedRef = useRef(selected.text);
  const historyGroupRef = useRef<string | null>(null);
  const focusedRef = useRef(false);
  const composingRef = useRef(false);

  const ensureHistoryGroup = () => {
    if (!historyGroupRef.current) {
      historyGroupRef.current = createTextHistoryGroup(selected.id);
    }
    return historyGroupRef.current;
  };

  const cancelScheduledCommit = () => {
    if (timerRef.current === null) return;
    clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const commit = async (value: string, historyGroup: string) => {
    cancelScheduledCommit();
    if (value === submittedRef.current) return;
    const previousSubmitted = submittedRef.current;
    submittedRef.current = value;
    try {
      await onCommit(value, historyGroup);
    } catch (error) {
      if (submittedRef.current === value) submittedRef.current = previousSubmitted;
      throw error;
    }
  };

  const scheduleCommit = (value: string) => {
    if (composingRef.current) return;
    cancelScheduledCommit();
    const historyGroup = ensureHistoryGroup();
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void commit(value, historyGroup).catch(() => undefined);
    }, textCommitDelayMs);
  };

  useEffect(() => {
    if (focusedRef.current) return;
    setDraft(selected.text);
    submittedRef.current = selected.text;
  }, [selected.id, selected.text]);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
  }, []);

  return (
    <textarea
      id="selected-text-content"
      aria-label="선택한 텍스트 내용"
      rows={property ? 3 : 2}
      value={draft}
      onFocus={() => {
        focusedRef.current = true;
        historyGroupRef.current = createTextHistoryGroup(selected.id);
      }}
      onCompositionStart={() => {
        composingRef.current = true;
        cancelScheduledCommit();
      }}
      onCompositionEnd={(event) => {
        composingRef.current = false;
        const value = event.currentTarget.value;
        setDraft(value);
        scheduleCommit(value);
      }}
      onChange={(event) => {
        const value = event.target.value;
        setDraft(value);
        scheduleCommit(value);
      }}
      onBlur={() => {
        focusedRef.current = false;
        composingRef.current = false;
        const historyGroup = ensureHistoryGroup();
        void commit(draft, historyGroup)
          .catch(() => undefined)
          .finally(() => {
            if (historyGroupRef.current === historyGroup) historyGroupRef.current = null;
          });
      }}
      className={`${property ? 'min-h-20' : 'min-h-14'} min-w-48 flex-1 resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]`}
    />
  );
}

function FontSizeInput({
  fontSize,
  property,
  onCommit,
}: {
  fontSize: number;
  property: boolean;
  onCommit(fontSize: number): Promise<void>;
}) {
  const [draft, setDraft] = useState(String(fontSize));

  const commit = async () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(fontSize));
      return;
    }
    const clamped = clampTextFontSize(parsed);
    setDraft(String(clamped));
    if (clamped === fontSize) return;
    try {
      await onCommit(clamped);
    } catch {
      setDraft(String(fontSize));
    }
  };

  return (
    <input
      id="font-size"
      aria-label="글자 크기"
      type="number"
      min={TEXT_FONT_SIZE_MIN}
      max={TEXT_FONT_SIZE_MAX}
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className={`${property ? propertyTouchTargetClass : 'h-9'} w-16 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]`}
    />
  );
}

function SelectionControls({ property }: { property: boolean }) {
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
      {!property ? <><div className="h-6 border-l border-[var(--border)]" aria-hidden="true" />
        <Button variant="ghost" onClick={() => void run(() => editor.bringForward(), '레이어를 앞으로 옮기지 못했습니다.')}>앞으로</Button>
        <Button variant="ghost" onClick={() => void run(() => editor.sendBackward(), '레이어를 뒤로 옮기지 못했습니다.')}>뒤로</Button></> : null}
      <Button variant="danger" className={property ? propertyTouchTargetClass : ''} onClick={() => void run(() => editor.deleteSelection(), '선택한 요소를 삭제하지 못했습니다.')}>삭제</Button>
    </>
  );
}

function TextControls({ selected, property }: { selected: Extract<DesignElement, { type: 'text' }>; property: boolean }) {
  const editor = useEditor();
  const setError = useEditorUiStore((state) => state.setError);
  const update = async (
    changes: Partial<Pick<TextElement,
      'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'color' | 'textAlign'>>,
    historyGroup?: string,
    propagateError = false,
  ) => {
    try {
      const patch = { type: 'text' as const, changes };
      if (historyGroup) {
        await editor.updateSelection(patch, { historyGroup });
      } else {
        await editor.updateSelection(patch);
      }
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : '텍스트 서식을 바꾸지 못했습니다. 다시 시도해 주세요.');
      if (propagateError) throw error;
    }
  };
  const displayedFontFamily = approvedFontFamilies.includes(
    selected.fontFamily as (typeof approvedFontFamilies)[number],
  ) ? selected.fontFamily : 'system-ui';
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor="selected-text-content">선택한 텍스트 내용</label>
      <TextContentInput
        key={selected.id}
        selected={selected}
        property={property}
        onCommit={(text, historyGroup) => update({ text }, historyGroup, true)}
      />
      <label className="sr-only" htmlFor="font-family">글꼴</label>
      <select id="font-family" value={displayedFontFamily} onChange={(event) => void update({ fontFamily: event.target.value })} className={`${property ? propertyTouchTargetClass : 'h-9'} rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]`}>
        <option value="system-ui">system-ui</option><option value="Arial">Arial</option><option value="Georgia">Georgia</option>
      </select>
      <label className="sr-only" htmlFor="font-size">글자 크기</label>
      <FontSizeInput
        key={`${selected.id}:${selected.fontSize}`}
        fontSize={selected.fontSize}
        property={property}
        onCommit={(fontSize) => update({ fontSize }, undefined, true)}
      />
      <Button variant={selected.fontWeight >= 600 ? 'primary' : 'secondary'} className={property ? propertyTouchTargetClass : ''} aria-label="굵게" onClick={() => void update({ fontWeight: selected.fontWeight >= 600 ? 400 : 700 })}>B</Button>
      <ColorInput label="글자색" value={selected.color} inputClassName={property ? propertyTouchTargetClass : ''} onChange={(color, historyGroup) => void update({ color }, historyGroup)} />
      <div className="flex rounded-lg border border-[var(--border)] p-0.5" aria-label="텍스트 정렬">
        {(['left', 'center', 'right'] as const).map((alignment) => <button key={alignment} type="button" aria-label={`${alignment === 'left' ? '왼쪽' : alignment === 'center' ? '가운데' : '오른쪽'} 정렬`} aria-pressed={selected.textAlign === alignment} onClick={() => void update({ textAlign: alignment })} className={`${property ? propertyTouchTargetClass : 'size-8'} rounded-md text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${selected.textAlign === alignment ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'text-[var(--ink-muted)]'}`}>{alignment === 'left' ? '≡' : alignment === 'center' ? '≣' : '☰'}</button>)}
      </div>
    </div>
  );
}

function ImageControls({ property }: { property: boolean }) {
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
  return <label className={`inline-flex ${property ? propertyTouchTargetClass : 'min-h-9'} cursor-pointer items-center rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-semibold text-[var(--ink)] hover:bg-[var(--surface-muted)] focus-within:ring-2 focus-within:ring-[var(--brand)]`}><span>사진 교체</span><input aria-label="교체할 사진 파일 선택" type="file" accept="image/png,image/jpeg,image/webp" className={`sr-only ${property ? propertyTouchTargetClass : ''}`} onChange={(event) => void replace(event.target.files?.[0])} /></label>;
}

function ShapeControls({ selected, property }: { selected: Extract<DesignElement, { type: 'shape' }>; property: boolean }) {
  const editor = useEditor();
  const setError = useEditorUiStore((state) => state.setError);
  const update = async (fill: string, historyGroup?: string) => {
    try {
      const patch = { type: 'shape' as const, changes: { fill } };
      if (historyGroup) await editor.updateSelection(patch, { historyGroup });
      else await editor.updateSelection(patch);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : '도형 색을 바꾸지 못했습니다. 다시 시도해 주세요.');
    }
  };
  return <ColorInput label="채우기" value={selected.fill} inputClassName={property ? propertyTouchTargetClass : ''} onChange={(color, historyGroup) => void update(color, historyGroup)} />;
}

export function ContextualToolbar({ variant = 'desktop' }: { variant?: 'desktop' | 'property' }) {
  const selectedElementIds = useEditorRuntimeStore((state) => state.selectedElementIds);
  const page = useDesignStore((state) => state.design.pages[0]);
  const selected = selectedElementIds.length === 1 ? page?.elements.find((element) => element.id === selectedElementIds[0]) : undefined;
  if (!selected) return <div className="min-h-12" aria-label="선택 도구" />;
  return (
    <section aria-label="선택 도구" className="flex min-h-12 flex-wrap items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 shadow-[var(--shadow-soft)]">
      {selected.type === 'text' && <TextControls selected={selected} property={variant === 'property'} />}
      {selected.type === 'image' && <ImageControls property={variant === 'property'} />}
      {selected.type === 'shape' && <ShapeControls selected={selected} property={variant === 'property'} />}
      <SelectionControls property={variant === 'property'} />
    </section>
  );
}
