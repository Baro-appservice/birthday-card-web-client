import { createContext } from 'react';

import type { Editor } from '@/features/editor/core/editor';
import type { DesignRepository } from '@/features/editor/core/ports';
import type { DesignStore } from '@/features/editor/model/design-store';
import type { EditorRuntimeStore } from '@/features/editor/model/editor-runtime-store';
import type { EditorUiStore } from '@/features/editor/model/editor-ui-store';
import type { SaveCoordinator } from '@/features/editor/persistence';

export interface EditorContextValue {
  editor: Editor;
  designStore: DesignStore;
  runtimeStore: EditorRuntimeStore;
  uiStore: EditorUiStore;
  repository: DesignRepository;
  saveCoordinator: Pick<SaveCoordinator, 'schedule' | 'flush' | 'retry' | 'dispose'>;
  retryAssembly(): void;
}

export const EditorContext = createContext<EditorContextValue | null>(null);
