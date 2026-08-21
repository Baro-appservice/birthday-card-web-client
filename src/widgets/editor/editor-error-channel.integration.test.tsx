import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { createSampleDesign } from '@/entities/design';
import { EditorContext } from '@/features/editor/context/editor-context';
import type { DesignRepository } from '@/features/editor/core/ports';
import { SaveCoordinator } from '@/features/editor/persistence/save-coordinator';
import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';
import { Toast } from '@/shared/ui/toast';

import { EditorTopbar } from './toolbar/editor-topbar';

describe('editor error channels', () => {
  it('delayed save 성공은 export 오류를 지우지 않고 성공 export는 operation 오류만 지운다', async () => {
    const user = userEvent.setup();
    let finishSave!: () => void;
    const repository: DesignRepository = {
      load: vi.fn(),
      save: vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
        finishSave = resolve;
      })),
    };
    const kit = createEditorTestKit();
    const saveCoordinator = new SaveCoordinator('race-card', repository, kit.uiStore);
    const value = { ...kit, saveCoordinator };
    const wrapper = ({ children }: { children: ReactNode }) => (
      <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
    );
    const exportPng = vi.spyOn(kit.editor, 'exportPng')
      .mockRejectedValueOnce(new Error('PNG export failed'))
      .mockResolvedValueOnce(new Blob(['png'], { type: 'image/png' }));
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: vi.fn(() => 'blob:success-export'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    saveCoordinator.schedule(createSampleDesign());
    const flush = saveCoordinator.flush();
    render(<><EditorTopbar cardId="race-card" /><Toast /></>, { wrapper });

    await user.click(screen.getByRole('button', { name: 'PNG 저장' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('PNG export failed');

    await act(async () => {
      finishSave();
      await flush;
    });
    expect(screen.getByRole('alert')).toHaveTextContent('PNG export failed');
    expect(kit.uiStore.getState()).toMatchObject({
      error: 'PNG export failed',
      saveError: null,
      saveStatus: 'saved',
    });

    kit.uiStore.getState().setSaveError('quota remains');
    await user.click(screen.getByRole('button', { name: 'PNG 저장' }));
    await waitFor(() => expect(kit.uiStore.getState().error).toBeNull());

    expect(exportPng).toHaveBeenCalledTimes(2);
    expect(kit.uiStore.getState().saveError).toBe('quota remains');
    expect(screen.getByRole('alert')).toHaveTextContent('quota remains');
  });
});
