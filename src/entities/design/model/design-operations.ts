import type { DesignElement } from './element';
import type { DesignPage } from './design';

function findElementIndex(page: DesignPage, elementId: string): number {
  const index = page.elements.findIndex((element) => element.id === elementId);
  if (index < 0) throw new Error(`존재하지 않는 요소입니다: ${elementId}`);
  return index;
}

export function addElement(page: DesignPage, element: DesignElement): DesignPage {
  if (page.elements.some((candidate) => candidate.id === element.id)) {
    throw new Error(`이미 존재하는 요소 ID입니다: ${element.id}`);
  }
  return { ...page, elements: [...page.elements, element] };
}

export function replaceElement(
  page: DesignPage,
  elementId: string,
  replacement: DesignElement,
): DesignPage {
  const index = findElementIndex(page, elementId);
  if (replacement.id !== elementId && page.elements.some((element) => element.id === replacement.id)) {
    throw new Error(`이미 존재하는 요소 ID입니다: ${replacement.id}`);
  }
  const elements = page.elements.slice();
  elements[index] = replacement;
  return { ...page, elements };
}

export function removeElement(page: DesignPage, elementId: string): DesignPage {
  const index = findElementIndex(page, elementId);
  return {
    ...page,
    elements: [...page.elements.slice(0, index), ...page.elements.slice(index + 1)],
  };
}

export function moveElement(
  page: DesignPage,
  elementId: string,
  targetIndex: number,
): DesignPage {
  const sourceIndex = findElementIndex(page, elementId);
  if (!Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= page.elements.length) {
    throw new Error(`유효하지 않은 레이어 위치입니다: ${targetIndex}`);
  }

  const elements = page.elements.slice();
  const [element] = elements.splice(sourceIndex, 1);
  elements.splice(targetIndex, 0, element);
  return { ...page, elements };
}

export function setPageBackground(page: DesignPage, background: string): DesignPage {
  return { ...page, background };
}
