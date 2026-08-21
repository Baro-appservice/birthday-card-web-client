'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

import { createSampleDesign } from '@/entities/design';
import { Editor } from '@/features/editor/core/editor';
import { FabricDesignExporter, FabricEditorRenderer } from '@/features/editor/fabric';
import {
  BrowserAssetGateway,
  clearEmergencyDesign,
  IndexedDbDesignRepository,
  openEditorDb,
  SaveCoordinator,
  writeEmergencyDesign,
} from '@/features/editor/persistence';
import { createDesignStore } from '@/features/editor/model/design-store';
import { createEditorRuntimeStore } from '@/features/editor/model/editor-runtime-store';
import { createEditorUiStore } from '@/features/editor/model/editor-ui-store';

import { EditorContext, type EditorContextValue } from './editor-context';

export interface EditorAssembly {
  value: Omit<EditorContextValue, 'retryAssembly'>;
  disposeAssetGateway(): void;
  closeDatabase(): void;
}

export type EditorAssemblyFactory = (cardId: string) => Promise<EditorAssembly>;

interface ProviderValue {
  cardId: string;
  value: EditorContextValue;
}

interface InitializationError {
  cardId: string;
  message: string;
}

export async function createBrowserEditorAssembly(cardId: string): Promise<EditorAssembly> {
  const database = await openEditorDb();
  const designStore = createDesignStore(createSampleDesign());
  const runtimeStore = createEditorRuntimeStore();
  const uiStore = createEditorUiStore();
  const repository = new IndexedDbDesignRepository(database);
  const assetGateway = new BrowserAssetGateway(database);
  const saveCoordinator = new SaveCoordinator(cardId, repository, uiStore, {
    onLatestSaveSuccess: () => clearEmergencyDesign(cardId),
  });
  const renderer = new FabricEditorRenderer(assetGateway);
  const editor = new Editor({
    designStore,
    runtimeStore,
    renderer,
    assetGateway,
    exporter: new FabricDesignExporter(assetGateway),
    idGenerator: () => crypto.randomUUID(),
    onDocumentChange: (design) => {
      writeEmergencyDesign(cardId, design);
      saveCoordinator.schedule(design);
    },
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
    disposeAssetGateway: () => assetGateway.dispose(),
    closeDatabase: () => database.close(),
  };
}

const disposedAssemblies = new WeakSet<EditorAssembly>();

async function runCleanupStep(step: () => void | Promise<void>): Promise<void> {
  try {
    await step();
  } catch {
    // Continue so one faulty browser resource cannot leak later resources.
  }
}

async function disposeEditorAssembly(assembly: EditorAssembly): Promise<void> {
  if (disposedAssemblies.has(assembly)) return;
  disposedAssemblies.add(assembly);
  await runCleanupStep(() => assembly.value.saveCoordinator.flush());
  // Run GC while Design history and IndexedDB are still available. If the latest
  // save failed, the emergency snapshot and in-memory history remain protected.
  await runCleanupStep(() => assembly.value.editor.flushMaintenance());
  await runCleanupStep(() => assembly.value.saveCoordinator.dispose());
  // Await Fabric Canvas.dispose() before revoking asset URLs and closing IndexedDB.
  await runCleanupStep(() => assembly.value.editor.close());
  await runCleanupStep(() => assembly.disposeAssetGateway());
  await runCleanupStep(() => assembly.closeDatabase());
}

export function EditorProvider({
  cardId,
  children,
  assemblyFactory = createBrowserEditorAssembly,
  renderInitializationError,
}: {
  cardId: string;
  children: ReactNode;
  assemblyFactory?: EditorAssemblyFactory;
  renderInitializationError?(options: { message: string; retry(): void }): ReactNode;
}) {
  const releaseRef = useRef<Promise<void>>(Promise.resolve());
  const [providerValue, setProviderValue] = useState<ProviderValue | null>(null);
  const [initializationError, setInitializationError] = useState<InitializationError | null>(null);
  const [attempt, setAttempt] = useState(0);
  const retryAssembly = useCallback(() => {
    setProviderValue(null);
    setInitializationError(null);
    setAttempt((current) => current + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let ownedAssembly: EditorAssembly | null = null;
    const releasePrevious = releaseRef.current;

    const setup = releasePrevious
      .then(() => assemblyFactory(cardId))
      .then(async (assembly) => {
        if (cancelled) {
          await disposeEditorAssembly(assembly);
          return;
        }
        ownedAssembly = assembly;
        setProviderValue({
          cardId,
          value: { ...assembly.value, retryAssembly },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setInitializationError({ cardId, message: '편집기 저장소를 준비하지 못했습니다.' });
        }
      });

    return () => {
      cancelled = true;
      releaseRef.current = ownedAssembly ? disposeEditorAssembly(ownedAssembly) : setup;
    };
  }, [assemblyFactory, attempt, cardId, retryAssembly]);

  if (initializationError?.cardId === cardId) {
    if (renderInitializationError) {
      return renderInitializationError({
        message: initializationError.message,
        retry: retryAssembly,
      });
    }
    return (
      <section role="alert">
        <p>{initializationError.message}</p>
        <button type="button" autoFocus onClick={retryAssembly}>다시 시도</button>
      </section>
    );
  }
  if (providerValue?.cardId !== cardId) return <p role="status">편집기를 준비하고 있습니다.</p>;

  return <EditorContext.Provider value={providerValue.value}>{children}</EditorContext.Provider>;
}
