import { ActiveSelection, FabricObject, type Canvas } from 'fabric';
import { describe, expect, it, vi } from 'vitest';

import { FabricEventAdapter } from './fabric-event-adapter';
import { setElementId } from './fabric-object-metadata';

type Handler = (event: Record<string, unknown>) => void;

function createCanvas() {
  const listeners = new Map<string, Handler>();
  let activeObjects: FabricObject[] = [];
  return {
    on: vi.fn((event: string, listener: Handler) => { listeners.set(event, listener); }),
    off: vi.fn((event: string, listener: Handler) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    }),
    getActiveObjects: vi.fn(() => activeObjects),
    setActiveObjects: (objects: FabricObject[]) => { activeObjects = objects; },
    fire(event: string, payload: Record<string, unknown> = {}) { listeners.get(event)?.(payload); },
  };
}

function element(id: string) {
  return setElementId(new FabricObject({ left: 10, top: 20, width: 100, height: 50, angle: 5 }), id);
}

describe('FabricEventAdapter', () => {
  it('selection ID를 Fabric 순서의 첫 ID 하나로만 정규화한다', () => {
    const canvas = createCanvas();
    const received: string[][] = [];
    const adapter = new FabricEventAdapter(canvas as unknown as Canvas, (event) => {
      if (event.type === 'selection:changed') received.push(event.elementIds);
    });
    const title = element('title');
    const name = element('name');

    canvas.setActiveObjects([title, name, title]);
    canvas.fire('selection:created', { selected: [title, name, title] });
    canvas.setActiveObjects([title, name]);
    canvas.fire('selection:updated', { selected: [] });
    canvas.setActiveObjects([]);
    canvas.fire('selection:cleared');

    expect(received).toEqual([['title'], []]);
    adapter.dispose();
  });

  it('selection:updated도 현재 집합의 첫 ID 하나만 전달한다', () => {
    const canvas = createCanvas();
    const received: string[][] = [];
    const adapter = new FabricEventAdapter(canvas as unknown as Canvas, (event) => {
      if (event.type === 'selection:changed') received.push(event.elementIds);
    });
    const title = element('title');
    const name = element('name');

    canvas.setActiveObjects([title]);
    canvas.fire('selection:created', { selected: [title] });
    canvas.setActiveObjects([name, title]);
    canvas.fire('selection:updated', { selected: [name], deselected: [] });

    expect(received).toEqual([['title'], ['name']]);
    adapter.dispose();
  });

  it('selection:updated의 제거 뒤에도 남은 첫 ID 하나만 전달한다', () => {
    const canvas = createCanvas();
    const received: string[][] = [];
    const adapter = new FabricEventAdapter(canvas as unknown as Canvas, (event) => {
      if (event.type === 'selection:changed') received.push(event.elementIds);
    });
    const title = element('title');
    const name = element('name');

    canvas.setActiveObjects([title, name]);
    canvas.fire('selection:created', { selected: [title, name] });
    canvas.setActiveObjects([name]);
    canvas.fire('selection:updated', { selected: [], deselected: [name] });

    expect(received).toEqual([['title'], ['name']]);
    adapter.dispose();
  });

  it('변형 전 snapshot과 수정 후 snapshot으로 transformed를 정확히 한 번 전달한다', () => {
    const canvas = createCanvas();
    const received: unknown[] = [];
    const adapter = new FabricEventAdapter(canvas as unknown as Canvas, (event) => received.push(event));
    const title = element('title');

    canvas.fire('mouse:down', { target: title });
    title.set({ left: 50, top: 60, scaleX: 2, scaleY: 3, angle: 15 });
    canvas.fire('object:modified', { target: title });
    canvas.fire('object:modified', { target: title });

    expect(received).toEqual([{
      type: 'element:transformed', elementId: 'title',
      before: { x: 10, y: 20, width: 100, height: 50, rotation: 5 },
      after: { x: 50, y: 60, width: 200, height: 150, rotation: 15 },
    }]);
    adapter.dispose();
  });

  it('metadata가 없는 객체와 before snapshot이 없는 수정은 안전하게 무시한다', () => {
    const canvas = createCanvas();
    const received = vi.fn();
    const adapter = new FabricEventAdapter(canvas as unknown as Canvas, received);

    canvas.fire('mouse:down', { target: new FabricObject() });
    canvas.fire('object:modified', { target: new FabricObject() });

    expect(received).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it('metadata가 없는 ActiveSelection의 transform은 Domain event로 바꾸지 않는다', () => {
    const canvas = createCanvas();
    const received = vi.fn();
    const adapter = new FabricEventAdapter(canvas as unknown as Canvas, received);
    const group = new ActiveSelection([element('title'), element('name')]);

    canvas.fire('mouse:down', { target: group });
    canvas.fire('object:modified', { target: group });

    expect(received).not.toHaveBeenCalled();
    adapter.dispose();
  });

  it('텍스트 편집 전후를 한 번만 전달하고 변경이 없으면 무시한다', () => {
    const canvas = createCanvas();
    const received: unknown[] = [];
    const adapter = new FabricEventAdapter(canvas as unknown as Canvas, (event) => received.push(event));
    const title = element('title') as FabricObject & { text?: string };
    title.set({ text: '처음 문구' });

    canvas.fire('text:editing:entered', { target: title });
    title.set({ text: '바뀐 문구' });
    canvas.fire('text:editing:exited', { target: title });
    canvas.fire('text:editing:exited', { target: title });

    expect(received).toEqual([{
      type: 'text:edited', elementId: 'title', before: '처음 문구', after: '바뀐 문구',
    }]);
    adapter.dispose();
  });

  it('dispose는 등록한 정확한 handler만 한 번씩 해제한다', () => {
    const canvas = createCanvas();
    const adapter = new FabricEventAdapter(canvas as unknown as Canvas, vi.fn());

    adapter.dispose();
    adapter.dispose();

    expect(canvas.off).toHaveBeenCalledTimes(10);
    expect(canvas.off.mock.calls.every(([event, handler]) => event && typeof handler === 'function')).toBe(true);
  });
});
