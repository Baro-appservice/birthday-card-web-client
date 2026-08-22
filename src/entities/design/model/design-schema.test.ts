import {
  createSampleDesign,
  designElementSchema,
  designSchema,
} from '@/entities/design';

const elementVariants = [
  {
    name: 'text',
    valid: {
      id: 'text-1',
      type: 'text',
      x: 10,
      y: 20,
      width: 300,
      height: 80,
      rotation: 0,
      opacity: 1,
      text: '생일이에요',
      fontFamily: 'Pretendard',
      fontSize: 32,
      fontWeight: 700,
      color: '#b52262',
      textAlign: 'center',
    },
    coreField: 'fontSize',
    invalidCoreValue: '32',
    invalidVariant: { textAlign: 'justify' },
    invalidDiscriminant: { type: 'video' },
  },
  {
    name: 'image',
    valid: {
      id: 'image-1',
      type: 'image',
      x: 10,
      y: 20,
      width: 300,
      height: 240,
      rotation: 0,
      opacity: 1,
      assetId: '550e8400-e29b-41d4-a716-446655440000',
      cropZoom: 1,
      cropFocusX: 0,
      cropFocusY: 0,
    },
    coreField: 'assetId',
    invalidCoreValue: 123,
    invalidVariant: { type: 'video' },
    invalidDiscriminant: { type: 'video' },
  },
  {
    name: 'shape',
    valid: {
      id: 'shape-1',
      type: 'shape',
      x: 10,
      y: 20,
      width: 300,
      height: 240,
      rotation: 0,
      opacity: 1,
      shape: 'rectangle',
      fill: '#ffb6cf',
    },
    coreField: 'fill',
    invalidCoreValue: 123,
    invalidVariant: { shape: 'triangle' },
    invalidDiscriminant: { type: 'video' },
  },
] as const;

describe('designSchema', () => {
  it('자기 생일 샘플은 유효한 1080x1350 v3 문서다', () => {
    const design = createSampleDesign();

    expect(designSchema.parse(design)).toMatchObject({
      version: 3,
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

  it.each([
    'blob:http://localhost/temporary',
    'BLOB:http://localhost/temporary',
    'data:image/png;base64,AA==',
    'http://example.com/photo.png',
    'HTTPS://example.com/photo.png',
  ])('assetId에 세션 또는 원격 URL을 저장하지 않는다: %s', (assetId) => {
    const design = createSampleDesign();
    const image = design.pages[0].elements.find(
      (element) => element.type === 'image',
    );
    if (!image) throw new Error('샘플 이미지 요소가 없습니다.');

    expect(
      designSchema.safeParse({
        ...design,
        pages: [{ ...design.pages[0], elements: [{ ...image, assetId }] }],
      }).success,
    ).toBe(false);
  });

  it('builtin asset ID와 공백을 제외한 안정 식별자는 저장한다', () => {
    const design = createSampleDesign();
    const image = design.pages[0].elements.find(
      (element) => element.type === 'image',
    );
    if (!image) throw new Error('샘플 이미지 요소가 없습니다.');

    expect(
      designSchema.safeParse({
        ...design,
        pages: [{ ...design.pages[0], elements: [{ ...image, assetId: 'builtin:birthday-photo' }] }],
      }).success,
    ).toBe(true);
    expect(
      designSchema.safeParse({
        ...design,
        pages: [{ ...design.pages[0], elements: [{ ...image, assetId: '   ' }] }],
      }).success,
    ).toBe(false);
  });

  it('이미지 crop 범위를 벗어난 저장 값은 거부한다', () => {
    const image = createSampleDesign().pages[0].elements.find((element) => element.type === 'image');
    if (!image || image.type !== 'image') throw new Error('샘플 이미지 요소가 없습니다.');

    expect(designElementSchema.safeParse({ ...image, cropZoom: 0.99 }).success).toBe(false);
    expect(designElementSchema.safeParse({ ...image, cropZoom: 3.01 }).success).toBe(false);
    expect(designElementSchema.safeParse({ ...image, cropFocusX: -1.01 }).success).toBe(false);
    expect(designElementSchema.safeParse({ ...image, cropFocusY: 1.01 }).success).toBe(false);
    expect(designElementSchema.safeParse({
      ...image,
      cropZoom: 3,
      cropFocusX: -1,
      cropFocusY: 1,
    }).success).toBe(true);
  });

  it.each(elementVariants)(
    '$name 요소는 정상 입력만 받고 unknown key, 잘못된 핵심 타입, enum과 discriminant를 거부한다',
    ({
      valid,
      coreField,
      invalidCoreValue,
      invalidVariant,
      invalidDiscriminant,
    }) => {
      expect(designElementSchema.safeParse(valid).success).toBe(true);
      expect(
        designElementSchema.safeParse({ ...valid, unsupported: true }).success,
      ).toBe(false);
      expect(
        designElementSchema.safeParse({ ...valid, [coreField]: invalidCoreValue }).success,
      ).toBe(false);
      expect(
        designElementSchema.safeParse({ ...valid, ...invalidVariant }).success,
      ).toBe(false);
      expect(
        designElementSchema.safeParse({ ...valid, ...invalidDiscriminant }).success,
      ).toBe(false);
    },
  );

  it('알 수 없는 저장 필드를 허용하지 않는다', () => {
    const design = createSampleDesign();

    expect(
      designSchema.safeParse({
        ...design,
        unexpected: 'persistent-fabric-state',
      }).success,
    ).toBe(false);
  });

  it('편집할 페이지가 하나도 없는 Design을 거부한다', () => {
    expect(designSchema.safeParse({
      ...createSampleDesign(),
      pages: [],
    }).success,
    ).toBe(false);
  });

  it('샘플의 모든 텍스트는 승인된 기본 글꼴 system-ui를 사용한다', () => {
    const textElements = createSampleDesign().pages[0].elements.filter(
      (element) => element.type === 'text',
    );

    expect(textElements).not.toHaveLength(0);
    expect(textElements.every((element) => element.fontFamily === 'system-ui')).toBe(true);
  });
});
