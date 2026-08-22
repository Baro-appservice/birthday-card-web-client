import { describe, expect, it, vi } from 'vitest';

import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

function photo(kit: ReturnType<typeof createEditorTestKit>) {
  const element = kit.designStore.getState().design.pages[0].elements
    .find((candidate) => candidate.id === 'photo');
  if (!element || element.type !== 'image') throw new Error('photo 이미지가 없습니다.');
  return element;
}

describe('Editor image crop', () => {
  it('한 crop slider interaction의 연속 변경은 Undo 한 번으로 기본 프레임에 돌아간다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['photo']);

    await kit.editor.updateSelection(
      { type: 'image', changes: { cropZoom: 1.8 } },
      { historyGroup: 'image-crop:session' },
    );
    await kit.editor.updateSelection(
      { type: 'image', changes: { cropZoom: 2.2 } },
      { historyGroup: 'image-crop:session' },
    );

    expect(photo(kit)).toMatchObject({ cropZoom: 2.2, cropFocusX: 0, cropFocusY: 0 });

    await kit.editor.undo();
    expect(photo(kit)).toMatchObject({ cropZoom: 1, cropFocusX: 0, cropFocusY: 0 });

    await kit.editor.redo();
    expect(photo(kit)).toMatchObject({ cropZoom: 2.2, cropFocusX: 0, cropFocusY: 0 });
  });

  it('crop 위치와 확대 범위를 검증해 잘못된 값은 document를 바꾸지 않는다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['photo']);

    await expect(kit.editor.updateSelection({
      type: 'image', changes: { cropZoom: 3.1 },
    })).rejects.toThrow('확대');
    await expect(kit.editor.updateSelection({
      type: 'image', changes: { cropFocusX: -1.1 },
    })).rejects.toThrow('위치');

    expect(photo(kit)).toMatchObject({ cropZoom: 1, cropFocusX: 0, cropFocusY: 0 });
  });

  it('사진 교체 시 이전 사진의 crop 상태를 새 사진에 넘기지 않고 중앙 1배로 초기화한다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['photo']);
    await kit.editor.updateSelection({
      type: 'image', changes: { cropZoom: 2.4, cropFocusX: 0.7, cropFocusY: -0.5 },
    });
    vi.mocked(kit.assetGateway.upload).mockResolvedValue({
      id: 'asset:replacement',
      width: 1200,
      height: 800,
    });

    await kit.editor.replaceSelectedImage(new File(['image'], 'replacement.png', { type: 'image/png' }));

    expect(photo(kit)).toMatchObject({
      assetId: 'asset:replacement',
      cropZoom: 1,
      cropFocusX: 0,
      cropFocusY: 0,
    });
  });
});
