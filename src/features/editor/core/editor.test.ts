import { createSampleDesign, type Design } from '@/entities/design';
import type {
  AssetGateway,
  DesignExporter,
  EditorEvent,
  EditorRenderer,
} from '@/features/editor/core/ports';
import { createDesignStore } from '@/features/editor/model/design-store';
import { createEditorRuntimeStore } from '@/features/editor/model/editor-runtime-store';
import { describe, expect, it, vi } from 'vitest';

import { Editor } from './editor';

function createRenderer() {
  let listener: ((event: EditorEvent) => void) | undefined;
  const renderer: EditorRenderer = {
    mount: vi.fn(),
    render: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(),
    subscribe: vi.fn((nextListener) => {
      listener = nextListener;
      return vi.fn(() => { listener = undefined; });
    }),
    dispose: vi.fn(),
  };
  return { renderer, emit: (event: EditorEvent) => listener?.(event) };
}

function createEditorTestKit() {
  const designStore = createDesignStore(createSampleDesign());
  const runtimeStore = createEditorRuntimeStore();
  const rendererKit = createRenderer();
  const assetGateway: AssetGateway = {
    upload: vi.fn().mockResolvedValue({ id: 'asset-uploaded', mimeType: 'image/png', width: 640, height: 480 }),
    resolveUrl: vi.fn(),
    remove: vi.fn(),
  };
  const exporter: DesignExporter = {
    exportPng: vi.fn().mockResolvedValue(new Blob(['png'], { type: 'image/png' })),
  };
  const onDocumentChange = vi.fn();
  const editor = new Editor({
    designStore,
    runtimeStore,
    renderer: rendererKit.renderer,
    assetGateway,
    exporter,
    idGenerator: vi.fn(() => 'created-element'),
    onDocumentChange,
  });
  return { editor, designStore, runtimeStore, ...rendererKit, assetGateway, exporter, onDocumentChange };
}

const selectedElement = (design: Design, id: string) =>
  design.pages[0].elements.find((element) => element.id === id);

describe('Editor', () => {
  it('문서 명령 뒤 render를 완료한 뒤 변경 콜백을 호출한다', async () => {
    const kit = createEditorTestKit();
    const calls: string[] = [];
    vi.mocked(kit.renderer.render).mockImplementation(async () => { calls.push('render'); });
    kit.onDocumentChange.mockImplementation(() => { calls.push('change'); });

    await kit.editor.addText();

    expect(calls).toEqual(['render', 'change']);
    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toMatchObject({ type: 'text' });
    expect(kit.runtimeStore.getState().selectedElementIds).toEqual(['created-element']);
  });

  it('동시에 들어온 문서 명령도 render와 변경 콜백을 순서대로 처리한다', async () => {
    const kit = createEditorTestKit();
    let finishFirstRender: (() => void) | undefined;
    vi.mocked(kit.renderer.render)
      .mockImplementationOnce(() => new Promise<void>((resolve) => { finishFirstRender = resolve; }))
      .mockResolvedValueOnce(undefined);

    const first = kit.editor.addText();
    const second = kit.editor.addShape('circle');
    await vi.waitFor(() => expect(kit.renderer.render).toHaveBeenCalledTimes(1));

    expect(kit.onDocumentChange).not.toHaveBeenCalled();
    finishFirstRender?.();
    await Promise.all([first, second]);

    expect(kit.renderer.render).toHaveBeenCalledTimes(2);
    expect(kit.onDocumentChange).toHaveBeenCalledTimes(2);
  });

  it('renderer selection 이벤트는 문서 변경 없이 runtime selection만 바꾼다', () => {
    const kit = createEditorTestKit();

    kit.emit({ type: 'selection:changed', elementIds: ['title', 'name'] });

    expect(kit.runtimeStore.getState().selectedElementIds).toEqual(['title', 'name']);
    expect(kit.renderer.render).not.toHaveBeenCalled();
    expect(kit.onDocumentChange).not.toHaveBeenCalled();
  });

  it('renderer transform 이벤트를 하나의 되돌릴 수 있는 명령으로 기록한다', async () => {
    const kit = createEditorTestKit();

    kit.emit({
      type: 'element:transformed',
      elementId: 'title',
      before: { x: 130, y: 130, width: 820, height: 130, rotation: 0 },
      after: { x: 230, y: 150, width: 700, height: 120, rotation: 15 },
    });
    await vi.waitFor(() => expect(selectedElement(kit.designStore.getState().design, 'title')).toMatchObject({ x: 230 }));

    await kit.editor.undo();
    expect(selectedElement(kit.designStore.getState().design, 'title')).toMatchObject({ x: 130, rotation: 0 });
  });

  it('업로드가 성공한 뒤에만 이미지 요소를 추가한다', async () => {
    const kit = createEditorTestKit();
    vi.mocked(kit.assetGateway.upload).mockRejectedValueOnce(new Error('upload failed'));
    const file = new File(['image'], 'birthday.png', { type: 'image/png' });

    await expect(kit.editor.addImage(file)).rejects.toThrow('upload failed');
    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toBeUndefined();

    await kit.editor.addImage(file);
    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toMatchObject({
      type: 'image', assetId: 'asset-uploaded',
    });
  });

  it('단일 이미지 선택에서만 교체하고 다중 선택은 안전하게 무시한다', async () => {
    const kit = createEditorTestKit();
    const file = new File(['image'], 'replacement.png', { type: 'image/png' });

    kit.runtimeStore.getState().setSelectedElementIds(['photo']);
    await kit.editor.replaceSelectedImage(file);
    expect(selectedElement(kit.designStore.getState().design, 'photo')).toMatchObject({ assetId: 'asset-uploaded' });

    kit.runtimeStore.getState().setSelectedElementIds(['photo', 'title']);
    await kit.editor.replaceSelectedImage(file);
    expect(vi.mocked(kit.assetGateway.upload)).toHaveBeenCalledTimes(1);
  });

  it('선택 타입과 맞는 속성만 갱신하고 빈 선택은 안전하게 무시한다', async () => {
    const kit = createEditorTestKit();

    await kit.editor.updateSelection({ type: 'text', changes: { color: '#000000' } });
    expect(selectedElement(kit.designStore.getState().design, 'title')).toMatchObject({ color: '#b52262' });

    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    await kit.editor.updateSelection({ type: 'shape', changes: { fill: '#000000' } });
    expect(selectedElement(kit.designStore.getState().design, 'title')).toMatchObject({ color: '#b52262' });
  });

  it('레이어 경계에서는 명령을 만들지 않고 안전하게 무시한다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['bottom-decoration']);

    await kit.editor.bringForward();
    await kit.editor.undo();

    expect(kit.designStore.getState().design.pages[0].elements.at(-1)?.id).toBe('bottom-decoration');
  });

  it('dispose는 renderer 구독을 해제하고 renderer를 정리한다', () => {
    const kit = createEditorTestKit();

    kit.editor.dispose();
    kit.emit({ type: 'selection:changed', elementIds: ['title'] });

    expect(kit.runtimeStore.getState().selectedElementIds).toEqual([]);
    expect(kit.renderer.dispose).toHaveBeenCalledTimes(1);
  });
});
