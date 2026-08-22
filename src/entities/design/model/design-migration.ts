import type { z } from 'zod';

import {
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_SHAPE_COLOR,
  DEFAULT_TEXT_COLOR,
  normalizeHexColor,
} from './color-policy';
import { DESIGN_VERSION, type Design } from './design';
import type { DesignElement } from './element';
import { designSchema, designV1Schema, designV2Schema } from './design-schema';
import { clampImageCropFocus, clampImageCropZoom } from './image-crop-policy';
import { clampTextFontSize } from './text-policy';

const APPROVED_FONT_FAMILIES = new Set(['system-ui', 'Arial', 'Georgia']);

type MigrationFailureReason = 'corrupt' | 'unsupported-version';
type SafeParseResult =
  | { success: true; data: unknown }
  | { success: false };
type PersistedSchema = { safeParse(input: unknown): SafeParseResult };
type MigrationStep = (input: unknown) => unknown;
type DesignV1 = z.infer<typeof designV1Schema>;
type DesignV2 = z.infer<typeof designV2Schema>;

type VersionMigrationResult =
  | { status: 'ok'; value: unknown }
  | { status: 'error'; reason: MigrationFailureReason };

export type DesignMigrationResult =
  | { status: 'ok'; design: Design; changed: boolean }
  | { status: 'error'; reason: MigrationFailureReason };

function uniqueMigratedId(base: string, seen: Set<string>): string {
  if (!seen.has(base)) {
    seen.add(base);
    return base;
  }
  let suffix = 2;
  let candidate = `${base}~${suffix}`;
  while (seen.has(candidate)) {
    suffix += 1;
    candidate = `${base}~${suffix}`;
  }
  seen.add(candidate);
  return candidate;
}

function migrateV1ToV2(input: unknown): unknown {
  const design = input as DesignV1;
  const pageIds = new Set<string>();
  return {
    ...design,
    version: 2 as const,
    pages: design.pages.map((page) => {
      const elementIds = new Set<string>();
      return {
        ...page,
        id: uniqueMigratedId(page.id, pageIds),
        elements: page.elements.map((element) => ({
          ...element,
          id: uniqueMigratedId(element.id, elementIds),
        })),
      };
    }),
  };
}

function migrateV2ToV3(input: unknown): unknown {
  const design = input as DesignV2;
  return {
    ...design,
    version: 3 as const,
    pages: design.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) => element.type === 'image'
        ? { ...element, cropZoom: 1, cropX: 0, cropY: 0 }
        : element),
    })),
  };
}

/** Keep every shipped schema registered so each migration parses its source exactly. */
const persistedSchemas = new Map<number, PersistedSchema>([
  [1, designV1Schema],
  [2, designV2Schema],
]);

/** Key = source version. Every migration upgrades exactly one version. */
const migrationSteps = new Map<number, MigrationStep>([
  [1, migrateV1ToV2],
  [2, migrateV2ToV3],
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

  const cropZoom = clampImageCropZoom(element.cropZoom ?? 1);
  const cropX = clampImageCropFocus(element.cropX ?? 0);
  const cropY = clampImageCropFocus(element.cropY ?? 0);
  if (
    cropZoom === element.cropZoom
    && cropX === element.cropX
    && cropY === element.cropY
  ) {
    return { element, changed: false };
  }
  return {
    element: { ...element, cropZoom, cropX, cropY },
    changed: true,
  };
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

function migrateToCurrentVersion(input: unknown, version: number): VersionMigrationResult {
  let currentVersion = version;
  let current: unknown = input;

  while (currentVersion < DESIGN_VERSION) {
    const schema = persistedSchemas.get(currentVersion);
    const migration = migrationSteps.get(currentVersion);
    if (!schema || !migration) return { status: 'error', reason: 'unsupported-version' };

    const parsed = schema.safeParse(current);
    if (!parsed.success) return { status: 'error', reason: 'corrupt' };
    try {
      current = migration(parsed.data);
    } catch {
      return { status: 'error', reason: 'corrupt' };
    }
    currentVersion += 1;
  }

  return { status: 'ok', value: current };
}

/**
 * Single entry point for persisted Design JSON. Each historical version is
 * parsed with its frozen schema and upgraded one version at a time before the
 * final current-schema parse and runtime normalization.
 */
export function migratePersistedDesign(input: unknown): DesignMigrationResult {
  const version = readVersion(input);
  if (version === null) return { status: 'error', reason: 'corrupt' };
  if (version < 1 || version > DESIGN_VERSION) {
    return { status: 'error', reason: 'unsupported-version' };
  }

  const migrated = migrateToCurrentVersion(input, version);
  if (migrated.status === 'error') return migrated;

  const parsed = designSchema.safeParse(migrated.value);
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
