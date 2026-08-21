import { expect, type Page } from '@playwright/test';

import { readPngMetadata } from '../src/features/editor/lib/png-metadata';

export interface StoredElement {
  id: string;
  type: 'text' | 'image' | 'shape';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
  fontSize?: number;
  assetId?: string;
}

export interface StoredDesign {
  version: number;
  width: number;
  height: number;
  pages: Array<{ elements: StoredElement[] }>;
}

export interface StoredDesignRecord {
  cardId: string;
  current: unknown;
  backup: unknown | null;
  updatedAt: number;
}

export async function waitForEditorReady(page: Page): Promise<void> {
  await expect(page.getByTestId('editor-canvas')).toBeVisible();
  await page.waitForFunction(() => {
    const canvas = document.querySelector<HTMLCanvasElement>('canvas[aria-label="생일 카드 편집 캔버스"]');
    return canvas?.width === 1080 && canvas.height === 1350;
  });
}

export async function readDesignRecord(
  page: Page,
  cardId: string,
): Promise<StoredDesignRecord | undefined> {
  return page.evaluate(async (requestedCardId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('birthday-canvas');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      return await new Promise<StoredDesignRecord | undefined>((resolve, reject) => {
        const request = database
          .transaction('design-records')
          .objectStore('design-records')
          .get(requestedCardId);
        request.onsuccess = () => resolve(request.result as StoredDesignRecord | undefined);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }, cardId);
}

export async function readSavedDesign(page: Page, cardId: string): Promise<StoredDesign> {
  const record = await readDesignRecord(page, cardId);
  if (!record) throw new Error(`저장된 카드가 없습니다: ${cardId}`);
  return record.current as StoredDesign;
}

export async function waitForInitialDesignSave(page: Page, cardId: string): Promise<void> {
  await expect.poll(async () => {
    const record = await readDesignRecord(page, cardId);
    const current = record?.current as Partial<StoredDesign> | undefined;
    return current?.version === 1 && current.width === 1080 && current.height === 1350;
  }).toBe(true);
}

export async function seedDesignRecord(
  page: Page,
  record: StoredDesignRecord,
): Promise<void> {
  await page.evaluate(async (seed) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('birthday-canvas');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction('design-records', 'readwrite');
        transaction.objectStore('design-records').put(seed);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }, record);
}

export function findElement(design: StoredDesign, elementId: string): StoredElement {
  const element = design.pages[0]?.elements.find((candidate) => candidate.id === elementId);
  if (!element) throw new Error(`저장 요소가 없습니다: ${elementId}`);
  return element;
}

async function canvasMetrics(page: Page) {
  const box = await page.getByTestId('editor-canvas-frame').boundingBox();
  if (!box) throw new Error('Canvas 위치를 찾을 수 없습니다.');
  return { box, scale: box.width / 1080 };
}

export async function dragElementOnCanvas(
  page: Page,
  element: StoredElement,
  delta: { x: number; y: number },
): Promise<void> {
  const { box, scale } = await canvasMetrics(page);
  const start = {
    x: box.x + (element.x + element.width / 2) * scale,
    y: box.y + (element.y + element.height / 2) * scale,
  };
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(
    start.x + delta.x * scale,
    start.y + delta.y * scale,
    { steps: 8 },
  );
  await page.mouse.up();
}

export async function resizeElementFromBottomRight(
  page: Page,
  element: StoredElement,
  delta: { width: number; height: number },
): Promise<void> {
  const { box, scale } = await canvasMetrics(page);
  const handle = {
    x: box.x + (element.x + element.width) * scale,
    y: box.y + (element.y + element.height) * scale,
  };
  await page.mouse.move(handle.x, handle.y);
  await page.mouse.down();
  await page.mouse.move(
    handle.x + delta.width * scale,
    handle.y + delta.height * scale,
    { steps: 8 },
  );
  await page.mouse.up();
}

export async function expectPngDimensions(
  download: import('@playwright/test').Download,
  width = 1080,
  height = 1350,
): Promise<void> {
  const { readFile } = await import('node:fs/promises');
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('다운로드 파일 경로가 없습니다.');
  const png = await readFile(downloadPath);
  expect(readPngMetadata(png)).toEqual({ width, height });
}

export async function expectZoomEdgesAndCanvasIdentity(page: Page): Promise<void> {
  const canvas = page.getByLabel('생일 카드 편집 캔버스');
  await canvas.evaluate((element) => { element.dataset.zoomIdentity = 'stable'; });

  for (let index = 0; index < 3; index += 1) {
    await page.getByRole('button', { name: '축소' }).click();
  }
  await expect(page.getByText('25%')).toBeVisible();
  const fit = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('[data-testid="editor-canvas-viewport"]');
    const stage = document.querySelector<HTMLElement>('[data-testid="editor-canvas-zoom-stage"]');
    if (!viewport || !stage) throw new Error('zoom layout을 찾을 수 없습니다.');
    const viewportRect = viewport.getBoundingClientRect();
    const stageRect = stage.getBoundingClientRect();
    return {
      horizontalOverflow: viewport.scrollWidth - viewport.clientWidth,
      verticalOverflow: viewport.scrollHeight - viewport.clientHeight,
      leftGap: stageRect.left - viewportRect.left,
      rightGap: viewportRect.right - stageRect.right,
      topGap: stageRect.top - viewportRect.top,
      bottomGap: viewportRect.bottom - stageRect.bottom,
    };
  });
  expect(fit, `25% fit metrics: ${JSON.stringify(fit)}`).toMatchObject({
    horizontalOverflow: 0,
    verticalOverflow: 0,
  });
  expect(fit.leftGap).toBeGreaterThanOrEqual(0);
  expect(fit.rightGap).toBeGreaterThanOrEqual(0);
  expect(fit.topGap).toBeGreaterThanOrEqual(0);
  expect(fit.bottomGap).toBeGreaterThanOrEqual(0);

  for (let index = 0; index < 7; index += 1) {
    await page.getByRole('button', { name: '확대' }).click();
  }
  await expect(page.getByText('200%')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('[data-testid="editor-canvas-viewport"]');
    return Boolean(viewport && viewport.scrollHeight > viewport.clientHeight);
  })).toBe(true);

  const edges = await page.evaluate(() => {
    const viewport = document.querySelector<HTMLElement>('[data-testid="editor-canvas-viewport"]');
    const stage = document.querySelector<HTMLElement>('[data-testid="editor-canvas-zoom-stage"]');
    if (!viewport || !stage) throw new Error('zoom layout을 찾을 수 없습니다.');
    viewport.scrollTo({ left: 0, top: 0 });
    const startViewport = viewport.getBoundingClientRect();
    const startStage = stage.getBoundingClientRect();
    const start = {
      left: startStage.left - startViewport.left,
      top: startStage.top - startViewport.top,
    };
    viewport.scrollTo({
      left: viewport.scrollWidth - viewport.clientWidth,
      top: viewport.scrollHeight - viewport.clientHeight,
    });
    const endViewport = viewport.getBoundingClientRect();
    const endStage = stage.getBoundingClientRect();
    return {
      ...start,
      right: endStage.right - endViewport.right,
      bottom: endStage.bottom - endViewport.bottom,
      canvasIdentity: document.querySelector<HTMLCanvasElement>('canvas[aria-label="생일 카드 편집 캔버스"]')?.dataset.zoomIdentity,
    };
  });
  expect(edges.left).toBeGreaterThanOrEqual(0);
  expect(edges.top).toBeGreaterThanOrEqual(0);
  expect(edges.right).toBeLessThanOrEqual(0);
  expect(edges.bottom).toBeLessThanOrEqual(0);
  expect(edges.canvasIdentity).toBe('stable');
}
