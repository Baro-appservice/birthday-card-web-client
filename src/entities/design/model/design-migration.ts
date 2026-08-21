import type { Design } from './design';
import { DESIGN_VERSION } from './design';
import type { DesignElement } from './element';
import { designSchema } from './design-schema';
import { clampTextFontSize } from './text-policy';

const APPROVED_FONT_FAMILIES = new Set(['system-ui', 'Arial', 'Georgia']);

type MigrationFailureReason = 'corrupt' | 'unsupported-version';

export type DesignMigrationResult =
  | { status: 'ok'; design: Design; changed: boolean }
  | { status: 'error'; reason: MigrationFailureReason };

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
    if (fontSize === element.fontSize && fontFamily === element.fontFamily) {
      return { element, changed: false };
    }
    return {
      element: { ...element, fontSize, fontFamily },
      changed: true,
    };
  }
  if (element.type === 'shape') return normalizeCircle(element);
  return { element, changed: false };
}

export function normalizeDesign(design: Design): { design: Design; changed: boolean } {
  let changed = false;
  const pages = design.pages.map((page) => {
    let pageChanged = false;
    const elements = page.elements.map((element) => {
      const normalized = normalizeElement(element);
      if (normalized.changed) pageChanged = true;
      return normalized.element;
    });
    if (!pageChanged) return page;
    changed = true;
    return { ...page, elements };
  });
  return changed ? { design: { ...design, pages }, changed: true } : { design, changed: false };
}

function readVersion(input: unknown): number | null {
  if (typeof input !== 'object' || input === null || !('version' in input)) return null;
  return typeof input.version === 'number' && Number.isInteger(input.version) ? input.version : null;
}

/**
 * Single entry point for persisted Design JSON.
 * Future versions should be upgraded one version at a time here before the
 * final current-schema parse/normalization step.
 */
export function migratePersistedDesign(input: unknown): DesignMigrationResult {
  const version = readVersion(input);
  if (version !== DESIGN_VERSION) {
    return { status: 'error', reason: version === null ? 'corrupt' : 'unsupported-version' };
  }

  const parsed = designSchema.safeParse(input);
  if (!parsed.success) return { status: 'error', reason: 'corrupt' };
  const normalized = normalizeDesign(parsed.data);
  return { status: 'ok', design: structuredClone(normalized.design), changed: normalized.changed };
}

export function prepareDesignForPersistence(design: Design): Design {
  const normalized = normalizeDesign(design).design;
  return structuredClone(designSchema.parse(normalized));
}
