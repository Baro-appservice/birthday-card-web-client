'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';

import { EditorProvider, type EditorAssemblyFactory } from '@/features/editor/context/editor-provider';
import { useKeyboardShortcuts } from '@/features/editor/hooks/use-keyboard-shortcuts';
import {
  useEditor,
  useEditorAssemblyRetry,
  useEditorRuntimeStore,
  useEditorSaveCoordinator,
  useEditorUiStore,
} from '@/features/editor/hooks/use-editor';
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
import { EditorErrorState } from './editor-error-state';
import { RecoveryDialog } from './recovery-dialog';

export function EditorScreen({
  cardId,
  assemblyFactory,
}: {
  cardId: string;
  assemblyFactory?: EditorAssemblyFactory;
}) {
  return (
    <EditorProvider
      cardId={cardId}
      assemblyFactory={assemblyFactory}
      renderInitializationError={({ message, retry }) => (
        <EditorErrorState
          title="편집기를 시작하지 못했습니다."
          description={message}
          onAction={retry}
        />
      )}
    >
      <EditorSessionScreen cardId={cardId} />
    </EditorProvider>
  );
}

function EditorSessionScreen({ cardId }: { cardId: string }) {
  const session = useEditorSession(cardId);
  const retryAssembly = useEditorAssemblyRetry();
  const canvasStatus = useEditorRuntimeStore((state) => state.canvasStatus);
  const operationError = useEditorUiStore((state) => state.error);

  if (session.status === 'loading') {
    return <main className="grid min-h-dvh place-items-center bg-[var(--workspace)] text-[var(--ink)]">카드를 불러오고 있습니다.</main>;
  }
  if (session.status === 'error') {
    return (
      <EditorErrorState
        title="카드를 불러오지 못했습니다."
        description="브라우저 저장소를 확인한 뒤 다시 시도해 주세요."
        onAction={retryAssembly}
      />
    );
  }
  if (session.status === 'recoverable') {
    return <RecoverableEditorSession onRecover={session.recover} />;
  }
  if (canvasStatus === 'error') {
    return (
      <EditorErrorState
        title="캔버스를 시작하지 못했습니다."
        description={operationError ?? '캔버스를 준비하지 못했습니다. 브라우저 상태를 확인한 뒤 다시 시도해 주세요.'}
        onAction={retryAssembly}
      />
    );
  }

  return <EditorResponsiveLayout cardId={cardId} />;
}

function RecoverableEditorSession({
  onRecover,
}: {
  onRecover: ReturnType<typeof useEditorSession>['recover'];
}) {
  const [dialogOpen, setDialogOpen] = useState(true);
  const notice = useEditorUiStore((state) => state.recoveryNotice);
  if (!notice) return null;
  return (
    <>
      <EditorErrorState
        title="저장된 카드에 복구가 필요합니다."
        description="손상되었거나 현재 버전에서 열 수 없는 저장 기록을 발견했습니다."
        actionLabel="복구 옵션 열기"
        onAction={() => setDialogOpen(true)}
      />
      {dialogOpen ? (
        <RecoveryDialog
          notice={notice}
          onClose={() => setDialogOpen(false)}
          onRecover={onRecover}
        />
      ) : null}
    </>
  );
}

function EditorResponsiveLayout({ cardId }: { cardId: string }) {
  const isMobile = useMediaQuery('(max-width: 767px)');
  const isTablet = useMediaQuery('(min-width: 768px) and (max-width: 1023px)');
  const editor = useEditor();
  const saveCoordinator = useEditorSaveCoordinator();
  const saveStatus = useEditorUiStore((state) => state.saveStatus);
  const setError = useEditorUiStore((state) => state.setError);
  useKeyboardShortcuts(editor, {
    enabled: true,
    onError: setError,
  });

  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') void saveCoordinator.flush();
    };
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (saveStatus !== 'error') return;
      event.preventDefault();
      event.returnValue = '';
    };
    const guardInternalNavigation = (event: MouseEvent) => {
      if (saveStatus !== 'error' || event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[href]') : null;
      if (!target || target.target === '_blank' || target.hasAttribute('download')) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin) return;
      const proceed = window.confirm('마지막 변경을 저장하지 못했습니다. 복구용 사본은 남겨두었습니다. 그래도 이동할까요?');
      if (!proceed) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('beforeunload', warnBeforeUnload);
    document.addEventListener('click', guardInternalNavigation, true);
    return () => {
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('beforeunload', warnBeforeUnload);
      document.removeEventListener('click', guardInternalNavigation, true);
    };
  }, [saveCoordinator, saveStatus]);

  return (
    <main className="party-shell grid min-h-dvh grid-rows-[auto_minmax(0,1fr)_auto] bg-[var(--workspace)]">
      <EditorTopbar cardId={cardId} compact={isMobile} />
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
    <section data-testid="editor-workspace" aria-label="카드 편집 영역" className="party-workspace flex min-h-0 min-w-0 flex-col overflow-hidden p-3 sm:p-5 lg:p-8">
      <div data-testid="party-confetti" aria-hidden="true" className="party-confetti">
        <span /><span /><span /><span /><span /><span />
      </div>
      <div className="relative z-10 mx-auto flex h-full min-h-0 w-full min-w-0 flex-col items-center gap-3 sm:gap-4">
        <div className="w-full max-w-[720px]">{showContextualToolbar ? <ContextualToolbar /> : <div className="min-h-0" />}</div>
        <div
          data-testid="editor-canvas-viewport"
          data-scrollable-zoom="true"
          className={`relative min-h-0 w-full flex-1 overflow-auto ${canvasStyles.viewport}`}
        >
          <div data-testid="editor-canvas-scroll-content" className={canvasStyles.scrollContent}>
            <div
              data-testid="editor-canvas-zoom-stage"
              className={canvasStyles.zoomStage}
              style={{ '--editor-zoom': String(zoom) } as CSSProperties}
            >
              <div data-testid="editor-canvas" className={canvasStyles.zoomSurface}>
                <div className={canvasStyles.paperShadow} aria-hidden="true" />
                <EditorCanvas />
              </div>
            </div>
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

  useEffect(() => {
    if (mobileSheet && selectedElementIds.length > 0) setMobileSheet(null);
  }, [mobileSheet, selectedElementIds.length, setMobileSheet]);

  if (!mobileSheet || selectedElementIds.length > 0) return null;
  const panel = mobileSheet === 'text' ? <TextPanel /> : mobileSheet === 'image' ? <ImagePanel /> : <ShapePanel />;
  const title = mobileSheet === 'text' ? '텍스트 추가' : mobileSheet === 'image' ? '사진 추가' : '도형 추가';
  return <PropertySheet title={title} onClose={() => setMobileSheet(null)}>{panel}</PropertySheet>;
}

function ResponsiveSelectionSheet() {
  const selectedElementIds = useEditorRuntimeStore((state) => state.selectedElementIds);
  const selectedId = selectedElementIds.length === 1 ? selectedElementIds[0] : null;

  if (!selectedId) return null;
  return <ResponsiveSelectionInspector key={selectedId} />;
}

function ResponsiveSelectionInspector() {
  const [open, setOpen] = useState(true);

  if (!open) {
    return (
      <button
        type="button"
        aria-label="선택한 요소 속성 열기"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-30 min-h-11 min-w-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-bold text-[var(--ink)] shadow-[var(--shadow-float)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand)] md:bottom-4"
      >속성</button>
    );
  }

  return (
    <PropertySheet title="선택한 요소 편집" onClose={() => setOpen(false)}>
      <ContextualToolbar variant="property" />
    </PropertySheet>
  );
}
