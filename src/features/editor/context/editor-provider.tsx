'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { createSampleDesign } from '@/entities/design';
import { Editor } from '@/features/editor/core/editor';
import { FabricDesignExporter, FabricEditorRenderer } from '@/features/editor/fabric';
import {
  BrowserAssetGateway,
  IndexedDbDesignRepository,
  openEditorDb,
  SaveCoordinator,
} from '@/features/editor/persistence';
import { createDesignStore } from '@/features/editor/model/design-store';
import { createEditorRuntimeStore } from '@/features/editor/model/editor-runtime-store';
import { createEditorUiStore } from '@/features/editor/model/editor-ui-store';

import { EditorContext, type EditorContextValue } from './editor-context';

interface EditorAssembly {
  value: EditorContextValue;
  assetGateway: BrowserAssetGateway;
  database: IDBDatabase;
  disposed: boolean;
}

interface ProviderValue {
  cardId: string;
  value: EditorContextValue;
}

interface InitializationError {
  cardId: string;
  message: string;
}

function createEditorAssembly(cardId: string, database: IDBDatabase): EditorAssembly {
  const designStore = createDesignStore(createSampleDesign());
  const runtimeStore = createEditorRuntimeStore();
  const uiStore = createEditorUiStore();
  const repository = new IndexedDbDesignRepository(database);
  const assetGateway = new BrowserAssetGateway(database);
  const saveCoordinator = new SaveCoordinator(cardId, repository, uiStore);
  const renderer = new FabricEditorRenderer(assetGateway);
  const editor = new Editor({
    designStore,
    runtimeStore,
    renderer,
    assetGateway,
    exporter: new FabricDesignExporter(assetGateway),
    idGenerator: () => crypto.randomUUID(),
    onDocumentChange: (design) => saveCoordinator.schedule(design),
  });

  return {
    value: {
      editor,
      designStore,
      runtimeStore,
      uiStore,
      repository,
      saveCoordinator,
    },
    assetGateway,
    database,
    disposed: false,
  };
}

function disposeEditorAssembly(assembly: EditorAssembly): void {
  if (assembly.disposed) return;
  assembly.disposed = true;
  void assembly.value.saveCoordinator.flush()
    .catch(() => undefined)
    .finally(() => {
      assembly.value.saveCoordinator.dispose();
      assembly.value.editor.dispose();
      assembly.assetGateway.dispose();
      assembly.database.close();
    });
}

export function EditorProvider({ cardId, children }: { cardId: string; children: ReactNode }) {
  const assemblyRef = useRef<EditorAssembly | null>(null);
  const [providerValue, setProviderValue] = useState<ProviderValue | null>(null);
  const [initializationError, setInitializationError] = useState<InitializationError | null>(null);

  useEffect(() => {
    let cancelled = false;

    void openEditorDb()
      .then((database) => {
        if (cancelled) {
          database.close();
          return;
        }
        const assembly = createEditorAssembly(cardId, database);
        if (cancelled) {
          disposeEditorAssembly(assembly);
          return;
        }
        assemblyRef.current = assembly;
        setProviderValue({ cardId, value: assembly.value });
      })
      .catch(() => {
        if (!cancelled) {
          setInitializationError({ cardId, message: '편집기 저장소를 준비하지 못했습니다.' });
        }
      });

    return () => {
      cancelled = true;
      const assembly = assemblyRef.current;
      assemblyRef.current = null;
      if (assembly) disposeEditorAssembly(assembly);
    };
  }, [cardId]);

  if (initializationError?.cardId === cardId) {
    return <p role="alert">{initializationError.message}</p>;
  }
  if (providerValue?.cardId !== cardId) return <p role="status">편집기를 준비하고 있습니다.</p>;

  return <EditorContext.Provider value={providerValue.value}>{children}</EditorContext.Provider>;
}
