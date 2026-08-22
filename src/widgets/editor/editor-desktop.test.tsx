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

  it('도구 전환은 tab 역할 대신 현재 상태를 알리는 pressed 버튼을 사용한다', () => {
    const kit = createEditorTestKit();
    render(<EditorSidebar />, { wrapper: kit.wrapper });

    expect(screen.queryByRole('tab')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '텍스트' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '사진' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('파티 장식은 실제 편집 버튼과 속성 도구에 적용하지 않는다', () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    render(<><EditorSidebar /><ContextualToolbar /></>, { wrapper: kit.wrapper });

    expect(screen.getByRole('button', { name: '텍스트' })).not.toHaveClass('party-tool-button');
    expect(screen.getByLabelText('선택 도구')).not.toHaveClass('party-floating-panel');
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

  it('선택한 텍스트 내용을 Editor facade로 수정한다', async () => {
    const user = userEvent.setup();
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    render(<ContextualToolbar />, { wrapper: kit.wrapper });

    const input = screen.getByRole('textbox', { name: '선택한 텍스트 내용' });
    await user.clear(input);
    await user.type(input, '올해도 제 생일을 축하해 주세요!');

    await waitFor(() => expect(
      kit.designStore.getState().design.pages[0].elements.find((element) => element.id === 'title'),
    ).toMatchObject({ text: '올해도 제 생일을 축하해 주세요!' }));
  });

  it('글자 크기를 비우고 다시 입력하는 동안 저장하지 않고 blur에서 한 번만 clamp해 반영한다', async () => {
    const user = userEvent.setup();
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    const updateSelection = vi.spyOn(kit.editor, 'updateSelection');
    render(<ContextualToolbar />, { wrapper: kit.wrapper });
    const input = screen.getByRole('spinbutton', { name: '글자 크기' });

    await user.clear(input);
    expect(updateSelection).not.toHaveBeenCalled();
    await user.type(input, '200');
    expect(updateSelection).not.toHaveBeenCalled();
    await user.tab();

    await waitFor(() => expect(updateSelection).toHaveBeenCalledOnce());
    expect(updateSelection).toHaveBeenCalledWith({
      type: 'text',
      changes: { fontSize: 160 },
    });
  });

  it('기존의 알 수 없는 글꼴은 외부 글꼴 요청 없이 system-ui 대체 표시를 사용한다', () => {
    const kit = createEditorTestKit();
    const design = structuredClone(kit.designStore.getState().design);
    const title = design.pages[0].elements.find((element) => element.id === 'title');
    if (!title || title.type !== 'text') throw new Error('title 텍스트가 없습니다.');
    title.fontFamily = 'LegacyRemoteFont';
    kit.designStore.getState().replaceDesign(design);
    kit.runtimeStore.getState().setSelectedElementIds(['title']);

    render(<ContextualToolbar />, { wrapper: kit.wrapper });

    expect(screen.getByRole('combobox', { name: '글꼴' })).toHaveValue('system-ui');
    expect(document.querySelector('link[rel="stylesheet"], style')).toBeNull();
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
    render(<EditorTopbar cardId="local-demo" />, { wrapper: kit.wrapper });

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.getByRole('status')).toHaveTextContent('저장됨');
    act(() => kit.uiStore.getState().setSaveStatus('saving'));
    expect(screen.getByRole('status')).toHaveTextContent('저장 중');
    act(() => kit.uiStore.getState().setSaveStatus('error'));
    expect(screen.getByRole('status')).toHaveTextContent('저장 실패 · 다시 시도');
  });

  it('저장 retry는 operation 오류를 지우지 않고 save 채널만 사용한다', async () => {
    const user = userEvent.setup();
    const kit = createEditorTestKit();
    kit.uiStore.getState().setError('PNG export failed');
    kit.uiStore.getState().setSaveError('quota exceeded');
    kit.uiStore.getState().setSaveStatus('error');
    render(<><EditorTopbar cardId="local-demo" /><Toast /></>, { wrapper: kit.wrapper });

    await user.click(screen.getByRole('button', { name: '다시 시도' }));

    expect(kit.saveCoordinator.retry).toHaveBeenCalledOnce();
    expect(kit.uiStore.getState().error).toBe('PNG export failed');
    expect(screen.getByRole('alert')).toHaveTextContent('PNG export failed');
  });

  it('PNG 내보내기 실패는 Design을 바꾸지 않고 중앙 Toast로 알린다', async () => {
    const user = userEvent.setup();
    const kit = createEditorTestKit();
    const before = structuredClone(kit.designStore.getState().design);
    vi.spyOn(kit.editor, 'exportPng').mockRejectedValue(new Error('PNG 렌더링 실패'));
    render(<><EditorTopbar cardId="local-demo" /><Toast /></>, { wrapper: kit.wrapper });

    await user.click(screen.getByRole('button', { name: 'PNG 저장' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('PNG 렌더링 실패');
    expect(kit.designStore.getState().design).toEqual(before);
  });
});
