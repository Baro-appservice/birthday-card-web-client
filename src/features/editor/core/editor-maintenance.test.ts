import { describe, expect, it, vi } from 'vitest';

import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

function collectedIds(call: unknown[]): string[] {
  const protectedIds = call[0];
  if (!(protectedIds instanceof Set)) throw new Error('GC 보호 집합이 Set이 아닙니다.');
  return [...protectedIds].sort();
}

describe('Editor asset maintenance', () => {
  it('현재 Design에서 사라져도 redo history가 되살릴 이미지 asset은 GC에서 보호한다', async () => {
    const kit = createEditorTestKit();
    vi.mocked(kit.assetGateway.upload).mockResolvedValue({
      id: 'asset:history-photo',
      mimeType: 'image/png',
      width: 1200,
      height: 600,
    });

    await kit.editor.addImage(new File(['image'], 'birthday.png', { type: 'image/png' }));
    await kit.editor.undo();
    await kit.editor.flushMaintenance();

    expect(kit.assetGateway.garbageCollect).toHaveBeenCalledOnce();
    expect(collectedIds(vi.mocked(kit.assetGateway.garbageCollect!).mock.calls[0]))
      .toContain('asset:history-photo');
  });

  it('현재 Design이 직접 참조하는 업로드 asset도 history와 무관하게 보호한다', async () => {
    const kit = createEditorTestKit();
    const design = structuredClone(kit.designStore.getState().design);
    const photo = design.pages[0].elements.find((element) => element.id === 'photo');
    if (!photo || photo.type !== 'image') throw new Error('photo가 없습니다.');
    photo.assetId = 'asset:current-photo';
    kit.designStore.getState().replaceDesign(design);

    await kit.editor.flushMaintenance();

    expect(collectedIds(vi.mocked(kit.assetGateway.garbageCollect!).mock.calls[0]))
      .toContain('asset:current-photo');
  });

  it('GC capability가 없는 gateway에서도 maintenance flush는 no-op으로 성공한다', async () => {
    const kit = createEditorTestKit();
    delete (kit.assetGateway as { garbageCollect?: unknown }).garbageCollect;

    await expect(kit.editor.flushMaintenance()).resolves.toBeUndefined();
  });
});
