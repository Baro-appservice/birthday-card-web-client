'use client';

import { useEditor, useEditorUiStore } from '@/features/editor/hooks/use-editor';

const tools = [
  { panel: 'text', label: '텍스트', symbol: 'T' },
  { panel: 'image', label: '사진', symbol: '▧' },
  { panel: 'shape', label: '도형', symbol: '○' },
] as const;

type MobileToolPanel = (typeof tools)[number]['panel'];

export function MobileToolbar() {
  const editor = useEditor();
  const setMobileSheet = useEditorUiStore((state) => state.setMobileSheet);
  const setError = useEditorUiStore((state) => state.setError);

  const openTool = async (panel: MobileToolPanel) => {
    try {
      await editor.clearSelection();
      setMobileSheet(panel);
      setError(null);
    } catch (error) {
      setError(error instanceof Error ? error.message : '편집 도구를 열지 못했습니다.');
    }
  };

  return (
    <nav
      role="toolbar"
      aria-label="모바일 편집 도구"
      className="flex min-h-16 items-center justify-around border-t border-[var(--border)] bg-[var(--surface)] px-3 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_20px_rgb(44_39_56_/_8%)]"
    >
      {tools.map((tool) => (
        <button
          key={tool.panel}
          type="button"
          onClick={() => void openTool(tool.panel)}
          className="grid min-h-11 min-w-11 place-items-center rounded-xl px-4 text-sm font-bold text-[var(--ink)] transition-colors hover:bg-[var(--workspace-deep)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] focus-visible:ring-offset-2"
        >
          <span aria-hidden="true" className="text-lg leading-none">{tool.symbol}</span>
          <span className="mt-0.5 text-xs">{tool.label}</span>
        </button>
      ))}
    </nav>
  );
}
