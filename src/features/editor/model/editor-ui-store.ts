import type { Design } from '@/entities/design';
import { createStore, type StoreApi } from 'zustand/vanilla';

export type SaveStatus = 'saving' | 'saved' | 'error';
export type EditorPanel = 'text' | 'image' | 'shape' | 'layers' | null;

export interface RecoveryNotice {
  reason: 'corrupt' | 'unsupported-version';
  backup: Design | null;
}

export interface EditorUiState {
  activePanel: EditorPanel;
  mobileSheet: EditorPanel;
  saveStatus: SaveStatus;
  error: string | null;
  recoveryNotice: RecoveryNotice | null;
  setActivePanel(panel: EditorPanel): void;
  setMobileSheet(panel: EditorPanel): void;
  setSaveStatus(saveStatus: SaveStatus): void;
  setError(error: string | null): void;
  setRecoveryNotice(recoveryNotice: RecoveryNotice | null): void;
}

export type EditorUiStore = StoreApi<EditorUiState>;

export function createEditorUiStore(): EditorUiStore {
  return createStore<EditorUiState>((set) => ({
    activePanel: null,
    mobileSheet: null,
    saveStatus: 'saved',
    error: null,
    recoveryNotice: null,
    setActivePanel: (activePanel) => set({ activePanel }),
    setMobileSheet: (mobileSheet) => set({ mobileSheet }),
    setSaveStatus: (saveStatus) => set({ saveStatus }),
    setError: (error) => set({ error }),
    setRecoveryNotice: (recoveryNotice) => set({ recoveryNotice }),
  }));
}
