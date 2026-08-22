'use client';

import { useEffect, useRef, useState } from 'react';

import type { DesignElement } from '@/entities/design';
import type { CanvasAlignment } from '@/features/editor/core/editor';
import { useEditor, useEditorUiStore } from '@/features/editor/hooks/use-editor';
import { Button } from '@/shared/ui/button';

const propertyTouchTargetClass = 'property-touch-target min-h-11 min-w-11';
let nextPropertySessionId = 1;

function createHistoryGroup(kind: string, elementId: string): string {
  const sessionId = nextPropertySessionId;
  nextPropertySessionId += 1;
  return `${kind}:${elementId}:${sessionId}`;
}

function RotationInput({
  elementId,
  rotation,
  property,
  onCommit,
}: {
  elementId: string;
  rotation: number;
  property: boolean;
  onCommit(rotation: number): Promise<void>;
}) {
  const [draft, setDraft] = useState(String(Math.round(rotation * 100) / 100));

  useEffect(() => {
    setDraft(String(Math.round(rotation * 100) / 100));
  }, [elementId, rotation]);

  const commit = async () => {
    const parsed = Number(draft);
    if (draft.trim() === '' || !Number.isFinite(parsed)) {
      setDraft(String(Math.round(rotation * 100) / 100));
      return;
    }
    if (parsed === rotation) return;
    try {
      await onCommit(parsed);
    } catch {
      setDraft(String(Math.round(rotation * 100) / 100));
    }
  };

  return (
    <input
      aria-label="회전 각도"
      type="number"
      step="1"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(event) => {
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
          event.preventDefault();
          event.currentTarget.blur();
        }
      }}
      className={`${property ? propertyTouchTargetClass : 'h-9'} w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 text-sm text-[var(--ink)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]`}
    />
  );
}

const alignments: ReadonlyArray<{
  value: CanvasAlignment;
  label: string;
  shortLabel: string;
}> = [
  { value: 'left', label: '캔버스 왼쪽에 맞춤', shortLabel: '좌' },
  { value: 'horizontal-center', label: '캔버스 가로 중앙에 맞춤', shortLabel: '가운데' },
  { value: 'right', label: '캔버스 오른쪽에 맞춤', shortLabel: '우' },
  { value: 'top', label: '캔버스 위쪽에 맞춤', shortLabel: '상' },
  { value: 'vertical-center', label: '캔버스 세로 중앙에 맞춤', shortLabel: '중앙' },
  { value: 'bottom', label: '캔버스 아래쪽에 맞춤', shortLabel: '하' },
];

export function CommonElementControls({
  selected,
  property,
}: {
  selected: DesignElement;
  property: boolean;
}) {
  const editor = useEditor();
  const setError = useEditorUiStore((state) => state.setError);
  const [opacityDraft, setOpacityDraft] = useState(Math.round(selected.opacity * 100));
  const opacityHistoryGroupRef = useRef<string | null>(null);
  const selectedIdRef = useRef(selected.id);

  useEffect(() => {
    if (selectedIdRef.current !== selected.id) {
      selectedIdRef.current = selected.id;
      opacityHistoryGroupRef.current = null;
      setOpacityDraft(Math.round(selected.opacity * 100));
      return;
    }
    if (!opacityHistoryGroupRef.current) {
      setOpacityDraft(Math.round(selected.opacity * 100));
    }
  }, [selected.id, selected.opacity]);

  const report = (error: unknown, fallback: string) => {
    setError(error instanceof Error ? error.message : fallback);
  };
  const run = async (action: () => Promise<void>, fallback: string) => {
    try {
      await action();
      setError(null);
    } catch (error) {
      report(error, fallback);
      throw error;
    }
  };
  const updateCommon = async (
    changes: { opacity?: number; rotation?: number },
    historyGroup?: string,
  ) => run(
    () => editor.updateSelection(
      { type: 'common', changes },
      historyGroup ? { historyGroup } : undefined,
    ),
    '요소 속성을 바꾸지 못했습니다. 다시 시도해 주세요.',
  );
  const ensureOpacityHistoryGroup = () => {
    if (!opacityHistoryGroupRef.current) {
      opacityHistoryGroupRef.current = createHistoryGroup('opacity', selected.id);
    }
    return opacityHistoryGroupRef.current;
  };
  const changeOpacity = (percentage: number) => {
    const bounded = Math.min(100, Math.max(0, percentage));
    setOpacityDraft(bounded);
    const historyGroup = ensureOpacityHistoryGroup();
    void updateCommon({ opacity: bounded / 100 }, historyGroup).catch(() => {
      setOpacityDraft(Math.round(selected.opacity * 100));
    });
  };
  const touchClass = property ? propertyTouchTargetClass : '';

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="공통 요소 편집">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-[var(--ink-muted)]">
        <span>회전°</span>
        <RotationInput
          elementId={selected.id}
          rotation={selected.rotation}
          property={property}
          onCommit={(rotation) => updateCommon({ rotation })}
        />
      </label>

      <label className="flex min-w-40 items-center gap-2 text-xs font-semibold text-[var(--ink-muted)]">
        <span>투명도</span>
        <input
          aria-label="투명도"
          type="range"
          min="0"
          max="100"
          step="1"
          value={opacityDraft}
          onFocus={() => { ensureOpacityHistoryGroup(); }}
          onPointerDown={() => { ensureOpacityHistoryGroup(); }}
          onChange={(event) => changeOpacity(Number(event.target.value))}
          onBlur={() => { opacityHistoryGroupRef.current = null; }}
          onPointerUp={() => { opacityHistoryGroupRef.current = null; }}
          className={`${property ? 'min-h-11' : ''} w-24 accent-[var(--brand)]`}
        />
        <output className="min-w-9 text-right font-mono">{opacityDraft}%</output>
      </label>

      <div className="flex flex-wrap items-center gap-1" aria-label="캔버스 기준 정렬">
        {alignments.map((alignment) => (
          <Button
            key={alignment.value}
            variant="ghost"
            className={touchClass}
            aria-label={alignment.label}
            title={alignment.label}
            onClick={() => void run(
              () => editor.alignSelection(alignment.value),
              '요소를 캔버스에 정렬하지 못했습니다.',
            ).catch(() => undefined)}
          >
            {alignment.shortLabel}
          </Button>
        ))}
      </div>

      <Button
        variant="ghost"
        className={touchClass}
        onClick={() => void run(
          () => editor.duplicateSelection(),
          '선택한 요소를 복제하지 못했습니다.',
        ).catch(() => undefined)}
      >복제</Button>
      <Button
        variant="ghost"
        className={touchClass}
        onClick={() => void run(
          () => editor.bringToFront(),
          '요소를 맨 앞으로 옮기지 못했습니다.',
        ).catch(() => undefined)}
      >맨앞</Button>
      <Button
        variant="ghost"
        className={touchClass}
        onClick={() => void run(
          () => editor.sendToBack(),
          '요소를 맨 뒤로 옮기지 못했습니다.',
        ).catch(() => undefined)}
      >맨뒤</Button>
    </div>
  );
}
