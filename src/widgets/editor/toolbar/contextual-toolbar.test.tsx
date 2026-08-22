import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

import { ContextualToolbar } from './contextual-toolbar';

describe('ContextualToolbar text draft', () => {
  it('포커스를 유지한 debounce commit이 실패하면 canonical 텍스트와 visible draft를 함께 복구한다', async () => {
    const kit = createEditorTestKit();
    const original = '오늘은 제 생일이에요!';
    const failedDraft = '저장되면 안 되는 입력';
    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    vi.mocked(kit.renderer.render).mockRejectedValueOnce(new Error('render failed'));
    const view = render(<ContextualToolbar />, { wrapper: kit.wrapper });
    const input = view.getByRole('textbox', { name: '선택한 텍스트 내용' });

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: failedDraft } });
    expect(input).toHaveValue(failedDraft);

    await waitFor(() => expect(kit.uiStore.getState().error).toBe('render failed'), { timeout: 1_500 });

    expect(input).toHaveFocus();
    expect(input).toHaveValue(original);
    expect(kit.designStore.getState().design.pages[0].elements.find((element) => element.id === 'title'))
      .toMatchObject({ text: original });
  });

  it('모바일·태블릿 property variant에서도 레이어 앞뒤 이동을 노출한다', () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    const bringForward = vi.spyOn(kit.editor, 'bringForward').mockResolvedValue();
    const sendBackward = vi.spyOn(kit.editor, 'sendBackward').mockResolvedValue();
    const view = render(<ContextualToolbar variant="property" />, { wrapper: kit.wrapper });

    fireEvent.click(view.getByRole('button', { name: '앞으로' }));
    fireEvent.click(view.getByRole('button', { name: '뒤로' }));

    expect(bringForward).toHaveBeenCalledOnce();
    expect(sendBackward).toHaveBeenCalledOnce();
  });
});
