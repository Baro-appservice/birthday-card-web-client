import type { Design } from './design';
import type { DesignElement } from './element';

export function collectElementAssetIds(element: DesignElement): string[] {
  return element.type === 'image' && element.assetId.startsWith('asset:') ? [element.assetId] : [];
}

export function collectDesignAssetIds(design: Design): Set<string> {
  const ids = new Set<string>();
  for (const page of design.pages) {
    for (const element of page.elements) {
      for (const assetId of collectElementAssetIds(element)) ids.add(assetId);
    }
  }
  return ids;
}

/**
 * Conservative raw-record scanner used by GC. It intentionally does not
 * require a supported Design version so assets referenced by a future or
 * recoverable document are never deleted merely because this client cannot
 * parse that document yet.
 */
export function collectUnknownAssetIds(input: unknown, target = new Set<string>()): Set<string> {
  if (Array.isArray(input)) {
    for (const value of input) collectUnknownAssetIds(value, target);
    return target;
  }
  if (typeof input !== 'object' || input === null) return target;

  for (const [key, value] of Object.entries(input)) {
    if (key === 'assetId' && typeof value === 'string' && value.startsWith('asset:')) {
      target.add(value);
    } else {
      collectUnknownAssetIds(value, target);
    }
  }
  return target;
}
