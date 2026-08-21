import { useContext } from 'react';
import { useStore } from 'zustand';

import type { DesignState } from '@/features/editor/model/design-store';
import type { EditorRuntimeState } from '@/features/editor/model/editor-runtime-store';
import type { EditorUiState } from '@/features/editor/model/editor-ui-store';

import { EditorContext } from '../context/editor-context';

function useEditorContext() {
  const value = useContext(EditorContext);
  if (!value) throw new Error('EditorProvider 내부에서만 Editor를 사용할 수 있습니다.');
  return value;
}

export function useEditor() {
  return useEditorContext().editor;
}

export function useEditorSaveCoordinator() {
  return useEditorContext().saveCoordinator;
}

export function useEditorAssemblyRetry() {
  return useEditorContext().retryAssembly;
}

export function useDesignStore<T>(selector: (state: DesignState) => T): T {
  return useStore(useEditorContext().designStore, selector);
}

export function useEditorRuntimeStore<T>(selector: (state: EditorRuntimeState) => T): T {
  return useStore(useEditorContext().runtimeStore, selector);
}

export function useEditorUiStore<T>(selector: (state: EditorUiState) => T): T {
  return useStore(useEditorContext().uiStore, selector);
}
