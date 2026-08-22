export const IMAGE_CROP_ZOOM_MIN = 1;
export const IMAGE_CROP_ZOOM_MAX = 3;
export const IMAGE_CROP_FOCUS_MIN = -1;
export const IMAGE_CROP_FOCUS_MAX = 1;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampImageCropZoom(value: number): number {
  if (!Number.isFinite(value)) return IMAGE_CROP_ZOOM_MIN;
  return clamp(value, IMAGE_CROP_ZOOM_MIN, IMAGE_CROP_ZOOM_MAX);
}

export function clampImageCropFocus(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return clamp(value, IMAGE_CROP_FOCUS_MIN, IMAGE_CROP_FOCUS_MAX);
}

export function assertImageCropZoom(value: number): void {
  if (!Number.isFinite(value) || value < IMAGE_CROP_ZOOM_MIN || value > IMAGE_CROP_ZOOM_MAX) {
    throw new Error(`이미지 확대 비율은 ${IMAGE_CROP_ZOOM_MIN}에서 ${IMAGE_CROP_ZOOM_MAX} 사이여야 합니다.`);
  }
}

export function assertImageCropFocus(value: number): void {
  if (!Number.isFinite(value) || value < IMAGE_CROP_FOCUS_MIN || value > IMAGE_CROP_FOCUS_MAX) {
    throw new Error(`이미지 위치 값은 ${IMAGE_CROP_FOCUS_MIN}에서 ${IMAGE_CROP_FOCUS_MAX} 사이여야 합니다.`);
  }
}
