export const DEFAULT_BACKGROUND_COLOR = '#ffffff';
export const DEFAULT_TEXT_COLOR = '#000000';
export const DEFAULT_SHAPE_COLOR = '#000000';

const SIX_DIGIT_HEX = /^#[0-9a-f]{6}$/i;
const THREE_DIGIT_HEX = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i;

export function normalizeHexColor(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (SIX_DIGIT_HEX.test(trimmed)) return trimmed.toLowerCase();
  const short = THREE_DIGIT_HEX.exec(trimmed);
  if (short) {
    return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`.toLowerCase();
  }
  return fallback;
}

export function assertHexColor(value: string): void {
  if (!SIX_DIGIT_HEX.test(value.trim())) {
    throw new Error('색상은 #RRGGBB 형식이어야 합니다.');
  }
}
