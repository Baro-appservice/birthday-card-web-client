import type { FabricObject } from 'fabric';

const elementIds = new WeakMap<FabricObject, string>();

export function setElementId(object: FabricObject, elementId: string): FabricObject {
  elementIds.set(object, elementId);
  return object;
}

export function getElementId(object: FabricObject | undefined): string | undefined {
  return object ? elementIds.get(object) : undefined;
}
