export {
  DESIGN_HEIGHT,
  DESIGN_VERSION,
  DESIGN_WIDTH,
  type Design,
  type DesignPage,
} from './model/design';
export {
  type BaseElement,
  type DesignElement,
  type ImageElement,
  type ShapeElement,
  type TextElement,
  type TransformSnapshot,
} from './model/element';
export {
  designElementSchema,
  designPageSchema,
  designSchema,
  imageElementSchema,
  shapeElementSchema,
  textElementSchema,
} from './model/design-schema';
export {
  addElement,
  moveElement,
  removeElement,
  replaceElement,
  setPageBackground,
} from './model/design-operations';
export { createSampleDesign } from './model/sample-design';
