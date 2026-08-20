import {
  addElement,
  moveElement,
  removeElement,
  replaceElement,
  setPageBackground,
  type DesignElement,
  type DesignPage,
} from '@/entities/design';

const createShape = (id: string): DesignElement => ({
  id,
  type: 'shape',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  rotation: 0,
  opacity: 1,
  shape: 'rectangle',
  fill: '#ffffff',
});

const createPage = (elements: DesignElement[]): DesignPage => ({
  id: 'page-1',
  background: '#fef3f7',
  elements,
});

describe('design operations', () => {
  it('요소를 마지막 레이어에 추가하고 원본 페이지를 바꾸지 않는다', () => {
    const page = createPage([createShape('back')]);

    const result = addElement(page, createShape('front'));

    expect(result.elements.map((element) => element.id)).toEqual(['back', 'front']);
    expect(page.elements.map((element) => element.id)).toEqual(['back']);
  });

  it('요소를 교체하고 원본 페이지를 바꾸지 않는다', () => {
    const page = createPage([createShape('old')]);
    const replacement = { ...createShape('old'), fill: '#ff99bb' };

    const result = replaceElement(page, 'old', replacement);

    expect(result.elements[0]).toEqual(replacement);
    expect(page.elements[0]).toEqual(createShape('old'));
  });

  it('존재하지 않는 요소를 교체하면 명확한 오류를 던진다', () => {
    const page = createPage([createShape('present')]);

    expect(() => replaceElement(page, 'missing', createShape('missing'))).toThrow(
      '존재하지 않는 요소입니다: missing',
    );
  });

  it('요소를 제거하고 원본 페이지를 바꾸지 않는다', () => {
    const page = createPage([createShape('back'), createShape('front')]);

    const result = removeElement(page, 'back');

    expect(result.elements.map((element) => element.id)).toEqual(['front']);
    expect(page.elements.map((element) => element.id)).toEqual(['back', 'front']);
  });

  it('middle 레이어를 맨 앞으로 이동한다', () => {
    const page = createPage([
      createShape('back'),
      createShape('middle'),
      createShape('front'),
    ]);

    const result = moveElement(page, 'middle', 2);

    expect(result.elements.map((element) => element.id)).toEqual([
      'back',
      'front',
      'middle',
    ]);
    expect(page.elements.map((element) => element.id)).toEqual([
      'back',
      'middle',
      'front',
    ]);
  });

  it.each([-1, 2, 1.5])('유효하지 않은 레이어 위치 %s를 거부한다', (targetIndex) => {
    const page = createPage([createShape('back'), createShape('front')]);

    expect(() => moveElement(page, 'back', targetIndex)).toThrow(
      `유효하지 않은 레이어 위치입니다: ${targetIndex}`,
    );
  });

  it('존재하지 않는 요소는 이동할 수 없다', () => {
    const page = createPage([createShape('back'), createShape('front')]);

    expect(() => moveElement(page, 'missing', 0)).toThrow(
      '존재하지 않는 요소입니다: missing',
    );
  });

  it.each([
    ['첫 요소를 첫 위치로', 'back', 0, ['back', 'front']],
    ['마지막 요소를 마지막 위치로', 'front', 1, ['back', 'front']],
  ])('%s 이동은 경계에서 순서를 유지한다', (_description, elementId, targetIndex, expected) => {
    const page = createPage([createShape('back'), createShape('front')]);

    const result = moveElement(page, elementId, targetIndex);

    expect(result.elements.map((element) => element.id)).toEqual(expected);
    expect(page.elements.map((element) => element.id)).toEqual(['back', 'front']);
  });

  it('배경을 변경하고 원본 페이지를 바꾸지 않는다', () => {
    const page = createPage([]);

    const result = setPageBackground(page, '#ffffff');

    expect(result.background).toBe('#ffffff');
    expect(page.background).toBe('#fef3f7');
  });
});
