import { describe, expect, it } from 'vitest';

import {
  DEFAULT_TEXT_COLOR,
  assertHexColor,
  normalizeHexColor,
} from './color-policy';

describe('color policy', () => {
  it('6자리 hex는 소문자 canonical 값으로 정규화한다', () => {
    expect(normalizeHexColor('#A1B2C3', DEFAULT_TEXT_COLOR)).toBe('#a1b2c3');
  });

  it('3자리 hex는 6자리로 확장한다', () => {
    expect(normalizeHexColor('#AbC', DEFAULT_TEXT_COLOR)).toBe('#aabbcc');
  });

  it('지원하지 않는 CSS 색상 문자열은 명시적 fallback으로 바꾼다', () => {
    expect(normalizeHexColor('red', '#ffffff')).toBe('#ffffff');
    expect(normalizeHexColor('rgb(1, 2, 3)', '#ffffff')).toBe('#ffffff');
  });

  it('Core 입력 경계는 정확한 #RRGGBB만 허용한다', () => {
    expect(() => assertHexColor('#A1b2C3')).not.toThrow();
    expect(() => assertHexColor('#abc')).toThrow('#RRGGBB');
    expect(() => assertHexColor('red')).toThrow('#RRGGBB');
  });
});
