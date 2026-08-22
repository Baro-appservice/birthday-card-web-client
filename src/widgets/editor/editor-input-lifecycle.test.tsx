import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

import { ImagePanel } from './sidebar/image-panel';
import { ContextualToolbar } from './toolbar/contextual-toolbar';

function textOf(kit: ReturnType<typeof createEditorTestKit>, elementId: string): string | undefined {
  const element = kit.designStore.getState().design.pages[0]?.elements
    .find((candidate) => candidate.id === elementId);
  return element?.type === 'text' ? element.text : undefined;
}

describe('editor input lifecycle', () => {
  it('debounce 전에 선택이 바뀌어 input이 unmount돼도 draft를 원래 text element에 커밋한다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    const updateTextElement = vi.spyOn(kit.editor, 'updateTextElement');
    render(<ContextualToolbar />, { wrapper: kit.wrapper });

    const input = screen.getByRole('textbox', { name: '선택한 텍스트 내용' });
    fireEvent.change(input, { target: { value: '선택이 바뀌어도 남아야 하는 draft' } });

    act(() => {
      kit.runtimeStore.getState().setSelectedElementIds(['name']);
    });

    await waitFor(() => {
      expect(textOf(kit, 'title')).toBe('선택이 바뀌어도 남아야 하는 draft');
    });
    expect(textOf(kit, 'name')).toBe('김생일');
    expect(updateTextElement).toHaveBeenCalledWith(
      'page-1',
      'title',
      '선택이 바뀌어도 남아야 하는 draft',
      { historyGroup: expect.stringMatching(/^text:title:/) },
    );
  });

  it('사진 추가 input은 같은 파일을 연속 선택해도 두 번 업로드한다', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const kit = createEditorTestKit();
    const addImage = vi.spyOn(kit.editor, 'addImage').mockResolvedValue(undefined);
    render(<ImagePanel />, { wrapper: kit.wrapper });
    const input = screen.getByLabelText('사진 파일 선택');
    const file = new File(['same'], 'same.png', { type: 'image/png' });

    await user.upload(input, file);
    await user.upload(input, file);

    expect(addImage).toHaveBeenCalledTimes(2);
    expect(addImage).toHaveBeenNthCalledWith(1, file);
    expect(addImage).toHaveBeenNthCalledWith(2, file);
  });

  it('사진 교체 input도 같은 파일을 연속 선택해 두 번 교체할 수 있다', async () => {
    const user = userEvent.setup({ applyAccept: false });
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['photo']);
    const replace = vi.spyOn(kit.editor, 'replaceSelectedImage').mockResolvedValue(undefined);
    render(<ContextualToolbar />, { wrapper: kit.wrapper });
    const input = screen.getByLabelText('교체할 사진 파일 선택');
    const file = new File(['same'], 'same.png', { type: 'image/png' });

    await user.upload(input, file);
    await user.upload(input, file);

    expect(replace).toHaveBeenCalledTimes(2);
    expect(replace).toHaveBeenNthCalledWith(1, file);
    expect(replace).toHaveBeenNthCalledWith(2, file);
  });
});
