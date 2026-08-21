import { expect, type Page } from '@playwright/test';

export interface StoredElement {
  id: string;
  type: 'text' | 'image' | 'shape';
  x: number;
  y: number;
  width: number;
  height: number;
  text?: string;
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
  expect(png.subarray(1, 4).toString('ascii')).toBe('PNG');
  expect(png.readUInt32BE(16)).toBe(width);
  expect(png.readUInt32BE(20)).toBe(height);
}
