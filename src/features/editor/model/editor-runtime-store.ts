import { createStore, type StoreApi } from 'zustand/vanilla';

export type CanvasStatus = 'idle' | 'ready' | 'error';

export interface EditorRuntimeState {
  selectedElementIds: string[];
  activePageId: string;
  zoom: number;
  isInteracting: boolean;
  canvasStatus: CanvasStatus;
  setSelectedElementIds(elementIds: string[]): void;
  setActivePageId(pageId: string): void;
  setZoom(zoom: number): void;
  setIsInteracting(isInteracting: boolean): void;
  setCanvasStatus(canvasStatus: CanvasStatus): void;
}

export type EditorRuntimeStore = StoreApi<EditorRuntimeState>;

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 2;

function clampZoom(zoom: number, currentZoom: number): number {
  if (Number.isNaN(zoom)) return currentZoom;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

export function createEditorRuntimeStore(): EditorRuntimeStore {
  return createStore<EditorRuntimeState>((set) => ({
    selectedElementIds: [],
    activePageId: 'page-1',
    zoom: 1,
    isInteracting: false,
    canvasStatus: 'idle',
    setSelectedElementIds: (selectedElementIds) => set({ selectedElementIds }),
    setActivePageId: (activePageId) => set({ activePageId }),
    setZoom: (zoom) => set((state) => ({ zoom: clampZoom(zoom, state.zoom) })),
    setIsInteracting: (isInteracting) => set({ isInteracting }),
    setCanvasStatus: (canvasStatus) => set({ canvasStatus }),
  }));
}
