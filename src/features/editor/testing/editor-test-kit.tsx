import type { ReactNode } from 'react';
import { vi } from 'vitest';

import { createSampleDesign, type Design } from '@/entities/design';
import { Editor } from '@/features/editor/core/editor';
import type {
  AssetGateway,
  DesignExporter,
  DesignLoadResult,
  DesignRepository,
  EditorRenderer,
} from '@/features/editor/core/ports';
import { createDesignStore } from '@/features/editor/model/design-store';
import { createEditorRuntimeStore } from '@/features/editor/model/editor-runtime-store';
import { createEditorUiStore } from '@/features/editor/model/editor-ui-store';

import { EditorContext, type EditorContextValue } from '../context/editor-context';

function createMockSaveCoordinator() {
  return {
    schedule: vi.fn<(design: Design) => void>(),
    flush: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    retry: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
    dispose: vi.fn<() => void>(),
  };
}

export function createEditorTestKit(options: {
  loadResult?: DesignLoadResult;
  editor?: Editor;
} = {}) {
  const designStore = createDesignStore(createSampleDesign());
  const runtimeStore = createEditorRuntimeStore();
  const uiStore = createEditorUiStore();
  const repository: DesignRepository = {
    load: vi.fn().mockResolvedValue(options.loadResult ?? {
      status: 'loaded',
      design: createSampleDesign(),
    }),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const renderer: EditorRenderer = {
    mount: vi.fn(),
    render: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => undefined),
    dispose: vi.fn(),
  };
  const assetGateway: AssetGateway = {
    upload: vi.fn(),
    resolveUrl: vi.fn().mockResolvedValue('/assets/birthday-placeholder.svg'),
    remove: vi.fn().mockResolvedValue(undefined),
    garbageCollect: vi.fn().mockResolvedValue(undefined),
  };
  const exporter: DesignExporter = {
    exportPng: vi.fn().mockResolvedValue(new Blob([], { type: 'image/png' })),
  };
  const saveCoordinator = createMockSaveCoordinator();
  const editor = options.editor ?? new Editor({
    designStore,
    runtimeStore,
    renderer,
    assetGateway,
    exporter,
    idGenerator: () => 'test-element-id',
    onDocumentChange: (design) => saveCoordinator.schedule(design),
  });
  const value: EditorContextValue = {
    editor,
    designStore,
    runtimeStore,
    uiStore,
    repository,
    saveCoordinator,
    retryAssembly: vi.fn(),
  };
  const wrapper = ({ children }: { children: ReactNode }) => (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );

  return {
    ...value,
    assetGateway,
    renderer,
    wrapper,
  };
}
