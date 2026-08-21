'use client';

import type { DesignElement } from '@/entities/design';
import { useDesignStore, useEditorRuntimeStore } from '@/features/editor/hooks/use-editor';

function layerName(element: DesignElement): string {
  if (element.type === 'text') return element.text;
  if (element.type === 'image') return '사진';
  return element.shape === 'circle' ? '원 도형' : '사각형 도형';
}

export function LayerPanel() {
  const page = useDesignStore((state) => state.design.pages[0]);
  const selectedElementIds = useEditorRuntimeStore((state) => state.selectedElementIds);
  const setSelectedElementIds = useEditorRuntimeStore((state) => state.setSelectedElementIds);
  return (
    <section aria-label="레이어 도구" className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-[var(--ink)]">레이어</h2>
        <p className="mt-1 text-xs leading-5 text-[var(--ink-muted)]">위에 있는 요소부터 순서대로 표시됩니다.</p>
      </div>
      <ol className="space-y-1" aria-label="카드 레이어">
        {[...(page?.elements ?? [])].reverse().map((element) => {
          const selected = selectedElementIds.length === 1 && selectedElementIds[0] === element.id;
          const name = layerName(element);
          return (
            <li key={element.id}>
              <button
                type="button"
                aria-label={`${name} 레이어 선택`}
                aria-pressed={selected}
                onClick={() => setSelectedElementIds([element.id])}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] ${selected ? 'bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'text-[var(--ink)] hover:bg-[var(--surface-muted)]'}`}
              >
                <span aria-hidden="true" className="text-[var(--ink-muted)]">{element.type === 'text' ? 'T' : element.type === 'image' ? '▧' : '●'}</span>
                <span className="truncate">{name}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
