import { createSampleDesign } from '@/entities/design';
import { createDesignStore } from '@/features/editor/model/design-store';
import { describe, expect, it } from 'vitest';

import { TransformElementCommand } from './transform-element-command';

function elementById(id: string) {
  const store = createDesignStore(createSampleDesign());
  const read = () => store.getState().design.pages[0].elements.find((element) => element.id === id);
  return { store, read };
}

describe('TransformElementCommand', () => {
  it('텍스트 corner scale은 scale을 저장하지 않고 width와 fontSize로 흡수한다', () => {
    const { store, read } = elementById('title');
    const command = new TransformElementCommand(store, 'page-1', 'title', {
      before: {
        x: 130,
        y: 130,
        width: 820,
        height: 130,
        rotation: 0,
        fontSize: 72,
      },
      after: {
        x: 160,
        y: 150,
        width: 1025,
        height: 162.5,
        rotation: 8,
        fontSize: 90,
      },
    });

    command.execute();

    expect(read()).toMatchObject({
      type: 'text',
      x: 160,
      y: 150,
      width: 1025,
      height: 162.5,
      rotation: 8,
      fontSize: 90,
    });
    expect(read()).not.toHaveProperty('scaleX');
    expect(read()).not.toHaveProperty('scaleY');

    command.undo();
    expect(read()).toMatchObject({
      type: 'text',
      x: 130,
      y: 130,
      width: 820,
      height: 130,
      rotation: 0,
      fontSize: 72,
    });
  });

  it('도형 transform에는 텍스트 전용 fontSize를 섞지 않는다', () => {
    const { store, read } = elementById('top-decoration');
    const command = new TransformElementCommand(store, 'page-1', 'top-decoration', {
      before: { x: 70, y: 56, width: 940, height: 250, rotation: 0 },
      after: { x: 90, y: 76, width: 800, height: 220, rotation: 12 },
    });

    command.execute();

    expect(read()).toMatchObject({
      type: 'shape',
      x: 90,
      y: 76,
      width: 800,
      height: 220,
      rotation: 12,
    });
    expect(read()).not.toHaveProperty('fontSize');
  });
});
