import {
  addElement,
  moveElement,
  removeElement,
  replaceElement,
  setPageBackground,
  type Design,
  type DesignElement,
  type DesignPage,
} from '@/entities/design';
import { createStore, type StoreApi } from 'zustand/vanilla';

export interface DesignState {
  design: Design;
  replaceDesign(design: Design): void;
  addElement(pageId: string, element: DesignElement): void;
  replaceElement(pageId: string, elementId: string, replacement: DesignElement): void;
  removeElement(pageId: string, elementId: string): void;
  moveElement(pageId: string, elementId: string, targetIndex: number): void;
  setBackground(background: string, pageId?: string): void;
}

export type DesignStore = StoreApi<DesignState>;

function replacePage(
  design: Design,
  pageId: string,
  updatePage: (page: DesignPage) => DesignPage,
): Design {
  const pageIndex = design.pages.findIndex((page) => page.id === pageId);
  if (pageIndex < 0) throw new Error(`존재하지 않는 페이지입니다: ${pageId}`);

  const pages = design.pages.slice();
  pages[pageIndex] = updatePage(design.pages[pageIndex]);
  return { ...design, pages };
}

export function createDesignStore(initialDesign: Design): DesignStore {
  return createStore<DesignState>((set) => ({
    design: initialDesign,
    replaceDesign: (design) => set({ design }),
    addElement: (pageId, element) => set((state) => ({
      design: replacePage(state.design, pageId, (page) => addElement(page, element)),
    })),
    replaceElement: (pageId, elementId, replacement) => set((state) => ({
      design: replacePage(state.design, pageId, (page) =>
        replaceElement(page, elementId, replacement)),
    })),
    removeElement: (pageId, elementId) => set((state) => ({
      design: replacePage(state.design, pageId, (page) => removeElement(page, elementId)),
    })),
    moveElement: (pageId, elementId, targetIndex) => set((state) => ({
      design: replacePage(state.design, pageId, (page) =>
        moveElement(page, elementId, targetIndex)),
    })),
    setBackground: (background, pageId) => set((state) => {
      const targetPageId = pageId ?? state.design.pages[0]?.id;
      if (!targetPageId) throw new Error('배경을 변경할 페이지가 없습니다.');
      return {
        design: replacePage(state.design, targetPageId, (page) =>
          setPageBackground(page, background)),
      };
    }),
  }));
}
