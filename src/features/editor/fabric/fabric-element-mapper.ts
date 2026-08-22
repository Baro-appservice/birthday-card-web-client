import {
  clampImageCropFocus,
  clampImageCropZoom,
  type DesignElement,
  type DesignPage,
  type ImageElement,
  type TextTransformSnapshot,
  type TransformSnapshot,
} from '@/entities/design';
import type { AssetGateway } from '@/features/editor/core/ports';
import {
  controlsUtils,
  Ellipse,
  FabricImage,
  Rect,
  Textbox,
  type FabricObject,
} from 'fabric';

import { setElementId } from './fabric-object-metadata';

export interface FabricTransformValues {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
}

export interface FabricTextTransformValues extends FabricTransformValues {
  fontSize?: number;
}

export interface ElementMappingOptions {
  imageFailureMode?: 'placeholder' | 'throw';
}

const finiteOr = (value: number | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const positiveOr = (value: number | undefined, fallback: number) => {
  const normalized = finiteOr(value, fallback);
  return Math.abs(normalized) > 0 ? Math.abs(normalized) : fallback;
};

const multipliedPositiveOr = (left: number, right: number, fallback: number) => {
  const product = left * right;
  return Number.isFinite(product) && product > 0 ? product : fallback;
};

const APPROVED_FONT_FAMILIES = new Set(['system-ui', 'Arial', 'Georgia']);

export function readTransform(values: FabricTransformValues): TransformSnapshot {
  const width = positiveOr(values.width, 1);
  const height = positiveOr(values.height, 1);
  return {
    x: finiteOr(values.left, 0),
    y: finiteOr(values.top, 0),
    width: multipliedPositiveOr(width, positiveOr(values.scaleX, 1), width),
    height: multipliedPositiveOr(height, positiveOr(values.scaleY, 1), height),
    rotation: finiteOr(values.angle, 0),
  };
}

export function readTextTransform(values: FabricTextTransformValues): TextTransformSnapshot {
  const transform = readTransform(values);
  const fontSize = positiveOr(values.fontSize, 1);
  return {
    ...transform,
    fontSize: multipliedPositiveOr(
      fontSize,
      positiveOr(values.scaleY, 1),
      fontSize,
    ),
  };
}

function commonOptions(element: DesignElement) {
  return {
    left: element.x,
    top: element.y,
    angle: element.rotation,
    opacity: element.opacity,
    originX: 'left' as const,
    originY: 'top' as const,
    lockScalingFlip: true,
    lockSkewingX: true,
    lockSkewingY: true,
  };
}

function createTextControls() {
  const textControls = controlsUtils.createTextboxDefaultControls();
  const scaleControls = controlsUtils.createObjectDefaultControls();
  return {
    ...textControls,
    tl: scaleControls.tl,
    tr: scaleControls.tr,
    bl: scaleControls.bl,
    br: scaleControls.br,
  };
}

function mapText(element: Extract<DesignElement, { type: 'text' }>): FabricObject {
  const textbox = new Textbox(element.text, {
    ...commonOptions(element),
    controls: createTextControls(),
    width: element.width,
    fontFamily: APPROVED_FONT_FAMILIES.has(element.fontFamily)
      ? element.fontFamily
      : 'system-ui',
    fontSize: element.fontSize,
    fontWeight: element.fontWeight,
    fill: element.color,
    textAlign: element.textAlign,
    splitByGrapheme: true,
    scaleX: 1,
    scaleY: 1,
  });

  textbox.setControlsVisibility({ mt: false, mb: false });
  return textbox;
}

function mapShape(element: Extract<DesignElement, { type: 'shape' }>): FabricObject {
  if (element.shape === 'rectangle') {
    return new Rect({ ...commonOptions(element), width: element.width, height: element.height, fill: element.fill });
  }
  const ellipse = new Ellipse({
    ...commonOptions(element), rx: element.width / 2, ry: element.height / 2, fill: element.fill,
  });
  if (element.shape === 'circle') {
    ellipse.setControlsVisibility({ ml: false, mr: false, mt: false, mb: false });
  }
  return ellipse;
}

export function applyImageCrop(image: FabricImage, element: ImageElement): void {
  const original = image.getOriginalSize();
  const sourceWidth = positiveOr(original.width, element.width);
  const sourceHeight = positiveOr(original.height, element.height);
  const frameAspect = element.width / element.height;
  const sourceAspect = sourceWidth / sourceHeight;

  let coverWidth = sourceWidth;
  let coverHeight = sourceHeight;
  if (sourceAspect > frameAspect) {
    coverWidth = sourceHeight * frameAspect;
  } else if (sourceAspect < frameAspect) {
    coverHeight = sourceWidth / frameAspect;
  }

  const zoom = clampImageCropZoom(element.cropZoom ?? 1);
  const cropWidth = coverWidth / zoom;
  const cropHeight = coverHeight / zoom;
  const focusX = (clampImageCropFocus(element.cropFocusX ?? 0) + 1) / 2;
  const focusY = (clampImageCropFocus(element.cropFocusY ?? 0) + 1) / 2;
  const cropX = (sourceWidth - cropWidth) * focusX;
  const cropY = (sourceHeight - cropHeight) * focusY;

  image.set({
    cropX,
    cropY,
    width: cropWidth,
    height: cropHeight,
    scaleX: element.width / cropWidth,
    scaleY: element.height / cropHeight,
  });
}

async function mapImage(
  element: Extract<DesignElement, { type: 'image' }>,
  assetGateway: Pick<AssetGateway, 'resolveUrl'>,
  options: ElementMappingOptions,
): Promise<FabricObject> {
  try {
    const image = await FabricImage.fromURL(await assetGateway.resolveUrl(element.assetId));
    image.set(commonOptions(element));
    applyImageCrop(image, element);
    return image;
  } catch (error) {
    if (options.imageFailureMode === 'throw') {
      throw new Error(`이미지를 렌더링할 수 없습니다: ${element.assetId}`, { cause: error });
    }
    return new Rect({
      ...commonOptions(element),
      width: element.width,
      height: element.height,
      fill: '#f7f2f5',
      stroke: '#b4235a',
      strokeWidth: 6,
      strokeDashArray: [18, 12],
      strokeUniform: true,
    });
  }
}

export async function elementToFabricObject(
  element: DesignElement,
  assetGateway: Pick<AssetGateway, 'resolveUrl'>,
  options: ElementMappingOptions = {},
): Promise<FabricObject> {
  const object = element.type === 'text'
    ? mapText(element)
    : element.type === 'shape'
      ? mapShape(element)
      : await mapImage(element, assetGateway, options);
  return setElementId(object, element.id);
}

export async function pageToFabricObjects(
  page: DesignPage,
  assetGateway: Pick<AssetGateway, 'resolveUrl'>,
  options: ElementMappingOptions = {},
): Promise<FabricObject[]> {
  return Promise.all(page.elements.map((element) => elementToFabricObject(element, assetGateway, options)));
}
