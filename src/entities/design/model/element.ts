export interface BaseElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface TransformSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface TextTransformSnapshot extends TransformSnapshot {
  fontSize: number;
}

export type ElementTransformSnapshot = TransformSnapshot | TextTransformSnapshot;

export interface TextElement extends Omit<BaseElement, 'height'> {
  /**
   * @deprecated v1 persistence compatibility only.
   * Text layout height is content-derived and must not be used as a render source of truth.
   */
  height: number;
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: 'left' | 'center' | 'right';
}

export interface ImageElement extends BaseElement {
  type: 'image';
  assetId: string;
  /** 1 = cover 기본값, 3 = cover 대비 3배 확대. */
  cropZoom: number;
  /** -1 = 가능한 가장 왼쪽, 0 = 중앙, 1 = 가능한 가장 오른쪽 focus. */
  cropFocusX: number;
  /** -1 = 가능한 가장 위, 0 = 중앙, 1 = 가능한 가장 아래 focus. */
  cropFocusY: number;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: 'rectangle' | 'circle' | 'ellipse';
  fill: string;
}

export type DesignElement = TextElement | ImageElement | ShapeElement;
