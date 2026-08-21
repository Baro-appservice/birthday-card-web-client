'use client';

import { useEffect, useRef, useState } from 'react';

import { EditorProvider, type EditorAssemblyFactory } from '@/features/editor/context/editor-provider';
import { useKeyboardShortcuts } from '@/features/editor/hooks/use-keyboard-shortcuts';
import { useEditor, useEditorRuntimeStore, useEditorUiStore } from '@/features/editor/hooks/use-editor';
import { useEditorSession } from '@/features/editor/hooks/use-editor-session';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { IconButton } from '@/shared/ui/icon-button';
import { Toast } from '@/shared/ui/toast';

import { EditorCanvas } from './canvas/editor-canvas';
import canvasStyles from './canvas/editor-canvas.module.css';
import { MobileToolbar } from './mobile/mobile-toolbar';
import { PropertySheet } from './mobile/property-sheet';
import { ImagePanel } from './sidebar/image-panel';
import { EditorSidebar } from './sidebar/editor-sidebar';
import { ShapePanel } from './sidebar/shape-panel';
import { TextPanel } from './sidebar/text-panel';
import { ContextualToolbar } from './toolbar/contextual-toolbar';
import { EditorTopbar } from './toolbar/editor-topbar';

export function EditorScreen({
  cardId,
  assemblyFactory,
}: {
  cardId: string;
  assemblyFactory?: EditorAssemblyFactory;
}) {
  return (
    <EditorProvider cardId={cardId} assemblyFactory={assemblyFactory}>
      <EditorSessionScreen cardId={cardId} />
    </EditorProvider>
  );
}

function EditorSessionScreen({ cardId }: { cardId: string }) {
  const session = useEditorSession(cardId);

  if (session.status === 'loading') {
    return <main className="grid min-h-dvh place-items-center bg-[var(--workspace)] text-[var(--ink)]">카드를 불러오고 있습니다.</main>;
  }
  if (session.status === 'error') {
    return <main className="grid min-h-dvh place-items-center bg-[var(--workspace)] text-[var(--ink)]">카드를 불러오지 못했습니다.</main>;
  }
  if (session.status === 'recoverable') {
    return (
      <main className="grid min-h-dvh place-items-center gap-4 p-6 text-center">
        <div>
          <h1 className="font-[ui-rounded,Arial_Rounded_MT_Bold,system-ui] text-xl text-[var(--ink)]">저장된 카드를 복구할까요?</h1>
          <p className="mt-2 text-sm text-[var(--ink-muted)]">복구를 선택하기 전에는 저장 내용을 변경하지 않습니다.</p>
        </div>
        <div className="flex gap-3">
          <button type="button" onClick={() => session.recover('backup')}>백업 복구</button>
          <button type="button" onClick={() => session.recover('sample')}>새 샘플로 시작</button>
        </div>
      </main>
    );
  }

  return <EditorResponsiveLayout />;
}

function EditorResponsiveLayout() {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const editor = useEditor();
  const setError = useEditorUiStore((state) => state.setError);
  useKeyboardShortcuts(editor, {
    enabled: true,
    onError: setError,
  });

  return (
    <main className="grid min-h-dvh grid-rows-[auto_minmax(0,1fr)_auto] bg-[var(--workspace)]">
      <EditorTopbar compact={isMobile} />
      <div className={`grid min-h-0 ${isMobile || isTablet ? 'grid-cols-[minmax(0,1fr)]' : 'grid-cols-[minmax(17.5rem,22rem)_minmax(0,1fr)]'}`}>
        {!isMobile && !isTablet ? <div role="navigation" aria-label="데스크톱 편집 도구"><EditorSidebar /></div> : null}
        {isTablet ? <TabletDrawer /> : null}
        <EditorWorkspace showContextualToolbar={!isMobile && !isTablet} />
      </div>
      {isMobile || isTablet ? <ResponsiveSelectionSheet /> : null}
      {isMobile ? <><MobileActionSheet /><MobileToolbar /></> : null}
      <Toast />
    </main>
  );
}

function EditorWorkspace({ showContextualToolbar }: { showContextualToolbar: boolean }) {
  const editor = useEditor();
  const zoom = useEditorRuntimeStore((state) => state.zoom);
  return (
    <section data-testid="editor-workspace" aria-label="카드 편집 영역" className="flex min-h-0 min-w-0 flex-col overflow-hidden p-3 sm:p-5 lg:p-8">
      <div className="mx-auto flex h-full min-h-0 w-full min-w-0 flex-col items-center gap-3 sm:gap-4">
        <div className="w-full max-w-[720px]">{showContextualToolbar ? <ContextualToolbar /> : <div className="min-h-0" />}</div>
        <div data-testid="editor-canvas-viewport" className={`relative flex min-h-0 w-full flex-1 justify-center overflow-hidden pb-3 ${canvasStyles.viewport}`}>
          <div className="absolute inset-y-5 w-[min(88%,650px)] translate-x-5 -rotate-2 rounded-[1.8rem] bg-[var(--brand-soft)] shadow-[var(--paper-shadow)]" aria-hidden="true" />
          <div data-testid="editor-canvas" className="relative w-full origin-top transition-transform motion-reduce:transition-none" style={{ transform: `scale(${zoom})`, marginBottom: `${(zoom - 1) * 100}%` }}>
            <EditorCanvas />
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 py-1 shadow-[var(--shadow-soft)]" aria-label="확대 축소">
          <IconButton aria-label="축소" className="sm:size-9 size-11" disabled={zoom <= 0.25} onClick={() => editor.setZoom(zoom - 0.25)}>−</IconButton>
          <output className="min-w-12 text-center font-mono text-xs text-[var(--ink-muted)]">{Math.round(zoom * 100)}%</output>
          <IconButton aria-label="확대" className="sm:size-9 size-11" disabled={zoom >= 2} onClick={() => editor.setZoom(zoom + 0.25)}>+</IconButton>
        </div>
      </div>
    </section>
  );
}

function TabletDrawer() {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const closeDrawer = () => {
    setIsOpen(false);
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    drawerRef.current?.querySelector<HTMLElement>('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        closeDrawer();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

  return (
    <div className="absolute left-0 top-16 z-30">
      <button
        type="button"
        aria-label={isOpen ? '편집 도구 닫기' : '편집 도구 열기'}
        aria-controls="tablet-editor-drawer"
        aria-expanded={isOpen}
        ref={triggerRef}
        onClick={() => isOpen ? closeDrawer() : setIsOpen(true)}
        className="m-3 grid min-h-11 min-w-11 place-items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-sm font-bold text-[var(--ink)] shadow-[var(--shadow-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)]"
      >도구</button>
      {isOpen ? <div ref={drawerRef} id="tablet-editor-drawer" role="navigation" aria-label="태블릿 편집 도구" className="h-[calc(100dvh-4rem)] w-[19rem] border-r border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-float)]"><EditorSidebar /></div> : null}
    </div>
  );
}

function MobileActionSheet() {
  const mobileSheet = useEditorUiStore((state) => state.mobileSheet);
  const setMobileSheet = useEditorUiStore((state) => state.setMobileSheet);
  const selectedElementIds = useEditorRuntimeStore((state) => state.selectedElementIds);
  if (!mobileSheet || selectedElementIds.length > 0) return null;
  const panel = mobileSheet === 'text' ? <TextPanel /> : mobileSheet === 'image' ? <ImagePanel /> : <ShapePanel />;
  const title = mobileSheet === 'text' ? '텍스트 추가' : mobileSheet === 'image' ? '사진 추가' : '도형 추가';
  return <PropertySheet title={title} onClose={() => setMobileSheet(null)}>{panel}</PropertySheet>;
}

function ResponsiveSelectionSheet() {
  const selectedElementIds = useEditorRuntimeStore((state) => state.selectedElementIds);
  const selectedId = selectedElementIds.length === 1 ? selectedElementIds[0] : null;
  const [dismissedId, setDismissedId] = useState<string | null>(null);

  if (!selectedId || dismissedId === selectedId) return null;
  return (
    <PropertySheet title="선택한 요소 편집" onClose={() => setDismissedId(selectedId)}>
      <ContextualToolbar variant="property" />
    </PropertySheet>
  );
}
