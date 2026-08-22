import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

import { useKeyboardShortcuts } from './use-keyboard-shortcuts';

describe('useKeyboardShortcuts', () => {
  it('편집 영역에서 Ctrl 또는 Cmd 단축키를 Editor facade로 전달한다', () => {
    const kit = createEditorTestKit();
    const undo = vi.spyOn(kit.editor, 'undo');
    const redo = vi.spyOn(kit.editor, 'redo');
    const duplicate = vi.spyOn(kit.editor, 'duplicateSelection');
    const remove = vi.spyOn(kit.editor, 'deleteSelection');
    const bringForward = vi.spyOn(kit.editor, 'bringForward');
    const sendBackward = vi.spyOn(kit.editor, 'sendBackward');
    const { unmount } = renderHook(() => useKeyboardShortcuts(kit.editor));

    const undoEvent = fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    const redoEvent = fireEvent.keyDown(window, { key: 'z', metaKey: true, shiftKey: true });
    const alternateRedoEvent = fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    const duplicateEvent = fireEvent.keyDown(window, { key: 'd', metaKey: true });
    const bringForwardEvent = fireEvent.keyDown(window, { key: ']', metaKey: true });
    const sendBackwardEvent = fireEvent.keyDown(window, { key: '[', ctrlKey: true });
    const deleteEvent = fireEvent.keyDown(window, { key: 'Delete' });

    expect(undo).toHaveBeenCalledOnce();
    expect(redo).toHaveBeenCalledTimes(2);
    expect(duplicate).toHaveBeenCalledOnce();
    expect(bringForward).toHaveBeenCalledOnce();
    expect(sendBackward).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(undoEvent).toBe(false);
    expect(redoEvent).toBe(false);
    expect(alternateRedoEvent).toBe(false);
    expect(duplicateEvent).toBe(false);
    expect(bringForwardEvent).toBe(false);
    expect(sendBackwardEvent).toBe(false);
    expect(deleteEvent).toBe(false);

    unmount();
    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(undo).toHaveBeenCalledOnce();
  });

  it('입력 중이거나 조합 중인 키와 지원하지 않는 modifier 조합은 가로채지 않는다', () => {
    const kit = createEditorTestKit();
    const undo = vi.spyOn(kit.editor, 'undo');
    const duplicate = vi.spyOn(kit.editor, 'duplicateSelection');
    const remove = vi.spyOn(kit.editor, 'deleteSelection');
    const bringForward = vi.spyOn(kit.editor, 'bringForward');
    const { unmount } = renderHook(() => useKeyboardShortcuts(kit.editor));
    const input = document.createElement('input');
    document.body.append(input);

    const inputEvent = fireEvent.keyDown(input, { key: 'd', ctrlKey: true });
    const composingEvent = fireEvent.keyDown(window, { key: 'Delete', isComposing: true });
    const modifiedDeleteEvent = fireEvent.keyDown(window, { key: 'Backspace', altKey: true });
    const unsupportedEvent = fireEvent.keyDown(window, { key: 'z', ctrlKey: true, altKey: true });
    const shiftedLayerEvent = fireEvent.keyDown(window, { key: ']', ctrlKey: true, shiftKey: true });

    expect(undo).not.toHaveBeenCalled();
    expect(duplicate).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(bringForward).not.toHaveBeenCalled();
    expect(inputEvent).toBe(true);
    expect(composingEvent).toBe(true);
    expect(modifiedDeleteEvent).toBe(true);
    expect(unsupportedEvent).toBe(true);
    expect(shiftedLayerEvent).toBe(true);

    input.remove();
    unmount();
  });

  it('거부된 facade 작업을 중앙 오류 처리기로 전달한다', async () => {
    const kit = createEditorTestKit();
    const onError = vi.fn();
    vi.spyOn(kit.editor, 'undo').mockRejectedValue(new Error('undo failed'));
    renderHook(() => useKeyboardShortcuts(kit.editor, { onError }));

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });

    await vi.waitFor(() => expect(onError).toHaveBeenCalledWith('undo failed'));
  });
});
