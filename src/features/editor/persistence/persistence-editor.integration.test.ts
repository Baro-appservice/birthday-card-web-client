import 'fake-indexeddb/auto';

import { designSchema, createSampleDesign } from '@/entities/design';
import { Editor } from '@/features/editor/core/editor';
import type {
  DesignExporter,
  EditorEvent,
  EditorRenderer,
} from '@/features/editor/core/ports';
import { createDesignStore } from '@/features/editor/model/design-store';
import { createEditorRuntimeStore } from '@/features/editor/model/editor-runtime-store';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrowserAssetGateway } from './browser/browser-asset-gateway';
import { openEditorDb } from './browser/editor-db';
import { IndexedDbDesignRepository } from './browser/indexeddb-design-repository';

async function closeAndDelete(db: IDBDatabase) {
  const name = db.name;
  db.close();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function createRenderer(): EditorRenderer {
  return {
    mount: vi.fn(),
    render: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(),
    subscribe: vi.fn((_listener: (event: EditorEvent) => void) => vi.fn()),
    dispose: vi.fn(),
  };
}

afterEach(() => vi.restoreAllMocks());

describe('persistence와 Editor 통합', () => {
  it('실제 업로드 크기로 만든 ImageElement는 crop 기본값과 함께 schema 검증·repository 저장을 통과한다', async () => {
    const db = await openEditorDb(`birthday-canvas-editor-${crypto.randomUUID()}`);
    const assetGateway = new BrowserAssetGateway(db, {
      decoder: async () => ({ width: 800, height: 600 }),
    });
    const repository = new IndexedDbDesignRepository(db);
    const designStore = createDesignStore(createSampleDesign());
    const runtimeStore = createEditorRuntimeStore();
    const exporter: DesignExporter = { exportPng: vi.fn() };
    const editor = new Editor({
      designStore,
      runtimeStore,
      renderer: createRenderer(),
      assetGateway,
      exporter,
      idGenerator: () => 'uploaded-photo',
      onDocumentChange: vi.fn(),
    });

    await editor.addImage(new File(['png'], 'birthday.png', { type: 'image/png' }));
    const saved = designStore.getState().design;
    const image = saved.pages[0].elements.find((element) => element.id === 'uploaded-photo');
    await repository.save('local-demo', saved);

    expect(image).toMatchObject({
      type: 'image',
      width: 640,
      height: 480,
      cropZoom: 1,
      cropFocusX: 0,
      cropFocusY: 0,
    });
    expect(designSchema.safeParse(saved).success).toBe(true);
    await expect(repository.load('local-demo')).resolves.toMatchObject({
      status: 'loaded',
      design: saved,
      needsSave: false,
      updatedAt: expect.any(Number),
    });

    editor.dispose();
    assetGateway.dispose();
    await closeAndDelete(db);
  });
});
