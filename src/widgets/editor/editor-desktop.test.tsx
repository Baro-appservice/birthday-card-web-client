import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

import { ImagePanel } from './sidebar/image-panel';
import { EditorSidebar } from './sidebar/editor-sidebar';
import { ContextualToolbar } from './toolbar/contextual-toolbar';

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
    vi.spyOn(kit.editor, 'addImage').mockRejectedValue(new Error('지원하지 않는 이미지'));
    render(<ImagePanel />, { wrapper: kit.wrapper });

    await user.upload(
      screen.getByLabelText('사진 파일 선택'),
      new File(['not-an-image'], 'note.txt', { type: 'text/plain' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('지원하지 않는 이미지');
  });

  it('선택한 사진 교체가 실패하면 실행 가능한 오류를 알린다', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['photo']);
    vi.spyOn(kit.editor, 'replaceSelectedImage').mockRejectedValue(new Error('사진을 읽을 수 없습니다'));
    render(<ContextualToolbar />, { wrapper: kit.wrapper });

    await user.upload(
      screen.getByLabelText('교체할 사진 파일 선택'),
      new File(['not-an-image'], 'note.txt', { type: 'text/plain' }),
    );

    expect(await screen.findByRole('alert')).toHaveTextContent('사진을 읽을 수 없습니다');
  });
});
