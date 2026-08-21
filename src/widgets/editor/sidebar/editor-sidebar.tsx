'use client';

import { ColorInput } from '@/shared/ui/color-input';
import { useDesignStore, useEditor, useEditorUiStore } from '@/features/editor/hooks/use-editor';
import type { EditorPanel } from '@/features/editor/model/editor-ui-store';

import { ImagePanel } from './image-panel';
import { LayerPanel } from './layer-panel';
import { ShapePanel } from './shape-panel';
import { TextPanel } from './text-panel';

const panels: Array<{ id: Exclude<EditorPanel, null>; label: string; symbol: string }> = [
  { id: 'text', label: '텍스트', symbol: 'T' },
  { id: 'image', label: '사진', symbol: '▧' },
  { id: 'shape', label: '도형', symbol: '○' },
  { id: 'layers', label: '레이어', symbol: '≡' },
];

function ActivePanel({ panel }: { panel: Exclude<EditorPanel, null> }) {
  if (panel === 'image') return <ImagePanel />;
  if (panel === 'shape') return <ShapePanel />;
  if (panel === 'layers') return <LayerPanel />;
  return <TextPanel />;
}

export function EditorSidebar() {
  const editor = useEditor();
  const activePanel = useEditorUiStore((state) => state.activePanel) ?? 'text';
  const setActivePanel = useEditorUiStore((state) => state.setActivePanel);
  const setError = useEditorUiStore((state) => state.setError);
  const background = useDesignStore((state) => state.design.pages[0]!.background);
  const changeBackground = async (color: string) => {
    try {
      await editor.setBackground(color);
    } catch (error) {
      setError(error instanceof Error ? error.message : '카드 배경색을 바꾸지 못했습니다. 다시 시도해 주세요.');
    }
  };

  return (
    <aside className="grid min-h-0 grid-cols-[4.5rem_minmax(13rem,17rem)] border-r border-[var(--border)] bg-[var(--surface)]" aria-label="편집 도구">
      <nav aria-label="편집 도구 탭" className="flex flex-col items-center gap-2 border-r border-[var(--border)] py-4">
        {panels.map((panel) => {
          const selected = panel.id === activePanel;
          return (
            <button
              key={panel.id}
              id={`${panel.id}-tab`}
              type="button"
              role="tab"
              aria-label={panel.label}
              aria-selected={selected}
              aria-controls={`${panel.id}-panel`}
              onClick={() => setActivePanel(panel.id)}
              className={`grid size-11 place-items-center rounded-xl text-lg font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2 ${selected ? 'bg-[var(--brand)] text-white shadow-sm' : 'text-[var(--ink-muted)] hover:bg-[var(--workspace-deep)] hover:text-[var(--ink)]'}`}
            >
              <span aria-hidden="true">{panel.symbol}</span>
            </button>
          );
        })}
      </nav>
      <div className="min-w-0 overflow-y-auto p-5">
        <div id={`${activePanel}-panel`} role="tabpanel" aria-labelledby={`${activePanel}-tab`}>
          <ActivePanel panel={activePanel} />
        </div>
        <div className="mt-7 border-t border-[var(--border)] pt-5">
          <ColorInput label="카드 배경" value={background} onChange={(color) => void changeBackground(color)} />
        </div>
      </div>
    </aside>
  );
}
