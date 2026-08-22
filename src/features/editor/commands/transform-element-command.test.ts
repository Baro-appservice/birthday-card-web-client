import {
  TEXT_FONT_SIZE_MAX,
  createSampleDesign,
} from '@/entities/design';
import { createDesignStore } from '@/features/editor/model/design-store';
import { describe, expect, it } from 'vitest';

import { TransformElementCommand } from './transform-element-command';

function elementById(id: string) {
  const store = createDesignStore(createSampleDesign());
  const read = () => store.getState().design.pages[0].elements.find((element) => element.id === id);
  return { store, read };
}

describe('TransformElementCommand', () => {
  it('텍스트 corner scale은 scale을 저장하지 않고 width와 fontSize로 흡수하며 legacy height는 보존한다', () => {
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
      height: 130,
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

  it('corner scale이 fontSize 최대값을 넘으면 width도 같은 비율로 보정한다', () => {
    const { store, read } = elementById('title');
    const rawFontSize = 320;
    const rawWidth = 3644.4444444444443;
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
        x: 130,
        y: 130,
        width: rawWidth,
        height: 500,
        rotation: 0,
        fontSize: rawFontSize,
      },
    });

    command.execute();

    const title = read();
    expect(title).toMatchObject({
      type: 'text',
      height: 130,
      fontSize: TEXT_FONT_SIZE_MAX,
    });
    expect(title?.width).toBeCloseTo(rawWidth * (TEXT_FONT_SIZE_MAX / rawFontSize), 6);
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
