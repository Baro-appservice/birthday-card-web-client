import {
  createSampleDesign,
  type DesignElement,
} from '@/entities/design';
import { describe, expect, it } from 'vitest';

import { createDesignStore } from './design-store';
import { createEditorRuntimeStore } from './editor-runtime-store';
import { createEditorUiStore } from './editor-ui-store';

const createShape = (id: string): DesignElement => ({
  id,
  type: 'shape',
  x: 10,
  y: 20,
  width: 30,
  height: 40,
  rotation: 0,
  opacity: 1,
  shape: 'rectangle',
  fill: '#ffffff',
});

describe('Design Store', () => {
  it('Design Store 변경은 Runtime과 UI Store를 건드리지 않는다', () => {
    const designStore = createDesignStore(createSampleDesign());
    const runtimeStore = createEditorRuntimeStore();
    const uiStore = createEditorUiStore();

    designStore.getState().setBackground('#ffffff');

    expect(designStore.getState().design.pages[0].background).toBe('#ffffff');
    expect(runtimeStore.getState().selectedElementIds).toEqual([]);
    expect(uiStore.getState().saveStatus).toBe('saved');
  });

  it('페이지의 요소를 Domain 연산으로 갱신한다', () => {
    const store = createDesignStore(createSampleDesign());
    const replacement = createShape('title');

    store.getState().addElement('page-1', createShape('new-shape'));
    store.getState().replaceElement('page-1', 'title', replacement);
    store.getState().moveElement('page-1', 'new-shape', 0);
    store.getState().removeElement('page-1', 'photo');

    const page = store.getState().design.pages[0];
    expect(page.elements[0].id).toBe('new-shape');
    expect(page.elements.find((element) => element.id === 'title')).toEqual(replacement);
    expect(page.elements.some((element) => element.id === 'photo')).toBe(false);
  });

  it('문서 전체를 교체한다', () => {
    const store = createDesignStore(createSampleDesign());
    const replacement = {
      ...createSampleDesign(),
      pages: [{ ...createSampleDesign().pages[0], background: '#112233' }],
    };

    store.getState().replaceDesign(replacement);

    expect(store.getState().design).toBe(replacement);
  });
});

describe('Editor Runtime Store', () => {
  it('선택, 활성 페이지, 상호작용, 캔버스 상태의 기본값과 변경을 제공한다', () => {
    const store = createEditorRuntimeStore();

    expect(store.getState()).toMatchObject({
      selectedElementIds: [],
      activePageId: 'page-1',
      zoom: 1,
      isInteracting: false,
      canvasStatus: 'idle',
    });

    store.getState().setSelectedElementIds(['title']);
    store.getState().setActivePageId('page-2');
    store.getState().setIsInteracting(true);
    store.getState().setCanvasStatus('ready');

    expect(store.getState()).toMatchObject({
      selectedElementIds: ['title'],
      activePageId: 'page-2',
      isInteracting: true,
      canvasStatus: 'ready',
    });
  });

  it('zoom은 25%와 200% 사이로 제한한다', () => {
    const store = createEditorRuntimeStore();

    store.getState().setZoom(3);
    expect(store.getState().zoom).toBe(2);

    store.getState().setZoom(0.1);
    expect(store.getState().zoom).toBe(0.25);
  });
});

describe('Editor UI Store', () => {
  it('패널, 모바일 시트, 저장 상태, 오류와 복구 안내를 독립적으로 관리한다', () => {
    const store = createEditorUiStore();
    const recoveryNotice = {
      reason: 'corrupt' as const,
      backup: createSampleDesign(),
    };

    expect(store.getState()).toMatchObject({
      activePanel: null,
      mobileSheet: null,
      saveStatus: 'saved',
      error: null,
      recoveryNotice: null,
    });

    store.getState().setActivePanel('layers');
    store.getState().setMobileSheet('text');
    store.getState().setSaveStatus('saving');
    store.getState().setError('저장에 실패했습니다.');
    store.getState().setRecoveryNotice(recoveryNotice);

    expect(store.getState()).toMatchObject({
      activePanel: 'layers',
      mobileSheet: 'text',
      saveStatus: 'saving',
      error: '저장에 실패했습니다.',
      recoveryNotice,
    });
  });
});
