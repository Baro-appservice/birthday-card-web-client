import { act, render, renderHook, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createSampleDesign } from '@/entities/design';

import { createEditorTestKit } from '../testing/editor-test-kit';
import { EditorCanvas } from '@/widgets/editor/canvas/editor-canvas';
import { useEditorSession } from './use-editor-session';

describe('useEditorSession', () => {
  it('저장 문서가 없으면 샘플을 초기화하고 첫 저장을 예약한다', async () => {
    const kit = createEditorTestKit({ loadResult: { status: 'empty' } });
    const { result } = renderHook(() => useEditorSession('local-demo'), {
      wrapper: kit.wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(kit.designStore.getState().design.pages[0].elements.length).toBeGreaterThan(0);
    expect(kit.saveCoordinator.schedule).toHaveBeenCalledOnce();
  });

  it('저장 문서가 있으면 이를 편집 문서로 사용하고 저장을 예약하지 않는다', async () => {
    const loaded = createSampleDesign();
    loaded.pages[0].background = '#ffffff';
    const kit = createEditorTestKit({ loadResult: { status: 'loaded', design: loaded } });
    const { result } = renderHook(() => useEditorSession('local-demo'), {
      wrapper: kit.wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe('ready'));

    expect(kit.designStore.getState().design.pages[0].background).toBe('#ffffff');
    expect(kit.saveCoordinator.schedule).not.toHaveBeenCalled();
  });

  it('recoverable 결과는 복구 안내를 노출하고 자동 덮어쓰지 않는다', async () => {
    const kit = createEditorTestKit({
      loadResult: {
        status: 'recoverable',
        reason: 'corrupt',
        backup: createSampleDesign(),
      },
    });
    const { result } = renderHook(() => useEditorSession('local-demo'), {
      wrapper: kit.wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe('recoverable'));

    expect(kit.uiStore.getState().recoveryNotice).not.toBeNull();
    expect(kit.repository.save).not.toHaveBeenCalled();
    expect(kit.saveCoordinator.schedule).not.toHaveBeenCalled();
  });

  it('사용자가 복구를 선택한 경우에만 backup을 적용하고 저장을 flush한 뒤 준비 상태가 된다', async () => {
    const backup = createSampleDesign();
    backup.pages[0].background = '#f0e0ff';
    const kit = createEditorTestKit({
      loadResult: { status: 'recoverable', reason: 'corrupt', backup },
    });
    const { result } = renderHook(() => useEditorSession('local-demo'), {
      wrapper: kit.wrapper,
    });

    await waitFor(() => expect(result.current.status).toBe('recoverable'));
    let finishFlush!: () => void;
    const flushPending = new Promise<void>((resolve) => { finishFlush = resolve; });
    vi.mocked(kit.saveCoordinator.flush).mockReturnValueOnce(flushPending);
    let recovery!: Promise<void>;
    act(() => { recovery = result.current.recover('backup'); });

    expect(result.current.status).toBe('recoverable');
    expect(kit.designStore.getState().design.pages[0].background).toBe('#f0e0ff');
    expect(kit.saveCoordinator.schedule).toHaveBeenCalledOnce();
    expect(kit.saveCoordinator.flush).toHaveBeenCalledOnce();
    expect(kit.uiStore.getState().recoveryNotice).not.toBeNull();

    finishFlush();
    await act(async () => { await recovery; });

    expect(result.current.status).toBe('ready');
    expect(kit.uiStore.getState().recoveryNotice).toBeNull();
  });

  it('StrictMode 재실행에서도 같은 Editor canvas를 한 번만 mount한다', async () => {
    const kit = createEditorTestKit();
    const Wrapper = kit.wrapper;
    const view = render(
      <StrictMode>
        <Wrapper><EditorCanvas /></Wrapper>
      </StrictMode>,
    );

    await waitFor(() => expect(kit.renderer.mount).toHaveBeenCalledOnce());
    view.unmount();

    expect(kit.renderer.dispose).not.toHaveBeenCalled();
  });
});
