import { act, render, screen, waitFor } from '@testing-library/react';
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
});
