import { createSampleDesign, designSchema, shapeElementSchema } from '@/entities/design';
import { describe, expect, it } from 'vitest';

describe('design schema invariants', () => {
  it('ellipse를 명시적인 shape 종류로 허용한다', () => {
    expect(shapeElementSchema.safeParse({
      id: 'ellipse-1',
      type: 'shape',
      shape: 'ellipse',
      x: 10,
      y: 20,
      width: 300,
      height: 180,
      rotation: 0,
      opacity: 1,
      fill: '#ffb6cf',
    }).success).toBe(true);
  });

  it('같은 page 안의 중복 element ID를 거부한다', () => {
    const design = createSampleDesign();
    const duplicate = structuredClone(design.pages[0].elements[0]);
    design.pages[0].elements.push(duplicate);

    expect(designSchema.safeParse(design).success).toBe(false);
  });

  it('중복 page ID를 거부한다', () => {
    const design = createSampleDesign();
    design.pages.push({
      ...structuredClone(design.pages[0]),
      id: design.pages[0].id,
    });

    expect(designSchema.safeParse(design).success).toBe(false);
  });
});
