import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { EditorAssemblyFactory } from '@/features/editor/context/editor-provider';
import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

import { EditorScreen } from './editor-screen';

interface MediaQueryListener {
  (event: MediaQueryListEvent): void;
}

function installMatchMedia(width: number) {
  let currentWidth = width;
  const listeners = new Map<string, Set<MediaQueryListener>>();
  const matches = (query: string) => {
    if (query === '(max-width: 767px)') return currentWidth < 768;
    if (query === '(min-width: 768px) and (max-width: 1023px)') return currentWidth >= 768 && currentWidth < 1024;
    return false;
  };
  vi.stubGlobal('matchMedia', vi.fn((query: string): MediaQueryList => ({
    matches: matches(query),
    media: query,
    onchange: null,
    addEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      const subscriptions = listeners.get(query) ?? new Set<MediaQueryListener>();
      subscriptions.add(listener as MediaQueryListener);
      listeners.set(query, subscriptions);
    },
    removeEventListener: (_type: string, listener: EventListenerOrEventListenerObject) => {
      listeners.get(query)?.delete(listener as MediaQueryListener);
    },
    addListener: (listener: MediaQueryListener) => {
      const subscriptions = listeners.get(query) ?? new Set<MediaQueryListener>();
      subscriptions.add(listener);
      listeners.set(query, subscriptions);
    },
    removeListener: (listener: MediaQueryListener) => listeners.get(query)?.delete(listener),
    dispatchEvent: () => true,
  })));
  return {
    setWidth(nextWidth: number) {
      currentWidth = nextWidth;
      for (const [query, subscriptions] of listeners) {
        const event = { matches: matches(query), media: query } as MediaQueryListEvent;
        subscriptions.forEach((listener) => listener(event));
      }
    },
  };
}

function assemblyFactoryFor(kit: ReturnType<typeof createEditorTestKit>): EditorAssemblyFactory {
  return vi.fn(async () => ({
    value: {
      editor: kit.editor,
      designStore: kit.designStore,
      runtimeStore: kit.runtimeStore,
      uiStore: kit.uiStore,
      repository: kit.repository,
      saveCoordinator: kit.saveCoordinator,
    },
    disposeAssetGateway: () => undefined,
    closeDatabase: () => undefined,
  }));
}

describe('EditorScreen responsive composition', () => {
  it('390·820·1280 전환에서 주변 도구만 바꾸고 같은 Canvas를 유지한다', async () => {
    const viewport = installMatchMedia(390);
    const kit = createEditorTestKit();
    const view = render(<EditorScreen cardId="local-demo" assemblyFactory={assemblyFactoryFor(kit)} />);

    expect(await screen.findByRole('toolbar', { name: '모바일 편집 도구' })).toBeVisible();
    expect(screen.queryByRole('navigation', { name: '데스크톱 편집 도구' })).not.toBeInTheDocument();
    const canvas = screen.getByTestId('editor-canvas');
    await waitFor(() => expect(kit.renderer.mount).toHaveBeenCalledOnce());

    act(() => viewport.setWidth(820));
    expect(await screen.findByRole('button', { name: '편집 도구 열기' })).toBeVisible();
    expect(screen.queryByRole('toolbar', { name: '모바일 편집 도구' })).not.toBeInTheDocument();
    expect(screen.getByTestId('editor-canvas')).toBe(canvas);

    act(() => viewport.setWidth(1280));
    expect(await screen.findByRole('navigation', { name: '데스크톱 편집 도구' })).toBeVisible();
    expect(screen.getByTestId('editor-canvas')).toBe(canvas);
    expect(kit.renderer.mount).toHaveBeenCalledOnce();

    view.unmount();
  });

  it('모바일 선택 속성은 focus를 받는 modal Bottom Sheet에서 닫을 수 있다', async () => {
    installMatchMedia(390);
    const user = userEvent.setup();
    const kit = createEditorTestKit();
    render(<EditorScreen cardId="local-demo" assemblyFactory={assemblyFactoryFor(kit)} />);

    await screen.findByRole('toolbar', { name: '모바일 편집 도구' });
    act(() => kit.runtimeStore.getState().setSelectedElementIds(['title']));
    const sheet = await screen.findByRole('dialog', { name: '선택한 요소 편집' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: '속성 시트 닫기' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: '속성 시트 닫기' }));
    expect(screen.queryByRole('dialog', { name: '선택한 요소 편집' })).not.toBeInTheDocument();
  });

  it('태블릿 선택 속성을 modal property sheet로 열고 Drawer의 focus와 Escape를 관리한다', async () => {
    const viewport = installMatchMedia(820);
    const user = userEvent.setup();
    const kit = createEditorTestKit();
    const view = render(<EditorScreen cardId="local-demo" assemblyFactory={assemblyFactoryFor(kit)} />);

    const drawerTrigger = await screen.findByRole('button', { name: '편집 도구 열기' });
    await user.click(drawerTrigger);
    expect(await screen.findByRole('navigation', { name: '태블릿 편집 도구' })).toBeVisible();
    expect(screen.getByRole('button', { name: '텍스트' })).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('navigation', { name: '태블릿 편집 도구' })).not.toBeInTheDocument());
    expect(drawerTrigger).toHaveFocus();

    drawerTrigger.focus();
    act(() => kit.runtimeStore.getState().setSelectedElementIds(['title']));
    const sheet = await screen.findByRole('dialog', { name: '선택한 요소 편집' });
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: '속성 시트 닫기' })).toHaveFocus();
    expect(sheet).toContainElement(screen.getByLabelText('선택 도구'));

    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '선택한 요소 편집' })).not.toBeInTheDocument());
    expect(drawerTrigger).toHaveFocus();

    await user.click(drawerTrigger);
    await screen.findByRole('navigation', { name: '태블릿 편집 도구' });
    act(() => viewport.setWidth(1280));
    await waitFor(() => expect(screen.queryByRole('navigation', { name: '태블릿 편집 도구' })).not.toBeInTheDocument());
    view.unmount();
    expect(() => fireEvent.keyDown(window, { key: 'Escape' })).not.toThrow();
  });

  it('태블릿의 중첩 PropertySheet는 첫 Escape를 소비하고 Drawer는 두 번째 Escape에서 닫는다', async () => {
    installMatchMedia(820);
    const user = userEvent.setup();
    const kit = createEditorTestKit();
    render(<EditorScreen cardId="local-demo" assemblyFactory={assemblyFactoryFor(kit)} />);

    const drawerTrigger = await screen.findByRole('button', { name: '편집 도구 열기' });
    await user.click(drawerTrigger);
    const drawer = await screen.findByRole('navigation', { name: '태블릿 편집 도구' });
    const sheetTrigger = screen.getByRole('button', { name: '텍스트' });
    sheetTrigger.focus();
    act(() => kit.runtimeStore.getState().setSelectedElementIds(['title']));
    const sheet = await screen.findByRole('dialog', { name: '선택한 요소 편집' });

    fireEvent.keyDown(sheet, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: '선택한 요소 편집' })).not.toBeInTheDocument());
    expect(drawer).toBeInTheDocument();
    expect(sheetTrigger).toHaveFocus();

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('navigation', { name: '태블릿 편집 도구' })).not.toBeInTheDocument());
    expect(drawerTrigger).toHaveFocus();
  });

  it('모바일 property variant는 레이어 동작까지 44px control contract를 적용하고 물리 키보드를 처리한다', async () => {
    installMatchMedia(390);
    const kit = createEditorTestKit();
    const undo = vi.spyOn(kit.editor, 'undo');
    render(<EditorScreen cardId="local-demo" assemblyFactory={assemblyFactoryFor(kit)} />);

    await screen.findByRole('toolbar', { name: '모바일 편집 도구' });
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledOnce();

    act(() => kit.runtimeStore.getState().setSelectedElementIds(['title']));
    const sheet = await screen.findByRole('dialog', { name: '선택한 요소 편집' });
    expect(screen.getByRole('button', { name: '앞으로' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '뒤로' })).toBeInTheDocument();
    for (const control of sheet.querySelectorAll('button, select, input:not([type="file"])')) {
      expect(control).toHaveClass('property-touch-target');
    }
  });

  it('workspace가 남은 grid 공간을 소유하고 Canvas frame을 4:5 containment로 제한한다', async () => {
    installMatchMedia(820);
    const kit = createEditorTestKit();
    render(<EditorScreen cardId="local-demo" assemblyFactory={assemblyFactoryFor(kit)} />);

    await screen.findByRole('button', { name: '편집 도구 열기' });
    expect(screen.getByTestId('editor-workspace')).toHaveClass('min-h-0', 'overflow-hidden');
    expect(screen.getByTestId('editor-canvas-viewport')).toHaveClass('min-h-0', 'flex-1');
    expect(screen.getByTestId('editor-canvas-viewport')).toHaveAttribute('data-scrollable-zoom', 'true');
    expect(screen.getByTestId('editor-canvas-frame')).toHaveAttribute('data-layout-contract', '4:5-scrollable-zoom');
    expect(screen.getByTestId('editor-canvas-scroll-content')).toBeInTheDocument();
    expect(screen.getByTestId('editor-canvas-zoom-stage')).toHaveStyle({ '--editor-zoom': '1' });
  });

  it('25%에서 200%까지 layout stage만 바꾸고 같은 Canvas를 유지한다', async () => {
    installMatchMedia(1280);
    const user = userEvent.setup();
    const kit = createEditorTestKit();
    render(<EditorScreen cardId="local-demo" assemblyFactory={assemblyFactoryFor(kit)} />);
    const canvas = await screen.findByLabelText('생일 카드 편집 캔버스');
    await waitFor(() => expect(kit.renderer.mount).toHaveBeenCalledOnce());

    for (let index = 0; index < 4; index += 1) {
      await user.click(screen.getByRole('button', { name: '확대' }));
    }
    expect(screen.getByText('200%')).toBeVisible();
    expect(screen.getByTestId('editor-canvas-zoom-stage')).toHaveStyle({ '--editor-zoom': '2' });

    for (let index = 0; index < 7; index += 1) {
      await user.click(screen.getByRole('button', { name: '축소' }));
    }
    expect(screen.getByText('25%')).toBeVisible();
    expect(screen.getByTestId('editor-canvas-zoom-stage')).toHaveStyle({ '--editor-zoom': '0.25' });
    expect(screen.getByLabelText('생일 카드 편집 캔버스')).toBe(canvas);
    expect(kit.renderer.mount).toHaveBeenCalledOnce();
  });
});
