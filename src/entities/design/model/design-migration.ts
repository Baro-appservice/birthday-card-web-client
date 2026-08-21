import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_SHAPE_COLOR,
  DEFAULT_TEXT_COLOR,
  normalizeHexColor,
} from './color-policy';
import { DESIGN_VERSION, type Design } from './design';
import type { DesignElement } from './element';
import { designSchema, designV1Schema } from './design-schema';
import { clampTextFontSize } from './text-policy';

const APPROVED_FONT_FAMILIES = new Set(['system-ui', 'Arial', 'Georgia']);

type MigrationFailureReason = 'corrupt' | 'unsupported-version';
type SafeParseResult =
  | { success: true; data: unknown }
  | { success: false };
type PersistedSchema = { safeParse(input: unknown): SafeParseResult };
type MigrationStep = (input: unknown) => unknown;

export type DesignMigrationResult =
  | { status: 'ok'; design: Design; changed: boolean }
  | { status: 'error'; reason: MigrationFailureReason };

/**
 * Keep historical schemas registered forever once a persisted version ships.
 * A future Design v2 should add designV2Schema and a migrationSteps entry for 1.
 */
const persistedSchemas = new Map<number, PersistedSchema>([
  [1, designV1Schema],
]);

/**
 * Key = source version. Value upgrades exactly one version, e.g. 1 -> 2.
 * Keeping steps single-hop prevents future v3 work from silently bypassing the
 * compatibility rules that were needed for v1 data.
 */
const migrationSteps = new Map<number, MigrationStep>([
  // [1, migrateV1ToV2],
]);

function rotationOffset(x: number, y: number, degrees: number) {
  const radians = degrees * Math.PI / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

function normalizeCircle(element: Extract<DesignElement, { type: 'shape' }>) {
  if (element.shape !== 'circle' || element.width === element.height) {
    return { element, changed: false } as const;
  }

  const oldCenterOffset = rotationOffset(element.width / 2, element.height / 2, element.rotation);
  const center = { x: element.x + oldCenterOffset.x, y: element.y + oldCenterOffset.y };
  const size = Math.max(element.width, element.height);
  const newCenterOffset = rotationOffset(size / 2, size / 2, element.rotation);
  return {
    element: {
      ...element,
      x: center.x - newCenterOffset.x,
      y: center.y - newCenterOffset.y,
      width: size,
      height: size,
    },
    changed: true,
  } as const;
}

function normalizeElement(element: DesignElement): { element: DesignElement; changed: boolean } {
  if (element.type === 'text') {
    const fontSize = clampTextFontSize(element.fontSize);
    const fontFamily = APPROVED_FONT_FAMILIES.has(element.fontFamily)
      ? element.fontFamily
      : 'system-ui';
    const color = normalizeHexColor(element.color, DEFAULT_TEXT_COLOR);
    if (
      fontSize === element.fontSize
      && fontFamily === element.fontFamily
      && color === element.color
    ) {
      return { element, changed: false };
    }
    return {
      element: { ...element, fontSize, fontFamily, color },
      changed: true,
    };
  }
  if (element.type === 'shape') {
    const circle = normalizeCircle(element);
    const fill = normalizeHexColor(circle.element.fill, DEFAULT_SHAPE_COLOR);
    if (!circle.changed && fill === circle.element.fill) return circle;
    return {
      element: { ...circle.element, fill },
      changed: true,
    };
  }
  return { element, changed: false };
}

export function normalizeDesign(design: Design): { design: Design; changed: boolean } {
  let changed = false;
  const pages = design.pages.map((page) => {
    let pageChanged = false;
    const background = normalizeHexColor(page.background, DEFAULT_BACKGROUND_COLOR);
    if (background !== page.background) pageChanged = true;
    const elements = page.elements.map((element) => {
      const normalized = normalizeElement(element);
      if (normalized.changed) pageChanged = true;
      return normalized.element;
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, background, elements };
  });
  return changed ? { design: { ...design, pages }, changed: true } : { design, changed: false };
}

function readVersion(input: unknown): number | null {
  if (typeof input !== 'object' || input === null || !('version' in input)) return null;
  return typeof input.version === 'number' && Number.isInteger(input.version) ? input.version : null;
}

function migrateToCurrentVersion(input: unknown, version: number): unknown | null {
  let currentVersion = version;
  let current: unknown = input;

  while (currentVersion < DESIGN_VERSION) {
    const schema = persistedSchemas.get(currentVersion);
    const migration = migrationSteps.get(currentVersion);
    if (!schema || !migration) return null;

    const parsed = schema.safeParse(current);
    if (!parsed.success) return null;
    current = migration(parsed.data);
    currentVersion += 1;
  }

  return current;
}

/**
 * Single entry point for any persisted Design JSON. Older versions are parsed
 * with their frozen schema and upgraded one version at a time before the final
 * current-schema parse and runtime normalization.
 */
export function migratePersistedDesign(input: unknown): DesignMigrationResult {
  const version = readVersion(input);
  if (version === null) return { status: 'error', reason: 'corrupt' };
  if (version < 1 || version > DESIGN_VERSION) {
    return { status: 'error', reason: 'unsupported-version' };
  }

  const migrated = migrateToCurrentVersion(input, version);
  if (migrated === null) return { status: 'error', reason: 'unsupported-version' };

  const parsed = designSchema.safeParse(migrated);
  if (!parsed.success) return { status: 'error', reason: 'corrupt' };
  const normalized = normalizeDesign(parsed.data);
  return {
    status: 'ok',
    design: structuredClone(normalized.design),
    changed: version !== DESIGN_VERSION || normalized.changed,
  };
}

export function prepareDesignForPersistence(design: Design): Design {
  const normalized = normalizeDesign(design).design;
  return structuredClone(designSchema.parse(normalized));
}
