import { Rect, type Canvas, type FabricObject } from 'fabric';
import { describe, expect, it, vi } from 'vitest';

import { FabricEventAdapter } from './fabric-event-adapter';
import { setElementId } from './fabric-object-metadata';

type Handler = (event?: { target?: FabricObject; selected?: FabricObject[] }) => void;

describe('FabricEventAdapter programmatic selection sync', () => {
  it('suppressed selection 뒤 실제 Canvas 상태를 snapshot으로 갱신해 다음 사용자 선택을 버리지 않는다', () => {
    const handlers = new Map<string, Handler>();
    let activeObjects: FabricObject[] = [];
    const canvas = {
      on: vi.fn((eventName: string, handler: Handler) => {
        handlers.set(eventName, handler);
      }),
      off: vi.fn((eventName: string) => {
        handlers.delete(eventName);
      }),
      getActiveObjects: vi.fn(() => activeObjects),
    } as unknown as Canvas;
    const emit = vi.fn();
    const adapter = new FabricEventAdapter(canvas, emit);
    const first = setElementId(new Rect(), 'first');
    const second = setElementId(new Rect(), 'second');

    activeObjects = [first];
    handlers.get('selection:created')?.();
    expect(emit).toHaveBeenLastCalledWith({
      type: 'selection:changed',
      elementIds: ['first'],
    });

    adapter.runWithoutSelectionEvents(() => {
      activeObjects = [second];
      handlers.get('selection:updated')?.();
    });
    expect(emit).toHaveBeenCalledTimes(1);

    activeObjects = [first];
    handlers.get('selection:updated')?.();

    expect(emit).toHaveBeenCalledTimes(2);
    expect(emit).toHaveBeenLastCalledWith({
      type: 'selection:changed',
      elementIds: ['first'],
    });

    adapter.dispose();
  });
});
