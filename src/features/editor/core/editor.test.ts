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

  it('render 실패 시 문서·선택·History를 명령 전 상태로 복구한다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    vi.mocked(kit.renderer.render).mockRejectedValueOnce(new Error('render failed'));

    await expect(kit.editor.addText()).rejects.toThrow('render failed');

    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toBeUndefined();
    expect(kit.runtimeStore.getState().selectedElementIds).toEqual(['title']);
    expect(kit.onDocumentChange).not.toHaveBeenCalled();
    await kit.editor.undo();
    expect(selectedElement(kit.designStore.getState().design, 'title')).toBeDefined();
  });

  it('변경 콜백이 throw하면 문서를 복구하고 원래 오류를 반환한다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    kit.onDocumentChange.mockImplementation(() => { throw new Error('notification failed'); });

    await expect(kit.editor.addText()).rejects.toThrow('notification failed');

    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toBeUndefined();
    expect(kit.runtimeStore.getState().selectedElementIds).toEqual(['title']);
    expect(kit.renderer.render).toHaveBeenCalledTimes(2);
    await kit.editor.undo();
    expect(selectedElement(kit.designStore.getState().design, 'title')).toBeDefined();
  });

  it('rollback render도 실패하면 최초 오류를 유지하고 canvas 오류를 기록한다', async () => {
    const kit = createEditorTestKit();
    vi.mocked(kit.renderer.render)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('rollback render failed'));
    kit.onDocumentChange.mockImplementation(() => { throw new Error('notification failed'); });

    await expect(kit.editor.addText()).rejects.toThrow('notification failed');

    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toBeUndefined();
    expect(kit.runtimeStore.getState().canvasStatus).toBe('error');
  });

  it('undo와 redo의 render 실패도 문서와 History를 이전 상태로 복구한다', async () => {
    const kit = createEditorTestKit();
    await kit.editor.addText();
    vi.mocked(kit.renderer.render).mockRejectedValueOnce(new Error('undo render failed'));

    await expect(kit.editor.undo()).rejects.toThrow('undo render failed');
    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toBeDefined();

    await kit.editor.undo();
    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toBeUndefined();
    vi.mocked(kit.renderer.render).mockRejectedValueOnce(new Error('redo render failed'));

    await expect(kit.editor.redo()).rejects.toThrow('redo render failed');
    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toBeUndefined();

    await kit.editor.redo();
    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toBeDefined();
  });

  it('renderer selection 이벤트는 문서 변경 없이 FIFO runtime selection만 바꾼다', async () => {
    const kit = createEditorTestKit();

    kit.emit({ type: 'selection:changed', elementIds: ['title', 'name'] });

    await vi.waitFor(() => expect(kit.runtimeStore.getState().selectedElementIds).toEqual(['title', 'name']));
    expect(kit.renderer.render).not.toHaveBeenCalled();
    expect(kit.onDocumentChange).not.toHaveBeenCalled();
  });

  it('renderer selection 이벤트의 중복 ID를 순서를 보존해 제거한다', async () => {
    const kit = createEditorTestKit();

    kit.emit({ type: 'selection:changed', elementIds: ['title', 'name', 'title', 'name'] });

    await vi.waitFor(() => expect(kit.runtimeStore.getState().selectedElementIds).toEqual(['title', 'name']));
  });

  it('render 중 들어온 selection 이벤트는 실패 rollback 뒤 FIFO 순서로 적용한다', async () => {
    const kit = createEditorTestKit();
    let rejectRender: ((error: Error) => void) | undefined;
    vi.mocked(kit.renderer.render).mockImplementationOnce(() => new Promise<void>((_resolve, reject) => {
      rejectRender = reject;
    }));
    kit.runtimeStore.getState().setSelectedElementIds(['title']);

    const adding = kit.editor.addText();
    await vi.waitFor(() => expect(kit.renderer.render).toHaveBeenCalledTimes(1));
    kit.emit({ type: 'selection:changed', elementIds: ['name'] });
    rejectRender?.(new Error('render failed'));

    await expect(adding).rejects.toThrow('render failed');
    await vi.waitFor(() => expect(kit.runtimeStore.getState().selectedElementIds).toEqual(['name']));
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

  it('renderer transform과 text 이벤트 실패는 rollback한 뒤 canvas 오류만 기록한다', async () => {
    const kit = createEditorTestKit();
    vi.mocked(kit.renderer.render).mockRejectedValueOnce(new Error('render failed'));

    kit.emit({
      type: 'element:transformed',
      elementId: 'title',
      before: { x: 130, y: 130, width: 820, height: 130, rotation: 0 },
      after: { x: 230, y: 150, width: 700, height: 120, rotation: 15 },
    });
    await vi.waitFor(() => expect(kit.runtimeStore.getState().canvasStatus).toBe('error'));
    expect(selectedElement(kit.designStore.getState().design, 'title')).toMatchObject({ x: 130 });

    kit.runtimeStore.getState().setCanvasStatus('ready');
    kit.onDocumentChange.mockImplementationOnce(() => { throw new Error('notification failed'); });
    kit.emit({ type: 'text:edited', elementId: 'title', before: '오늘은 제 생일이에요!', after: '바뀌면 안 됩니다' });
    await vi.waitFor(() => expect(kit.runtimeStore.getState().canvasStatus).toBe('error'));
    expect(selectedElement(kit.designStore.getState().design, 'title')).toMatchObject({ text: '오늘은 제 생일이에요!' });
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

  it('업로드·명령·render 실패 뒤 새 asset을 보상 제거한다', async () => {
    const kit = createEditorTestKit();
    vi.mocked(kit.renderer.render).mockRejectedValueOnce(new Error('render failed'));
    const file = new File(['image'], 'birthday.png', { type: 'image/png' });

    await expect(kit.editor.addImage(file)).rejects.toThrow('render failed');

    expect(kit.assetGateway.remove).toHaveBeenCalledWith('asset-uploaded');
    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toBeUndefined();
  });

  it('select 실패는 저장 알림 전에 문서·History를 복구하고 업로드 asset을 보상한다', async () => {
    const kit = createEditorTestKit();
    vi.mocked(kit.renderer.select).mockImplementationOnce(() => { throw new Error('select failed'); });
    const file = new File(['image'], 'birthday.png', { type: 'image/png' });

    await expect(kit.editor.addImage(file)).rejects.toThrow('select failed');

    expect(kit.onDocumentChange).not.toHaveBeenCalled();
    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toBeUndefined();
    expect(kit.assetGateway.remove).toHaveBeenCalledWith('asset-uploaded');
    await kit.editor.undo();
    expect(selectedElement(kit.designStore.getState().design, 'photo')).toBeDefined();
  });

  it('이미지 교체의 변경 콜백 실패도 새 asset만 보상 제거한다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['photo']);
    kit.onDocumentChange.mockImplementation(() => { throw new Error('notification failed'); });
    const file = new File(['image'], 'replacement.png', { type: 'image/png' });

    await expect(kit.editor.replaceSelectedImage(file)).rejects.toThrow('notification failed');

    expect(selectedElement(kit.designStore.getState().design, 'photo')).toMatchObject({
      assetId: 'builtin:birthday-photo',
    });
    expect(kit.assetGateway.remove).toHaveBeenCalledWith('asset-uploaded');
  });

  it('업로드부터 export까지 public 호출 순서를 하나의 큐로 보장한다', async () => {
    const kit = createEditorTestKit();
    let finishUpload: ((asset: { id: string; mimeType: string; width: number; height: number }) => void) | undefined;
    vi.mocked(kit.assetGateway.upload).mockImplementationOnce(() => new Promise((resolve) => {
      finishUpload = resolve;
    }));
    vi.mocked(kit.exporter.exportPng).mockImplementation(async (design) => new Blob([
      design.pages[0].elements.map((element) => element.id).join(','),
    ]));
    const file = new File(['image'], 'birthday.png', { type: 'image/png' });

    const adding = kit.editor.addImage(file);
    const exporting = kit.editor.exportPng();
    await vi.waitFor(() => expect(kit.assetGateway.upload).toHaveBeenCalledTimes(1));
    expect(kit.exporter.exportPng).not.toHaveBeenCalled();

    finishUpload?.({ id: 'asset-uploaded', mimeType: 'image/png', width: 640, height: 480 });
    await adding;

    expect(await (await exporting).text()).toContain('created-element');
  });

  it('dispose 중 성공한 업로드 asset을 보상 제거한다', async () => {
    const kit = createEditorTestKit();
    let finishUpload: ((asset: { id: string; mimeType: string; width: number; height: number }) => void) | undefined;
    vi.mocked(kit.assetGateway.upload).mockImplementationOnce(() => new Promise((resolve) => {
      finishUpload = resolve;
    }));
    const file = new File(['image'], 'birthday.png', { type: 'image/png' });

    const adding = kit.editor.addImage(file);
    await vi.waitFor(() => expect(kit.assetGateway.upload).toHaveBeenCalledTimes(1));
    kit.editor.dispose();
    finishUpload?.({ id: 'asset-uploaded', mimeType: 'image/png', width: 640, height: 480 });

    await expect(adding).rejects.toThrow('dispose');
    expect(kit.assetGateway.remove).toHaveBeenCalledWith('asset-uploaded');
  });

  it('render 대기 중 dispose되면 문서를 rollback하고 asset을 한 번만 보상한다', async () => {
    const kit = createEditorTestKit();
    let finishRender: (() => void) | undefined;
    vi.mocked(kit.renderer.render).mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishRender = resolve;
    }));
    const file = new File(['image'], 'birthday.png', { type: 'image/png' });

    const adding = kit.editor.addImage(file);
    await vi.waitFor(() => expect(kit.renderer.render).toHaveBeenCalledTimes(1));
    kit.editor.dispose();
    finishRender?.();

    await expect(adding).rejects.toThrow('dispose');
    expect(selectedElement(kit.designStore.getState().design, 'created-element')).toBeUndefined();
    expect(kit.onDocumentChange).not.toHaveBeenCalled();
    expect(kit.renderer.select).not.toHaveBeenCalled();
    expect(kit.assetGateway.remove).toHaveBeenCalledTimes(1);
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

  it('중복된 선택 ID를 한 번만 삭제해 undo 가능한 단일 변경으로 처리한다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title', 'title']);

    await kit.editor.deleteSelection();
    expect(selectedElement(kit.designStore.getState().design, 'title')).toBeUndefined();

    await kit.editor.undo();
    expect(selectedElement(kit.designStore.getState().design, 'title')).toBeDefined();
  });

  it('인접 다중 삭제는 selection 순서와 무관하게 undo·redo 레이어 순서를 보존한다', async () => {
    const kit = createEditorTestKit();
    const original = kit.designStore.getState().design.pages[0].elements.map((element) => element.id);
    kit.runtimeStore.getState().setSelectedElementIds(['title', 'photo']);

    await kit.editor.deleteSelection();
    await kit.editor.undo();
    expect(kit.designStore.getState().design.pages[0].elements.map((element) => element.id)).toEqual(original);

    await kit.editor.redo();
    expect(kit.designStore.getState().design.pages[0].elements.map((element) => element.id))
      .toEqual(original.filter((id) => id !== 'photo' && id !== 'title'));
  });

  it('비인접 다중 삭제도 undo·redo 레이어 순서를 보존한다', async () => {
    const kit = createEditorTestKit();
    const original = kit.designStore.getState().design.pages[0].elements.map((element) => element.id);
    kit.runtimeStore.getState().setSelectedElementIds(['bottom-decoration', 'photo']);

    await kit.editor.deleteSelection();
    await kit.editor.undo();
    expect(kit.designStore.getState().design.pages[0].elements.map((element) => element.id)).toEqual(original);

    await kit.editor.redo();
    expect(kit.designStore.getState().design.pages[0].elements.map((element) => element.id))
      .toEqual(original.filter((id) => id !== 'photo' && id !== 'bottom-decoration'));
  });

  it('두 번째 mount는 canvas와 무관하게 명확히 거부한다', async () => {
    const kit = createEditorTestKit();
    const first = document.createElement('canvas');
    const second = document.createElement('canvas');

    await kit.editor.mount(first);
    await expect(kit.editor.mount(second)).rejects.toThrow('이미 mount된 Editor입니다.');

    expect(kit.renderer.mount).toHaveBeenCalledTimes(1);
  });

  it.each(['render', 'select'] as const)(
    '초기 mount %s 실패 뒤에도 같은 Editor의 재-mount를 영구 거부한다',
    async (failurePoint) => {
      const kit = createEditorTestKit();
      if (failurePoint === 'render') {
        vi.mocked(kit.renderer.render).mockRejectedValueOnce(new Error('render failed'));
      } else {
        vi.mocked(kit.renderer.select).mockImplementationOnce(() => { throw new Error('select failed'); });
      }

      await expect(kit.editor.mount(document.createElement('canvas'))).rejects.toThrow();
      await expect(kit.editor.mount(document.createElement('canvas')))
        .rejects.toThrow('이미 mount된 Editor입니다.');

      expect(kit.renderer.mount).toHaveBeenCalledTimes(1);
    },
  );

  it('mount render 대기 중 dispose되면 ready 전환 없이 mount를 거부한다', async () => {
    const kit = createEditorTestKit();
    let finishRender: (() => void) | undefined;
    vi.mocked(kit.renderer.render).mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishRender = resolve;
    }));

    const mounting = kit.editor.mount(document.createElement('canvas'));
    await vi.waitFor(() => expect(kit.renderer.render).toHaveBeenCalledTimes(1));
    kit.editor.dispose();
    finishRender?.();

    await expect(mounting).rejects.toThrow('dispose');
    expect(kit.runtimeStore.getState().canvasStatus).not.toBe('ready');
    expect(kit.renderer.select).not.toHaveBeenCalled();
  });

  it('dispose는 renderer 구독을 해제하고 renderer를 정리한다', () => {
    const kit = createEditorTestKit();

    kit.editor.dispose();
    kit.emit({ type: 'selection:changed', elementIds: ['title'] });

    expect(kit.runtimeStore.getState().selectedElementIds).toEqual([]);
    expect(kit.renderer.dispose).toHaveBeenCalledTimes(1);

    kit.editor.dispose();
    expect(kit.renderer.dispose).toHaveBeenCalledTimes(1);
  });
});
