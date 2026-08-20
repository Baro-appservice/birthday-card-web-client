import { createSampleDesign, designSchema } from '@/entities/design';

describe('designSchema', () => {
  it('자기 생일 샘플은 유효한 1080x1350 문서다', () => {
    const design = createSampleDesign();

    expect(designSchema.parse(design)).toMatchObject({
      version: 1,
      width: 1080,
      height: 1350,
    });
    expect(
      design.pages[0].elements.some(
        (element) => element.type === 'text' && element.text.includes('제 생일'),
      ),
    ).toBe(true);
    expect(design.pages[0].elements.some((element) => element.id === 'title')).toBe(true);
  });

  it('이미지 요소에 브라우저 URL 저장을 허용하지 않는다', () => {
    const design = createSampleDesign();
    const image = design.pages[0].elements.find(
      (element) => element.type === 'image',
    );
    if (!image) throw new Error('샘플 이미지 요소가 없습니다.');

    expect(
      designSchema.safeParse({
        ...design,
        pages: [
          {
            ...design.pages[0],
            elements: [{ ...image, src: 'blob:http://localhost/temporary' }],
          },
        ],
      }).success,
    ).toBe(false);
  });

  it('알 수 없는 저장 필드를 허용하지 않는다', () => {
    const design = createSampleDesign();

    expect(
      designSchema.safeParse({
        ...design,
        unexpected: 'persistent-fabric-state',
      }).success,
    ).toBe(false);
  });
});
