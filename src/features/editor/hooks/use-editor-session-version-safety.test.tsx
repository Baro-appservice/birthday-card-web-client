import { beforeEach, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { createSampleDesign } from '@/entities/design';
import { writeEmergencyDesign } from '@/features/editor/persistence';
import { createEditorTestKit } from '@/features/editor/testing/editor-test-kit';

import { useEditorSession } from './use-editor-session';

const emergencyKey = (cardId: string) => `birthday-canvas:emergency:${cardId}`;

describe('useEditorSession future-version safety', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('미래 버전 IndexedDB current를 compatible emergency가 자동으로 덮어쓰지 않는다', async () => {
    const cardId = 'future-current';
    const emergency = createSampleDesign();
    emergency.pages[0].background = '#123456';
    writeEmergencyDesign(cardId, emergency);
    const rawEmergency = localStorage.getItem(emergencyKey(cardId));
    const kit = createEditorTestKit({
      loadResult: {
        status: 'recoverable',
        reason: 'unsupported-version',
        backup: null,
      },
    });

    const { result } = renderHook(() => useEditorSession(cardId), { wrapper: kit.wrapper });
    await waitFor(() => expect(result.current.status).toBe('recoverable'));

    expect(kit.saveCoordinator.schedule).not.toHaveBeenCalled();
    expect(kit.saveCoordinator.flush).not.toHaveBeenCalled();
    expect(kit.uiStore.getState().recoveryNotice).toMatchObject({
      reason: 'unsupported-version',
      backup: { pages: [{ background: '#123456' }] },
    });
    expect(localStorage.getItem(emergencyKey(cardId))).toBe(rawEmergency);
  });

  it('미래 버전 emergency를 발견하면 valid current가 있어도 삭제하거나 자동 저장하지 않는다', async () => {
    const cardId = 'future-emergency';
    const loaded = createSampleDesign();
    loaded.pages[0].background = '#654321';
    const future = { ...createSampleDesign(), version: 2 };
    const rawEmergency = JSON.stringify({ design: future, updatedAt: Date.now() + 10_000 });
    localStorage.setItem(emergencyKey(cardId), rawEmergency);
    const kit = createEditorTestKit({
      loadResult: { status: 'loaded', design: loaded, updatedAt: Date.now() },
    });

    const { result } = renderHook(() => useEditorSession(cardId), { wrapper: kit.wrapper });
    await waitFor(() => expect(result.current.status).toBe('recoverable'));

    expect(kit.saveCoordinator.schedule).not.toHaveBeenCalled();
    expect(kit.saveCoordinator.flush).not.toHaveBeenCalled();
    expect(kit.uiStore.getState().recoveryNotice).toMatchObject({
      reason: 'unsupported-version',
      backup: { pages: [{ background: '#654321' }] },
    });
    expect(localStorage.getItem(emergencyKey(cardId))).toBe(rawEmergency);
  });
});
