import {
  clampTextFontSize,
  type DesignElement,
  type ElementTransformSnapshot,
  type TransformSnapshot,
} from '@/entities/design';
import type { DesignStore } from '@/features/editor/model/design-store';

import type { EditorCommand } from '../core/editor-command';

interface TransformChange {
  before: ElementTransformSnapshot;
  after: ElementTransformSnapshot;
}

type Anchor = 'tl' | 'tr' | 'bl' | 'br' | 'center';
type Point = { x: number; y: number };

function findElement(store: DesignStore, pageId: string, elementId: string): DesignElement {
  const page = store.getState().design.pages.find((candidate) => candidate.id === pageId);
  if (!page) throw new Error(`존재하지 않는 페이지입니다: ${pageId}`);
  const element = page.elements.find((candidate) => candidate.id === elementId);
  if (!element) throw new Error(`존재하지 않는 요소입니다: ${elementId}`);
  return element;
}

function rotatedOffset(x: number, y: number, rotation: number): Point {
  const radians = rotation * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function anchors(transform: TransformSnapshot): Record<Anchor, Point> {
  const right = rotatedOffset(transform.width, 0, transform.rotation);
  const bottom = rotatedOffset(0, transform.height, transform.rotation);
  return {
    tl: { x: transform.x, y: transform.y },
    tr: { x: transform.x + right.x, y: transform.y + right.y },
    bl: { x: transform.x + bottom.x, y: transform.y + bottom.y },
    br: {
      x: transform.x + right.x + bottom.x,
      y: transform.y + right.y + bottom.y,
    },
    center: {
      x: transform.x + (right.x + bottom.x) / 2,
      y: transform.y + (right.y + bottom.y) / 2,
    },
  };
}

function squaredDistance(left: Point, right: Point): number {
  const dx = left.x - right.x;
  const dy = left.y - right.y;
  return dx * dx + dy * dy;
}

function inferFixedAnchor(before: TransformSnapshot, after: TransformSnapshot): Anchor {
  const beforeAnchors = anchors(before);
  const afterAnchors = anchors(after);
  const candidates: readonly Anchor[] = ['tl', 'tr', 'bl', 'br', 'center'];
  let best: Anchor = 'tl';
  let bestDistance = squaredDistance(beforeAnchors.tl, afterAnchors.tl);
  for (const candidate of candidates.slice(1)) {
    const distance = squaredDistance(beforeAnchors[candidate], afterAnchors[candidate]);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best;
}

function topLeftForFixedAnchor(
  fixedAnchor: Anchor,
  fixedPoint: Point,
  width: number,
  height: number,
  rotation: number,
): Point {
  const localOffset = fixedAnchor === 'tl'
    ? { x: 0, y: 0 }
    : fixedAnchor === 'tr'
      ? { x: width, y: 0 }
      : fixedAnchor === 'bl'
        ? { x: 0, y: height }
        : fixedAnchor === 'br'
          ? { x: width, y: height }
          : { x: width / 2, y: height / 2 };
  const offset = rotatedOffset(localOffset.x, localOffset.y, rotation);
  return { x: fixedPoint.x - offset.x, y: fixedPoint.y - offset.y };
}

function normalizeAnchoredSize(
  before: TransformSnapshot,
  after: TransformSnapshot,
  width: number,
  height: number,
): { x: number; y: number; width: number; height: number } {
  if (width === after.width && height === after.height) {
    return { x: after.x, y: after.y, width, height };
  }
  const fixedAnchor = inferFixedAnchor(before, after);
  const fixedPoint = anchors(after)[fixedAnchor];
  const topLeft = topLeftForFixedAnchor(
    fixedAnchor,
    fixedPoint,
    width,
    height,
    after.rotation,
  );
  return { x: topLeft.x, y: topLeft.y, width, height };
}

function applyTextTransform(
  element: Extract<DesignElement, { type: 'text' }>,
  beforeTransform: ElementTransformSnapshot,
  transform: ElementTransformSnapshot,
  enforcePolicy: boolean,
): DesignElement {
  const rawFontSize = 'fontSize' in transform ? transform.fontSize : element.fontSize;
  const fontSize = enforcePolicy ? clampTextFontSize(rawFontSize) : rawFontSize;
  const scaleCorrection = enforcePolicy && rawFontSize > 0 ? fontSize / rawFontSize : 1;
  const width = transform.width * scaleCorrection;
  const visualHeight = transform.height * scaleCorrection;
  const geometry = enforcePolicy
    ? normalizeAnchoredSize(beforeTransform, transform, width, visualHeight)
    : { x: transform.x, y: transform.y, width, height: visualHeight };

  return {
    ...element,
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    // v1 compatibility field only. Text height is content-derived and must not
    // be overwritten by Fabric scale/measurement values.
    height: element.height,
    rotation: transform.rotation,
    fontSize,
  };
}

function applyShapeTransform(
  element: Extract<DesignElement, { type: 'shape' }>,
  beforeTransform: ElementTransformSnapshot,
  transform: ElementTransformSnapshot,
): DesignElement {
  if (element.shape !== 'circle') {
    return {
      ...element,
      x: transform.x,
      y: transform.y,
      width: transform.width,
      height: transform.height,
      rotation: transform.rotation,
    };
  }

  const size = Math.max(transform.width, transform.height);
  const geometry = normalizeAnchoredSize(beforeTransform, transform, size, size);
  return {
    ...element,
    x: geometry.x,
    y: geometry.y,
    width: size,
    height: size,
    rotation: transform.rotation,
  };
}

function applyTransform(
  element: DesignElement,
  beforeTransform: ElementTransformSnapshot,
  transform: ElementTransformSnapshot,
  enforceTextPolicy: boolean,
): DesignElement {
  if (element.type === 'text') {
    return applyTextTransform(element, beforeTransform, transform, enforceTextPolicy);
  }
  if (element.type === 'shape') {
    return applyShapeTransform(element, beforeTransform, transform);
  }

  return {
    ...element,
    x: transform.x,
    y: transform.y,
    width: transform.width,
    height: transform.height,
    rotation: transform.rotation,
  };
}

export class TransformElementCommand implements EditorCommand {
  private readonly before: DesignElement;
  private readonly after: DesignElement;

  constructor(
    private readonly store: DesignStore,
    private readonly pageId: string,
    private readonly elementId: string,
    change: TransformChange,
  ) {
    const element = findElement(store, pageId, elementId);
    this.before = applyTransform(element, change.before, change.before, false);
    this.after = applyTransform(element, change.before, change.after, true);
  }

  execute(): void {
    this.store.getState().replaceElement(this.pageId, this.elementId, this.after);
  }

  undo(): void {
    this.store.getState().replaceElement(this.pageId, this.elementId, this.before);
  }
}
