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

  it('배경을 변경하고 원본 페이지를 바꾸지 않는다', () => {
    const page = createPage([]);

    const result = setPageBackground(page, '#ffffff');

    expect(result.background).toBe('#ffffff');
    expect(page.background).toBe('#fef3f7');
  });
});
