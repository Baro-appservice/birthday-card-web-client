export const TEXT_FONT_SIZE_MIN = 12;
export const TEXT_FONT_SIZE_MAX = 160;

export function isValidTextFontSize(fontSize: number): boolean {
  return Number.isFinite(fontSize)
    && fontSize >= TEXT_FONT_SIZE_MIN
    && fontSize <= TEXT_FONT_SIZE_MAX;
}

export function assertTextFontSize(fontSize: number): void {
  if (isValidTextFontSize(fontSize)) return;
  throw new Error(
    `글자 크기는 ${TEXT_FONT_SIZE_MIN}에서 ${TEXT_FONT_SIZE_MAX} 사이의 유한한 숫자여야 합니다.`,
  );
}

export function clampTextFontSize(fontSize: number): number {
  if (!Number.isFinite(fontSize)) return TEXT_FONT_SIZE_MIN;
  return Math.min(TEXT_FONT_SIZE_MAX, Math.max(TEXT_FONT_SIZE_MIN, fontSize));
}
