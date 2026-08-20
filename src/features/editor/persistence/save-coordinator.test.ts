import { createSampleDesign } from '@/entities/design';
import type { Design } from '@/entities/design';
import type { DesignRepository } from '@/features/editor/core/ports';
import { createEditorUiStore } from '@/features/editor/model/editor-ui-store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SaveCoordinator } from './save-coordinator';

function createRepository(save: DesignRepository['save']): DesignRepository {
  return { load: vi.fn(), save };
}

describe('SaveCoordinator', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('600ms 동안 여러 변경을 받으면 마지막 Design snapshot만 한 번 저장한다', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const uiStore = createEditorUiStore();
    const coordinator = new SaveCoordinator('local-demo', createRepository(save), uiStore);
    const first = createSampleDesign();
    const final: Design = {
      ...first,
      pages: [{ ...first.pages[0], background: '#ffffff' }],
    };

    coordinator.schedule(first);
    coordinator.schedule(final);
    await vi.advanceTimersByTimeAsync(600);

    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith('local-demo', final);
    expect(uiStore.getState().saveStatus).toBe('saved');
  });

  it('실패한 마지막 저장은 error를 표시하고 retry 성공 뒤 saved로 바꾼다', async () => {
    const save = vi.fn()
      .mockRejectedValueOnce(new Error('quota exceeded'))
      .mockResolvedValueOnce(undefined);
    const uiStore = createEditorUiStore();
    const coordinator = new SaveCoordinator('local-demo', createRepository(save), uiStore);

    coordinator.schedule(createSampleDesign());
    await vi.advanceTimersByTimeAsync(600);
    expect(uiStore.getState().saveStatus).toBe('error');
    await coordinator.retry();

    expect(save).toHaveBeenCalledTimes(2);
    expect(uiStore.getState().saveStatus).toBe('saved');
    expect(uiStore.getState().error).toBeNull();
  });

  it('저장 중 새 변경이 예약되면 오래된 실패가 최신 저장 상태를 덮어쓰지 않는다', async () => {
    let rejectFirst: ((reason?: unknown) => void) | undefined;
    const save = vi.fn()
      .mockImplementationOnce(() => new Promise<void>((_resolve, reject) => { rejectFirst = reject; }))
      .mockResolvedValueOnce(undefined);
    const uiStore = createEditorUiStore();
    const coordinator = new SaveCoordinator('local-demo', createRepository(save), uiStore);
    const first = createSampleDesign();
    const second: Design = { ...first, pages: [{ ...first.pages[0], background: '#000000' }] };

    coordinator.schedule(first);
    await vi.advanceTimersByTimeAsync(600);
    coordinator.schedule(second);
    expect(uiStore.getState().saveStatus).toBe('saving');
    rejectFirst?.(new Error('stale quota error'));
    await Promise.resolve();

    expect(uiStore.getState().saveStatus).toBe('saving');
    await vi.advanceTimersByTimeAsync(600);
    expect(uiStore.getState().saveStatus).toBe('saved');
    expect(save).toHaveBeenLastCalledWith('local-demo', second);
  });

  it('예약 뒤 원본 Design을 변경해도 저장 snapshot은 변경되지 않는다', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const coordinator = new SaveCoordinator(
      'local-demo',
      createRepository(save),
      createEditorUiStore(),
    );
    const design = createSampleDesign();

    coordinator.schedule(design);
    design.pages[0].background = '#111111';
    await vi.advanceTimersByTimeAsync(600);

    expect(save.mock.calls[0][1].pages[0].background).not.toBe('#111111');
  });

  it('dispose 뒤에는 예약된 저장과 새 저장을 수행하지 않는다', async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const coordinator = new SaveCoordinator(
      'local-demo',
      createRepository(save),
      createEditorUiStore(),
    );

    coordinator.schedule(createSampleDesign());
    coordinator.dispose();
    coordinator.schedule(createSampleDesign());
    await vi.advanceTimersByTimeAsync(600);
    await coordinator.flush();

    expect(save).not.toHaveBeenCalled();
  });
});
