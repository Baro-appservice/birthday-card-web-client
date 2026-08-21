import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

import { ImagePanel } from './sidebar/image-panel';
import { EditorSidebar } from './sidebar/editor-sidebar';
import { LayerPanel } from './sidebar/layer-panel';
import { TextPanel } from './sidebar/text-panel';
import { ContextualToolbar } from './toolbar/contextual-toolbar';
import { EditorTopbar } from './toolbar/editor-topbar';
import { Toast } from '@/shared/ui/toast';

describe('desktop editor tools', () => {
  it('텍스트 버튼은 Editor.addText만 호출한다', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const kit = createEditorTestKit();
    const addText = vi.spyOn(kit.editor, 'addText');
    render(<EditorSidebar />, { wrapper: kit.wrapper });

    await user.click(screen.getByRole('button', { name: '텍스트 추가' }));

    expect(addText).toHaveBeenCalledOnce();
  });

  it('사진 업로드 실패 시 ImageElement를 추가하지 않고 오류를 알린다', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const kit = createEditorTestKit();
    const initialElementIds = kit.designStore.getState().design.pages[0].elements.map((element) => element.id);
    vi.spyOn(kit.editor, 'addImage').mockRejectedValue(new Error('지원하지 않는 이미지'));
    render(<><ImagePanel /><Toast /></>, { wrapper: kit.wrapper });

    await user.upload(
      screen.getByLabelText('사진 파일 선택'),
      new File(['not-an-image'], 'note.txt', { type: 'text/plain' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('지원하지 않는 이미지');
    expect(kit.designStore.getState().design.pages[0].elements.map((element) => element.id)).toEqual(initialElementIds);
  });

  it('선택한 사진 교체가 실패하면 실행 가능한 오류를 알린다', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['photo']);
    vi.spyOn(kit.editor, 'replaceSelectedImage').mockRejectedValue(new Error('사진을 읽을 수 없습니다'));
    render(<><ContextualToolbar /><Toast /></>, { wrapper: kit.wrapper });

    await user.upload(
      screen.getByLabelText('교체할 사진 파일 선택'),
      new File(['not-an-image'], 'note.txt', { type: 'text/plain' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('사진을 읽을 수 없습니다');
  });

  it('레이어 클릭은 store 대신 Editor facade로 선택을 요청한다', async () => {
    const user = userEvent.setup();
    const kit = createEditorTestKit();
    const selectElement = vi.spyOn(kit.editor as typeof kit.editor & {
      selectElement(elementId: string): Promise<void>;
    }, 'selectElement');
    render(<LayerPanel />, { wrapper: kit.wrapper });

    await user.click(screen.getByRole('button', { name: '오늘은 제 생일이에요! 레이어 선택' }));

    expect(selectElement).toHaveBeenCalledWith('title');
  });

  it('텍스트 동작 실패는 중앙 toast로 알리고 성공하면 이전 오류를 지운다', async () => {
    const user = userEvent.setup();
    const kit = createEditorTestKit();
    vi.spyOn(kit.editor, 'addText').mockRejectedValueOnce(new Error('텍스트를 추가할 수 없습니다'));
    render(<><TextPanel /><Toast /></>, { wrapper: kit.wrapper });

    await user.click(screen.getByRole('button', { name: '텍스트 추가' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('텍스트를 추가할 수 없습니다');

    await user.click(screen.getByRole('button', { name: '텍스트 추가' }));
    await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
  });

  it('저장 상태를 하나의 polite status 영역으로 갱신한다', () => {
    const kit = createEditorTestKit();
    render(<EditorTopbar />, { wrapper: kit.wrapper });

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent('저장됨');
    act(() => kit.uiStore.getState().setSaveStatus('saving'));
    expect(screen.getByRole('status')).toHaveTextContent('저장 중');
    act(() => kit.uiStore.getState().setSaveStatus('error'));
    expect(screen.getByRole('status')).toHaveTextContent('저장 실패 · 다시 시도');
  });
});
