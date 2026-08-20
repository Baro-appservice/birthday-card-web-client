import type { DesignElement, DesignPage, TransformSnapshot } from '@/entities/design';
import type { AssetGateway } from '@/features/editor/core/ports';
import { Ellipse, FabricImage, Rect, Textbox, type FabricObject } from 'fabric';

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

const finiteOr = (value: number | undefined, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const positiveOr = (value: number | undefined, fallback: number) => {
  const normalized = finiteOr(value, fallback);
  return Math.abs(normalized) > 0 ? Math.abs(normalized) : fallback;
};

export function readTransform(values: FabricTransformValues): TransformSnapshot {
  const width = positiveOr(values.width, 1);
  const height = positiveOr(values.height, 1);
  return {
    x: finiteOr(values.left, 0),
    y: finiteOr(values.top, 0),
    width: width * positiveOr(values.scaleX, 1),
    height: height * positiveOr(values.scaleY, 1),
    rotation: finiteOr(values.angle, 0),
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
  };
}

function mapText(element: Extract<DesignElement, { type: 'text' }>): FabricObject {
  return new Textbox(element.text, {
    ...commonOptions(element),
    width: element.width,
    fontFamily: element.fontFamily,
    fontSize: element.fontSize,
    fontWeight: element.fontWeight,
    fill: element.color,
    textAlign: element.textAlign,
  });
}

function mapShape(element: Extract<DesignElement, { type: 'shape' }>): FabricObject {
  if (element.shape === 'rectangle') {
    return new Rect({ ...commonOptions(element), width: element.width, height: element.height, fill: element.fill });
  }
  return new Ellipse({
    ...commonOptions(element), rx: element.width / 2, ry: element.height / 2, fill: element.fill,
  });
}

async function mapImage(
  element: Extract<DesignElement, { type: 'image' }>,
  assetGateway: Pick<AssetGateway, 'resolveUrl'>,
): Promise<FabricObject> {
  const image = await FabricImage.fromURL(await assetGateway.resolveUrl(element.assetId));
  const intrinsicWidth = positiveOr(image.width, element.width);
  const intrinsicHeight = positiveOr(image.height, element.height);
  image.set({
    ...commonOptions(element),
    scaleX: element.width / intrinsicWidth,
    scaleY: element.height / intrinsicHeight,
  });
  return image;
}

export async function elementToFabricObject(
  element: DesignElement,
  assetGateway: Pick<AssetGateway, 'resolveUrl'>,
): Promise<FabricObject> {
  const object = element.type === 'text'
    ? mapText(element)
    : element.type === 'shape'
      ? mapShape(element)
      : await mapImage(element, assetGateway);
  return setElementId(object, element.id);
}

export async function pageToFabricObjects(
  page: DesignPage,
  assetGateway: Pick<AssetGateway, 'resolveUrl'>,
): Promise<FabricObject[]> {
  return Promise.all(page.elements.map((element) => elementToFabricObject(element, assetGateway)));
}
