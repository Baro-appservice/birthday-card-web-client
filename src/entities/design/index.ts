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
  type ElementTransformSnapshot,
  type ImageElement,
  type ShapeElement,
  type TextElement,
  type TextTransformSnapshot,
  type TransformSnapshot,
} from './model/element';
export {
  collectDesignAssetIds,
  collectElementAssetIds,
  collectUnknownAssetIds,
} from './model/asset-references';
export {
  designElementSchema,
  designPageSchema,
  designSchema,
  designV1Schema,
  imageElementSchema,
  shapeElementSchema,
  textElementSchema,
} from './model/design-schema';
export {
  type DesignMigrationResult,
  migratePersistedDesign,
  normalizeDesign,
  prepareDesignForPersistence,
} from './model/design-migration';
export {
  TEXT_FONT_SIZE_MAX,
  TEXT_FONT_SIZE_MIN,
  assertTextFontSize,
  clampTextFontSize,
  isValidTextFontSize,
} from './model/text-policy';
export {
  addElement,
  moveElement,
  removeElement,
  replaceElement,
  setPageBackground,
} from './model/design-operations';
export { createSampleDesign } from './model/sample-design';
