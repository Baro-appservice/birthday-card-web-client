import { describe, expect, it, vi } from 'vitest';

import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

function pageElements(kit: ReturnType<typeof createEditorTestKit>) {
  return kit.designStore.getState().design.pages[0].elements;
}

function elementById(kit: ReturnType<typeof createEditorTestKit>, elementId: string) {
  return pageElements(kit).find((element) => element.id === elementId);
}

describe('Editor selection actions', () => {
  it('선택 요소를 바로 위 레이어에 오프셋 복제하고 Undo 한 번으로 되돌린다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    const originalIndex = pageElements(kit).findIndex((element) => element.id === 'title');
    const original = elementById(kit, 'title');
    if (!original) throw new Error('title 요소가 없습니다.');

    await kit.editor.duplicateSelection();

    const duplicated = elementById(kit, 'test-element-id');
    expect(duplicated).toMatchObject({
      ...original,
      id: 'test-element-id',
      x: original.x + 32,
      y: original.y + 32,
    });
    expect(pageElements(kit).findIndex((element) => element.id === 'test-element-id'))
      .toBe(originalIndex + 1);
    expect(kit.runtimeStore.getState().selectedElementIds).toEqual(['test-element-id']);

    await kit.editor.undo();

    expect(elementById(kit, 'test-element-id')).toBeUndefined();
    expect(kit.runtimeStore.getState().selectedElementIds).toEqual([]);
  });

  it('공통 투명도와 회전 변경을 한 History 단계로 저장하고 유효하지 않은 투명도를 거부한다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title']);

    await kit.editor.updateSelection({
      type: 'common',
      changes: { opacity: 0.42, rotation: 27 },
    });

    expect(elementById(kit, 'title')).toMatchObject({ opacity: 0.42, rotation: 27 });
    await kit.editor.undo();
    expect(elementById(kit, 'title')).toMatchObject({ opacity: 1, rotation: 0 });

    await expect(kit.editor.updateSelection({
      type: 'common',
      changes: { opacity: 1.2 },
    })).rejects.toThrow('투명도');
    expect(elementById(kit, 'title')).toMatchObject({ opacity: 1 });
  });

  it('renderer가 제공한 실제 bounding box를 기준으로 캔버스 중앙과 하단에 정렬한다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    kit.renderer.measureElement = vi.fn().mockReturnValue({
      left: 200,
      top: 400,
      width: 300,
      height: 100,
    });

    await kit.editor.alignSelection('horizontal-center');
    expect(elementById(kit, 'title')).toMatchObject({ x: 320 });

    await kit.editor.alignSelection('bottom');
    expect(elementById(kit, 'title')).toMatchObject({ y: 980 });
    expect(kit.renderer.measureElement).toHaveBeenCalledWith('title');
  });

  it('선택 요소를 맨앞/맨뒤로 이동하고 Undo로 원래 레이어 위치를 복구한다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['photo']);
    const originalIds = pageElements(kit).map((element) => element.id);

    await kit.editor.bringToFront();
    expect(pageElements(kit).at(-1)?.id).toBe('photo');

    await kit.editor.undo();
    expect(pageElements(kit).map((element) => element.id)).toEqual(originalIds);

    await kit.editor.sendToBack();
    expect(pageElements(kit)[0]?.id).toBe('photo');
  });
});
