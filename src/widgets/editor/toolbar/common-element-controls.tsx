'use client';

import { useEffect, useRef, useState } from 'react';

import {
  IMAGE_CROP_FOCUS_MAX,
  IMAGE_CROP_FOCUS_MIN,
  IMAGE_CROP_ZOOM_MAX,
  IMAGE_CROP_ZOOM_MIN,
  type DesignElement,
  type ImageElement,
} from '@/entities/design';
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

type CropKey = 'cropZoom' | 'cropFocusX' | 'cropFocusY';

function ImageCropControls({
  selected,
  property,
  run,
}: {
  selected: ImageElement;
  property: boolean;
  run(action: () => Promise<void>, fallback: string): Promise<void>;
}) {
  const editor = useEditor();
  const [draft, setDraft] = useState({
    cropZoom: Math.round((selected.cropZoom ?? 1) * 100),
    cropFocusX: Math.round((selected.cropFocusX ?? 0) * 100),
    cropFocusY: Math.round((selected.cropFocusY ?? 0) * 100),
  });
  const groupsRef = useRef<Partial<Record<CropKey, string>>>({});
  const selectedIdRef = useRef(selected.id);

  useEffect(() => {
    const next = {
      cropZoom: Math.round((selected.cropZoom ?? 1) * 100),
      cropFocusX: Math.round((selected.cropFocusX ?? 0) * 100),
      cropFocusY: Math.round((selected.cropFocusY ?? 0) * 100),
    };
    if (selectedIdRef.current !== selected.id) {
      selectedIdRef.current = selected.id;
      groupsRef.current = {};
      setDraft(next);
      return;
    }
    setDraft((current) => ({
      cropZoom: groupsRef.current.cropZoom ? current.cropZoom : next.cropZoom,
      cropFocusX: groupsRef.current.cropFocusX ? current.cropFocusX : next.cropFocusX,
      cropFocusY: groupsRef.current.cropFocusY ? current.cropFocusY : next.cropFocusY,
    }));
  }, [selected.id, selected.cropZoom, selected.cropFocusX, selected.cropFocusY]);

  const ensureGroup = (key: CropKey) => {
    if (!groupsRef.current[key]) {
      groupsRef.current[key] = createHistoryGroup(`image-${key}`, selected.id);
    }
    return groupsRef.current[key]!;
  };
  const finishGroup = (key: CropKey) => {
    delete groupsRef.current[key];
  };
  const update = (key: CropKey, rawValue: number) => {
    const limits = key === 'cropZoom'
      ? [IMAGE_CROP_ZOOM_MIN * 100, IMAGE_CROP_ZOOM_MAX * 100]
      : [IMAGE_CROP_FOCUS_MIN * 100, IMAGE_CROP_FOCUS_MAX * 100];
    const bounded = Math.min(limits[1], Math.max(limits[0], rawValue));
    setDraft((current) => ({ ...current, [key]: bounded }));
    const historyGroup = ensureGroup(key);
    const value = bounded / 100;
    const changes = key === 'cropZoom'
      ? { cropZoom: value }
      : key === 'cropFocusX'
        ? { cropFocusX: value }
        : { cropFocusY: value };
    void run(
      () => editor.updateSelection(
        { type: 'image', changes },
        { historyGroup },
      ),
      '사진 프레임 위치를 바꾸지 못했습니다.',
    ).catch(() => undefined);
  };
  const rangeClass = `${property ? 'min-h-11' : ''} w-24 accent-[var(--brand)]`;

  const slider = (
    key: CropKey,
    label: string,
    min: number,
    max: number,
    valueLabel: string,
  ) => (
    <label className="flex min-w-44 items-center gap-2 text-xs font-semibold text-[var(--ink-muted)]">
      <span>{label}</span>
      <input
        aria-label={label}
        type="range"
        min={min}
        max={max}
        step="1"
        value={draft[key]}
        onFocus={() => { ensureGroup(key); }}
        onPointerDown={() => { ensureGroup(key); }}
        onChange={(event) => update(key, Number(event.target.value))}
        onBlur={() => { finishGroup(key); }}
        onPointerUp={() => { finishGroup(key); }}
        className={rangeClass}
      />
      <output className="min-w-11 text-right font-mono">{valueLabel}</output>
    </label>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-muted)] px-2 py-1.5" aria-label="사진 프레임 편집">
      {slider(
        'cropZoom',
        '사진 확대',
        IMAGE_CROP_ZOOM_MIN * 100,
        IMAGE_CROP_ZOOM_MAX * 100,
        `${draft.cropZoom}%`,
      )}
      {slider(
        'cropFocusX',
        '사진 가로 위치',
        IMAGE_CROP_FOCUS_MIN * 100,
        IMAGE_CROP_FOCUS_MAX * 100,
        `${draft.cropFocusX}%`,
      )}
      {slider(
        'cropFocusY',
        '사진 세로 위치',
        IMAGE_CROP_FOCUS_MIN * 100,
        IMAGE_CROP_FOCUS_MAX * 100,
        `${draft.cropFocusY}%`,
      )}
      <Button
        variant="ghost"
        className={property ? propertyTouchTargetClass : ''}
        onClick={() => void run(
          () => editor.updateSelection({
            type: 'image',
            changes: { cropZoom: 1, cropFocusX: 0, cropFocusY: 0 },
          }),
          '사진 프레임을 초기화하지 못했습니다.',
        ).catch(() => undefined)}
      >사진 위치 초기화</Button>
    </div>
  );
}

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
      {selected.type === 'image' ? (
        <ImageCropControls selected={selected} property={property} run={run} />
      ) : null}

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
