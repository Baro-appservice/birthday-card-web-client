import { fireEvent, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

import { ContextualToolbar } from './contextual-toolbar';

function selectedElement(kit: ReturnType<typeof createEditorTestKit>) {
  const selectedId = kit.runtimeStore.getState().selectedElementIds[0];
  return kit.designStore.getState().design.pages[0].elements
    .find((element) => element.id === selectedId);
}

describe('CommonElementControls', () => {
  it('회전과 투명도를 공통 속성으로 편집하고 같은 slider interaction을 Undo 한 단계로 합친다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    const view = render(<ContextualToolbar />, { wrapper: kit.wrapper });

    const rotation = view.getByRole('spinbutton', { name: '회전 각도' });
    fireEvent.change(rotation, { target: { value: '45' } });
    fireEvent.blur(rotation);
    await waitFor(() => expect(selectedElement(kit)).toMatchObject({ rotation: 45 }));

    const opacity = view.getByRole('slider', { name: '투명도' });
    fireEvent.focus(opacity);
    fireEvent.change(opacity, { target: { value: '80' } });
    fireEvent.change(opacity, { target: { value: '60' } });
    await waitFor(() => expect(selectedElement(kit)).toMatchObject({ opacity: 0.6 }));
    fireEvent.blur(opacity);

    await kit.editor.undo();
    expect(selectedElement(kit)).toMatchObject({ opacity: 1, rotation: 45 });
  });

  it('사진 crop slider를 history로 묶고 위치 초기화를 제공한다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['photo']);
    const view = render(<ContextualToolbar />, { wrapper: kit.wrapper });

    const zoom = view.getByRole('slider', { name: '사진 확대' });
    fireEvent.focus(zoom);
    fireEvent.change(zoom, { target: { value: '160' } });
    fireEvent.change(zoom, { target: { value: '220' } });
    fireEvent.blur(zoom);

    const horizontal = view.getByRole('slider', { name: '사진 가로 위치' });
    fireEvent.change(horizontal, { target: { value: '70' } });
    fireEvent.blur(horizontal);

    await waitFor(() => expect(selectedElement(kit)).toMatchObject({
      cropZoom: 2.2,
      cropFocusX: 0.7,
      cropFocusY: 0,
    }));

    await kit.editor.undo();
    expect(selectedElement(kit)).toMatchObject({ cropZoom: 2.2, cropFocusX: 0, cropFocusY: 0 });
    await kit.editor.undo();
    expect(selectedElement(kit)).toMatchObject({ cropZoom: 1, cropFocusX: 0, cropFocusY: 0 });

    fireEvent.change(zoom, { target: { value: '180' } });
    fireEvent.blur(zoom);
    await waitFor(() => expect(selectedElement(kit)).toMatchObject({ cropZoom: 1.8 }));
    fireEvent.click(view.getByRole('button', { name: '사진 위치 초기화' }));
    await waitFor(() => expect(selectedElement(kit)).toMatchObject({
      cropZoom: 1,
      cropFocusX: 0,
      cropFocusY: 0,
    }));
  });

  it('실제 renderer bounds를 사용한 캔버스 정렬과 복제 액션을 노출한다', async () => {
    const kit = createEditorTestKit();
    kit.runtimeStore.getState().setSelectedElementIds(['title']);
    kit.renderer.measureElement = vi.fn().mockReturnValue({
      left: 200,
      top: 200,
      width: 300,
      height: 120,
    });
    const view = render(<ContextualToolbar variant="property" />, { wrapper: kit.wrapper });

    fireEvent.click(view.getByRole('button', { name: '캔버스 가로 중앙에 맞춤' }));
    await waitFor(() => expect(selectedElement(kit)).toMatchObject({ id: 'title', x: 320 }));

    fireEvent.click(view.getByRole('button', { name: '복제' }));
    await waitFor(() => expect(selectedElement(kit)).toMatchObject({ id: 'test-element-id' }));

    expect(view.getByRole('button', { name: '맨앞' })).toBeInTheDocument();
    expect(view.getByRole('button', { name: '맨뒤' })).toBeInTheDocument();
  });
});
