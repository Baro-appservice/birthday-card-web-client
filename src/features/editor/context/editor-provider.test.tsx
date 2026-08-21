import { render, waitFor } from '@testing-library/react';
import { StrictMode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createSampleDesign } from '@/entities/design';
import { Editor } from '@/features/editor/core/editor';
import type {
  AssetGateway,
  DesignExporter,
  DesignRepository,
  EditorRenderer,
} from '@/features/editor/core/ports';
import { createDesignStore } from '@/features/editor/model/design-store';
import { createEditorRuntimeStore } from '@/features/editor/model/editor-runtime-store';
import { createEditorUiStore } from '@/features/editor/model/editor-ui-store';
import { EditorCanvas } from '@/widgets/editor/canvas/editor-canvas';

import {
  EditorProvider,
  type EditorAssembly,
  type EditorAssemblyFactory,
} from './editor-provider';

interface AssemblyRecord {
  assembly: EditorAssembly;
  renderer: EditorRenderer;
  runtimeStore: ReturnType<typeof createEditorRuntimeStore>;
}

interface FailureOptions {
  flushRejects?: boolean;
  saveDisposeThrows?: boolean;
  assetDisposeThrows?: boolean;
  mountThrows?: boolean;
}

function createAssemblyRecord(
  label: string,
  events: string[],
  options: FailureOptions = {},
): AssemblyRecord {
  const designStore = createDesignStore(createSampleDesign());
  const runtimeStore = createEditorRuntimeStore();
  const uiStore = createEditorUiStore();
  const repository: DesignRepository = {
    load: vi.fn(),
    save: vi.fn(),
  };
  const renderer: EditorRenderer = {
    mount: vi.fn(() => {
      if (options.mountThrows) throw new Error(`${label} mount failed`);
    }),
    render: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => undefined),
    dispose: vi.fn(() => { events.push(`${label}:renderer.dispose`); }),
  };
  const assetGateway: AssetGateway = {
    upload: vi.fn(),
    resolveUrl: vi.fn(),
    remove: vi.fn(),
  };
  const exporter: DesignExporter = { exportPng: vi.fn() };
  const saveCoordinator = {
    schedule: vi.fn(),
    flush: vi.fn(() => {
      events.push(`${label}:flush`);
      return options.flushRejects ? Promise.reject(new Error('flush failed')) : Promise.resolve();
    }),
    retry: vi.fn().mockResolvedValue(undefined),
    dispose: vi.fn(() => {
      events.push(`${label}:saveCoordinator.dispose`);
      if (options.saveDisposeThrows) throw new Error('save dispose failed');
    }),
  };
  const editor = new Editor({
    designStore,
    runtimeStore,
    renderer,
    assetGateway,
    exporter,
    idGenerator: () => `${label}-element`,
    onDocumentChange: (design) => saveCoordinator.schedule(design),
  });

  return {
    assembly: {
      value: { editor, designStore, runtimeStore, uiStore, repository, saveCoordinator },
      disposeAssetGateway: () => {
        events.push(`${label}:assetGateway.dispose`);
        if (options.assetDisposeThrows) throw new Error('asset dispose failed');
      },
      closeDatabase: () => { events.push(`${label}:db.close`); },
    },
    renderer,
    runtimeStore,
  };
}

describe('EditorProvider', () => {
  it('StrictMode setup replay에서도 활성 assembly를 한 번만 canvas에 mount하고 각 assembly를 한 번만 정리한다', async () => {
    const events: string[] = [];
    const records: AssemblyRecord[] = [];
    const factory: EditorAssemblyFactory = vi.fn(async (cardId) => {
      const record = createAssemblyRecord(`${cardId}-${records.length}`, events);
      records.push(record);
      return record.assembly;
    });
    const view = render(
      <StrictMode>
        <EditorProvider cardId="local-demo" assemblyFactory={factory}>
          <EditorCanvas />
        </EditorProvider>
      </StrictMode>,
    );

    await waitFor(() => expect(records.reduce(
      (count, record) => count + (record.renderer.mount as ReturnType<typeof vi.fn>).mock.calls.length,
      0,
    )).toBe(1));
    view.unmount();

    await waitFor(() => {
      for (const record of records) expect(record.renderer.dispose).toHaveBeenCalledOnce();
    });
  });

  it('cardId가 바뀌면 기존 assembly를 정리한 뒤 새 Editor가 새 canvas를 mount한다', async () => {
    const events: string[] = [];
    const records = new Map<string, AssemblyRecord>();
    const factory: EditorAssemblyFactory = vi.fn(async (cardId) => {
      const record = createAssemblyRecord(cardId, events);
      records.set(cardId, record);
      return record.assembly;
    });
    const view = render(
      <EditorProvider cardId="first" assemblyFactory={factory}>
        <EditorCanvas />
      </EditorProvider>,
    );

    await waitFor(() => expect(records.get('first')?.renderer.mount).toHaveBeenCalledOnce());
    view.rerender(
      <EditorProvider cardId="second" assemblyFactory={factory}>
        <EditorCanvas />
      </EditorProvider>,
    );

    await waitFor(() => expect(records.get('second')?.renderer.mount).toHaveBeenCalledOnce());
    expect(records.get('first')?.renderer.dispose).toHaveBeenCalledOnce();
    expect(events.indexOf('first:renderer.dispose')).toBeLessThan(
      events.indexOf('second:renderer.dispose') === -1 ? Infinity : events.indexOf('second:renderer.dispose'),
    );
    view.unmount();
  });

  it('같은 cardId의 ordinary rerender는 준비된 canvas를 다시 mount하지 않는다', async () => {
    const events: string[] = [];
    const record = createAssemblyRecord('stable', events);
    const factory: EditorAssemblyFactory = vi.fn().mockResolvedValue(record.assembly);
    const view = render(
      <EditorProvider cardId="stable" assemblyFactory={factory}>
        <EditorCanvas />
      </EditorProvider>,
    );

    await waitFor(() => expect(record.renderer.mount).toHaveBeenCalledOnce());
    view.rerender(
      <EditorProvider cardId="stable" assemblyFactory={factory}>
        <EditorCanvas />
      </EditorProvider>,
    );

    expect(record.renderer.mount).toHaveBeenCalledOnce();
    view.unmount();
  });

  it('setup이 취소된 뒤 늦게 완성된 assembly도 정확히 한 번 정리한다', async () => {
    const events: string[] = [];
    const record = createAssemblyRecord('cancelled', events);
    let resolveAssembly: ((assembly: EditorAssembly) => void) | undefined;
    const factory: EditorAssemblyFactory = vi.fn(() => new Promise<EditorAssembly>((resolve) => {
      resolveAssembly = resolve;
    }));
    const view = render(
      <EditorProvider cardId="cancelled" assemblyFactory={factory}>
        <EditorCanvas />
      </EditorProvider>,
    );

    await waitFor(() => expect(factory).toHaveBeenCalledOnce());
    view.unmount();
    resolveAssembly?.(record.assembly);

    await waitFor(() => expect(record.renderer.dispose).toHaveBeenCalledOnce());
    expect(events).toEqual([
      'cancelled:flush',
      'cancelled:saveCoordinator.dispose',
      'cancelled:renderer.dispose',
      'cancelled:assetGateway.dispose',
      'cancelled:db.close',
    ]);
  });

  it('cleanup 단계가 실패해도 정해진 순서로 이후 resource까지 모두 정리한다', async () => {
    const events: string[] = [];
    const record = createAssemblyRecord('failure', events, {
      flushRejects: true,
      saveDisposeThrows: true,
      assetDisposeThrows: true,
    });
    const factory: EditorAssemblyFactory = vi.fn().mockResolvedValue(record.assembly);
    const view = render(
      <EditorProvider cardId="failure" assemblyFactory={factory}>
        <EditorCanvas />
      </EditorProvider>,
    );

    await waitFor(() => expect(record.renderer.mount).toHaveBeenCalledOnce());
    view.unmount();

    await waitFor(() => expect(events).toEqual([
      'failure:flush',
      'failure:saveCoordinator.dispose',
      'failure:renderer.dispose',
      'failure:assetGateway.dispose',
      'failure:db.close',
    ]));
  });

  it('factory setup 실패를 alert로 표시하고 canvas mount 실패는 runtime과 UI error로 표시한다', async () => {
    const failedFactory: EditorAssemblyFactory = vi.fn().mockRejectedValue(new Error('db failed'));
    const failedView = render(
      <EditorProvider cardId="failed" assemblyFactory={failedFactory}>
        <EditorCanvas />
      </EditorProvider>,
    );

    await waitFor(() => expect(failedView.getByRole('alert')).toHaveTextContent('편집기 저장소'));
    failedView.unmount();

    const events: string[] = [];
    const record = createAssemblyRecord('mount-error', events, { mountThrows: true });
    const factory: EditorAssemblyFactory = vi.fn().mockResolvedValue(record.assembly);
    const view = render(
      <EditorProvider cardId="mount-error" assemblyFactory={factory}>
        <EditorCanvas />
      </EditorProvider>,
    );

    await waitFor(() => expect(record.runtimeStore.getState().canvasStatus).toBe('error'));
    expect(record.assembly.value.uiStore.getState().error).toBe('mount-error mount failed');
    view.unmount();
  });

  it('같은 Provider 안에서 canvas가 다시 mount되면 Editor 거부 원인을 runtime과 UI에 남긴다', async () => {
    const events: string[] = [];
    const record = createAssemblyRecord('second-mount', events);
    const factory: EditorAssemblyFactory = vi.fn().mockResolvedValue(record.assembly);
    const view = render(
      <EditorProvider cardId="second-mount" assemblyFactory={factory}>
        <EditorCanvas />
      </EditorProvider>,
    );

    await waitFor(() => expect(record.renderer.mount).toHaveBeenCalledOnce());
    view.rerender(
      <EditorProvider cardId="second-mount" assemblyFactory={factory}>
        <span>canvas removed</span>
      </EditorProvider>,
    );
    view.rerender(
      <EditorProvider cardId="second-mount" assemblyFactory={factory}>
        <EditorCanvas />
      </EditorProvider>,
    );

    await waitFor(() => expect(record.runtimeStore.getState().canvasStatus).toBe('error'));
    expect(record.assembly.value.uiStore.getState().error).toBe('이미 mount된 Editor입니다.');
    view.unmount();
  });
});
