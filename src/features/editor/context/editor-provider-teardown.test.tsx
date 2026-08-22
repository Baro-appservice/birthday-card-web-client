import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

import { EditorProvider, type EditorAssembly, type EditorAssemblyFactory } from './editor-provider';

describe('EditorProvider teardown ordering', () => {
  it('진행 중 Editor mutation을 먼저 drain한 뒤 마지막 save를 flush하고 browser resource를 닫는다', async () => {
    const events: string[] = [];
    const kit = createEditorTestKit();
    let finishRender: (() => void) | undefined;

    vi.mocked(kit.renderer.render).mockImplementationOnce(() => new Promise<void>((resolve) => {
      finishRender = resolve;
    }));
    vi.mocked(kit.saveCoordinator.schedule).mockImplementation(() => {
      events.push('schedule');
    });
    vi.mocked(kit.assetGateway.garbageCollect!).mockImplementation(async () => {
      events.push('maintenance');
    });
    vi.mocked(kit.saveCoordinator.flush).mockImplementation(async () => {
      events.push('flush');
    });
    vi.mocked(kit.saveCoordinator.dispose).mockImplementation(() => {
      events.push('save.dispose');
    });
    vi.mocked(kit.renderer.dispose).mockImplementation(() => {
      events.push('renderer.dispose');
    });

    const assembly: EditorAssembly = {
      value: {
        editor: kit.editor,
        designStore: kit.designStore,
        runtimeStore: kit.runtimeStore,
        uiStore: kit.uiStore,
        repository: kit.repository,
        saveCoordinator: kit.saveCoordinator,
      },
      disposeAssetGateway: () => { events.push('asset.dispose'); },
      closeDatabase: () => { events.push('db.close'); },
    };
    const factory: EditorAssemblyFactory = vi.fn().mockResolvedValue(assembly);
    const view = render(
      <EditorProvider cardId="teardown-order" assemblyFactory={factory}>
        <span>ready</span>
      </EditorProvider>,
    );

    await waitFor(() => expect(view.getByText('ready')).toBeVisible());

    const mutation = kit.editor.addText();
    await waitFor(() => expect(kit.renderer.render).toHaveBeenCalledOnce());
    view.unmount();

    expect(events).not.toContain('flush');
    finishRender?.();
    await mutation;

    await waitFor(() => expect(events).toContain('db.close'));

    const index = (event: string) => events.indexOf(event);
    expect(index('schedule')).toBeGreaterThanOrEqual(0);
    expect(index('schedule')).toBeLessThan(index('maintenance'));
    expect(index('maintenance')).toBeLessThan(index('flush'));
    expect(index('flush')).toBeLessThan(index('save.dispose'));
    expect(index('save.dispose')).toBeLessThan(index('renderer.dispose'));
    expect(index('renderer.dispose')).toBeLessThan(index('asset.dispose'));
    expect(index('asset.dispose')).toBeLessThan(index('db.close'));
  });
});
