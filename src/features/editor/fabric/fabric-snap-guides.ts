import { Line, type Canvas, type FabricObject } from 'fabric';

import { getElementId } from './fabric-object-metadata';

const FALLBACK_SNAP_THRESHOLD = 12;
const SCREEN_SNAP_THRESHOLD_PX = 8;
const MIN_DESIGN_THRESHOLD = 4;
const MAX_DESIGN_THRESHOLD = 32;
const GUIDE_STROKE = '#b52262';

type Axis = 'x' | 'y';

type SnapPoint = {
  value: number;
  guide: number;
};

type SnapResult = {
  delta: number;
  guide: number;
} | null;

function objectSnapPoints(object: FabricObject, axis: Axis): SnapPoint[] {
  object.setCoords();
  const bounds = object.getBoundingRect();
  if (axis === 'x') {
    return [
      { value: bounds.left, guide: bounds.left },
      { value: bounds.left + bounds.width / 2, guide: bounds.left + bounds.width / 2 },
      { value: bounds.left + bounds.width, guide: bounds.left + bounds.width },
    ];
  }
  return [
    { value: bounds.top, guide: bounds.top },
    { value: bounds.top + bounds.height / 2, guide: bounds.top + bounds.height / 2 },
    { value: bounds.top + bounds.height, guide: bounds.top + bounds.height },
  ];
}

function canvasSnapPoints(canvas: Canvas, axis: Axis): SnapPoint[] {
  const size = axis === 'x' ? canvas.getWidth() : canvas.getHeight();
  return [
    { value: 0, guide: 0 },
    { value: size / 2, guide: size / 2 },
    { value: size, guide: size },
  ];
}

function designSnapThreshold(canvas: Canvas): number {
  const renderedWidth = canvas.lowerCanvasEl?.getBoundingClientRect().width;
  const designWidth = canvas.getWidth();
  if (!renderedWidth || !Number.isFinite(renderedWidth) || !designWidth || !Number.isFinite(designWidth)) {
    return FALLBACK_SNAP_THRESHOLD;
  }
  const cssScale = renderedWidth / designWidth;
  if (!Number.isFinite(cssScale) || cssScale <= 0) return FALLBACK_SNAP_THRESHOLD;
  return Math.min(
    MAX_DESIGN_THRESHOLD,
    Math.max(MIN_DESIGN_THRESHOLD, SCREEN_SNAP_THRESHOLD_PX / cssScale),
  );
}

function closestSnap(
  moving: SnapPoint[],
  references: SnapPoint[],
  threshold: number,
): SnapResult {
  let best: SnapResult = null;
  for (const source of moving) {
    for (const reference of references) {
      const delta = reference.value - source.value;
      if (Math.abs(delta) > threshold) continue;
      if (!best || Math.abs(delta) < Math.abs(best.delta)) {
        best = { delta, guide: reference.guide };
      }
    }
  }
  return best;
}

function guideLine(axis: Axis, value: number, canvas: Canvas): Line {
  const points: [number, number, number, number] = axis === 'x'
    ? [value, 0, value, canvas.getHeight()]
    : [0, value, canvas.getWidth(), value];
  return new Line(points, {
    stroke: GUIDE_STROKE,
    strokeWidth: 2,
    strokeDashArray: [10, 8],
    selectable: false,
    evented: false,
    excludeFromExport: true,
    opacity: 0.85,
  });
}

export class FabricSnapGuides {
  private guides: Line[] = [];

  constructor(private readonly canvas: Canvas) {}

  handleMoving(object: FabricObject | undefined): void {
    if (!object || !getElementId(object)) return;
    this.clear(false);

    const referenceObjects = this.canvas.getObjects()
      .filter((candidate) => candidate !== object && Boolean(getElementId(candidate)));
    const xReferences = [
      ...canvasSnapPoints(this.canvas, 'x'),
      ...referenceObjects.flatMap((candidate) => objectSnapPoints(candidate, 'x')),
    ];
    const yReferences = [
      ...canvasSnapPoints(this.canvas, 'y'),
      ...referenceObjects.flatMap((candidate) => objectSnapPoints(candidate, 'y')),
    ];
    const threshold = designSnapThreshold(this.canvas);

    const xSnap = closestSnap(objectSnapPoints(object, 'x'), xReferences, threshold);
    const ySnap = closestSnap(objectSnapPoints(object, 'y'), yReferences, threshold);

    if (xSnap) object.set({ left: (object.left ?? 0) + xSnap.delta });
    if (ySnap) object.set({ top: (object.top ?? 0) + ySnap.delta });
    if (xSnap || ySnap) object.setCoords();

    if (xSnap) this.guides.push(guideLine('x', xSnap.guide, this.canvas));
    if (ySnap) this.guides.push(guideLine('y', ySnap.guide, this.canvas));
    if (this.guides.length > 0) this.canvas.add(...this.guides);
    this.canvas.requestRenderAll();
  }

  clear(requestRender = true): void {
    if (this.guides.length === 0) return;
    this.canvas.remove(...this.guides);
    this.guides = [];
    if (requestRender) this.canvas.requestRenderAll();
  }
}
