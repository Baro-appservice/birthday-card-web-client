import { FabricObject, type Canvas } from 'fabric';
import { describe, expect, it, vi } from 'vitest';

import { setElementId } from './fabric-object-metadata';
import { FabricSnapGuides } from './fabric-snap-guides';

function createCanvas(objects: FabricObject[] = []) {
  const state = [...objects];
  return {
    getWidth: vi.fn(() => 1080),
    getHeight: vi.fn(() => 1350),
    getObjects: vi.fn(() => state),
    add: vi.fn((...next: FabricObject[]) => { state.push(...next); }),
    remove: vi.fn((...removed: FabricObject[]) => {
      for (const object of removed) {
        const index = state.indexOf(object);
        if (index >= 0) state.splice(index, 1);
      }
      return removed;
    }),
    requestRenderAll: vi.fn(),
  };
}

function element(id: string, left: number, top: number, width: number, height: number) {
  return setElementId(new FabricObject({
    left,
    top,
    width,
    height,
    originX: 'left',
    originY: 'top',
  }), id);
}

describe('FabricSnapGuides', () => {
  it('요소 중심이 캔버스 중심 threshold 안에 들어오면 정확히 중앙에 snap한다', () => {
    const moving = element('moving', 486, 100, 100, 80);
    const canvas = createCanvas([moving]);
    const guides = new FabricSnapGuides(canvas as unknown as Canvas);

    guides.handleMoving(moving);

    expect(moving.left).toBeCloseTo(490, 8);
    expect(canvas.add).toHaveBeenCalledTimes(1);
    expect(canvas.requestRenderAll).toHaveBeenCalled();
  });

  it('다른 요소의 edge/center에도 snap하고 guide는 domain element로 취급하지 않는다', () => {
    const reference = element('reference', 200, 300, 100, 100);
    const moving = element('moving', 196, 520, 100, 100);
    const canvas = createCanvas([reference, moving]);
    const guides = new FabricSnapGuides(canvas as unknown as Canvas);

    guides.handleMoving(moving);

    expect(moving.left).toBeCloseTo(200, 8);
    expect(canvas.getObjects()).toHaveLength(3);
    expect(canvas.getObjects().filter((object) => object === reference || object === moving)).toHaveLength(2);
  });

  it('이동이 끝나면 임시 guide만 제거하고 실제 요소는 유지한다', () => {
    const moving = element('moving', 486, 100, 100, 80);
    const canvas = createCanvas([moving]);
    const guides = new FabricSnapGuides(canvas as unknown as Canvas);

    guides.handleMoving(moving);
    guides.clear();

    expect(canvas.getObjects()).toEqual([moving]);
    expect(canvas.remove).toHaveBeenCalledTimes(1);
  });
});
