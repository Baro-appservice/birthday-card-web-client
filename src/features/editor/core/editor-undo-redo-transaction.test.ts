import { describe, expect, it, vi } from 'vitest';

import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

function hasElement(kit: ReturnType<typeof createEditorTestKit>, elementId: string): boolean {
  return kit.designStore.getState().design.pages[0]?.elements
    .some((element) => element.id === elementId) ?? false;
}

describe('Editor undo/redo transaction boundary', () => {
  it('undo의 selection 동기화가 실패하면 문서·선택·History를 모두 이전 상태로 복구한다', async () => {
    const kit = createEditorTestKit();
    await kit.editor.addText();
    expect(hasElement(kit, 'test-element-id')).toBe(true);
    expect(kit.runtimeStore.getState().selectedElementIds).toEqual(['test-element-id']);

    vi.mocked(kit.renderer.select).mockImplementationOnce(() => {
      throw new Error('undo selection failed');
    });

    await expect(kit.editor.undo()).rejects.toThrow('undo selection failed');

    expect(hasElement(kit, 'test-element-id')).toBe(true);
    expect(kit.runtimeStore.getState().selectedElementIds).toEqual(['test-element-id']);

    await kit.editor.undo();
    expect(hasElement(kit, 'test-element-id')).toBe(false);
    expect(kit.runtimeStore.getState().selectedElementIds).toEqual([]);
  });

  it('redo의 selection 동기화가 실패해도 redo 가능 상태와 문서를 함께 복구한다', async () => {
    const kit = createEditorTestKit();
    await kit.editor.addText();
    await kit.editor.undo();
    expect(hasElement(kit, 'test-element-id')).toBe(false);

    vi.mocked(kit.renderer.select).mockImplementationOnce(() => {
      throw new Error('redo selection failed');
    });

    await expect(kit.editor.redo()).rejects.toThrow('redo selection failed');

    expect(hasElement(kit, 'test-element-id')).toBe(false);
    expect(kit.runtimeStore.getState().selectedElementIds).toEqual([]);

    await kit.editor.redo();
    expect(hasElement(kit, 'test-element-id')).toBe(true);
  });
});
