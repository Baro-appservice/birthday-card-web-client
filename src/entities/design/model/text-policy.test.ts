import { describe, expect, it } from 'vitest';

import {
  TEXT_FONT_SIZE_MAX,
  TEXT_FONT_SIZE_MIN,
  assertTextFontSize,
  clampTextFontSize,
  isValidTextFontSize,
} from './text-policy';

describe('text typography policy', () => {
  it('허용 범위의 경계값을 유효하게 취급한다', () => {
    expect(isValidTextFontSize(TEXT_FONT_SIZE_MIN)).toBe(true);
    expect(isValidTextFontSize(TEXT_FONT_SIZE_MAX)).toBe(true);
    expect(() => assertTextFontSize(TEXT_FONT_SIZE_MIN)).not.toThrow();
    expect(() => assertTextFontSize(TEXT_FONT_SIZE_MAX)).not.toThrow();
  });

  it('범위 밖 값과 유한하지 않은 값은 거부한다', () => {
    for (const value of [TEXT_FONT_SIZE_MIN - 1, TEXT_FONT_SIZE_MAX + 1, Number.NaN, Infinity]) {
      expect(isValidTextFontSize(value)).toBe(false);
      expect(() => assertTextFontSize(value)).toThrow('글자 크기는');
    }
  });

  it('Canvas transform용 clamp도 동일한 경계값을 사용한다', () => {
    expect(clampTextFontSize(1)).toBe(TEXT_FONT_SIZE_MIN);
    expect(clampTextFontSize(72)).toBe(72);
    expect(clampTextFontSize(999)).toBe(TEXT_FONT_SIZE_MAX);
    expect(clampTextFontSize(Number.NaN)).toBe(TEXT_FONT_SIZE_MIN);
  });
});
