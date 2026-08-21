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
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: 'rectangle' | 'circle';
  fill: string;
}

export type DesignElement = TextElement | ImageElement | ShapeElement;
