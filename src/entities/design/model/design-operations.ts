import type { DesignElement } from './element';
import type { DesignPage } from './design';

function findElementIndex(page: DesignPage, elementId: string): number {
  const index = page.elements.findIndex((element) => element.id === elementId);
  if (index < 0) throw new Error(`존재하지 않는 요소입니다: ${elementId}`);
  return index;
}

export function addElement(page: DesignPage, element: DesignElement): DesignPage {
  return { ...page, elements: [...page.elements, element] };
}

export function replaceElement(
  page: DesignPage,
  elementId: string,
  replacement: DesignElement,
): DesignPage {
  const index = findElementIndex(page, elementId);
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
