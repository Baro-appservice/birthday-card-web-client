import { expect, test, type Locator } from '@playwright/test';

import {
  dragElementOnCanvas,
  findElement,
  readSavedDesign,
  waitForEditorReady,
  waitForInitialDesignSave,
} from './editor-helpers';

async function setRangeValue(locator: Locator, value: number): Promise<void> {
  await locator.evaluate((element, nextValue) => {
    const input = element as HTMLInputElement;
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!valueSetter) throw new Error('range value setter를 찾을 수 없습니다.');
    valueSetter.call(input, String(nextValue));
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await locator.blur();
}

test('사진 crop 확대·위치를 저장하고 재로드해 복원하며 Undo한다', async ({ page }) => {
  const cardId = 'e2e-image-crop';
  await page.goto(`/editor/${cardId}`);
  await waitForEditorReady(page);
  await waitForInitialDesignSave(page, cardId);

  await page.getByRole('button', { name: '레이어' }).click();
  await page.getByRole('button', { name: '사진 레이어 선택' }).click();

  await setRangeValue(page.getByRole('slider', { name: '사진 확대' }), 180);
  await setRangeValue(page.getByRole('slider', { name: '사진 가로 위치' }), 50);
  await setRangeValue(page.getByRole('slider', { name: '사진 세로 위치' }), -40);

  await expect.poll(async () => findElement(await readSavedDesign(page, cardId), 'photo').cropZoom)
    .toBe(1.8);
  expect(findElement(await readSavedDesign(page, cardId), 'photo')).toMatchObject({
    cropFocusX: 0.5,
    cropFocusY: -0.4,
  });

  await page.reload();
  await waitForEditorReady(page);
  await page.getByRole('button', { name: '레이어' }).click();
  await page.getByRole('button', { name: '사진 레이어 선택' }).click();

  await expect(page.getByRole('slider', { name: '사진 확대' })).toHaveValue('180');
  await expect(page.getByRole('slider', { name: '사진 가로 위치' })).toHaveValue('50');
  await expect(page.getByRole('slider', { name: '사진 세로 위치' })).toHaveValue('-40');

  await page.getByRole('button', { name: '사진 위치 초기화' }).click();
  await expect.poll(async () => findElement(await readSavedDesign(page, cardId), 'photo').cropZoom)
    .toBe(1);
  expect(findElement(await readSavedDesign(page, cardId), 'photo')).toMatchObject({
    cropFocusX: 0,
    cropFocusY: 0,
  });

  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect.poll(async () => findElement(await readSavedDesign(page, cardId), 'photo').cropZoom)
    .toBe(1.8);
  expect(findElement(await readSavedDesign(page, cardId), 'photo')).toMatchObject({
    cropFocusX: 0.5,
    cropFocusY: -0.4,
  });
});

test('요소를 캔버스 중앙 근처로 이동하면 중심 guide에 snap해 저장한다', async ({ page }) => {
  const cardId = 'e2e-center-snap';
  await page.goto(`/editor/${cardId}`);
  await waitForEditorReady(page);
  await waitForInitialDesignSave(page, cardId);

  await page.getByRole('button', { name: '레이어' }).click();
  await page.getByRole('button', { name: '오늘은 제 생일이에요! 레이어 선택' }).click();
  const original = findElement(await readSavedDesign(page, cardId), 'title');

  await dragElementOnCanvas(page, original, { x: 50, y: 0 });
  await expect.poll(async () => findElement(await readSavedDesign(page, cardId), 'title').x)
    .toBeGreaterThan(original.x);
  const moved = findElement(await readSavedDesign(page, cardId), 'title');

  const nearCenteredX = 135;
  await dragElementOnCanvas(page, moved, { x: nearCenteredX - moved.x, y: 0 });

  await expect.poll(async () => findElement(await readSavedDesign(page, cardId), 'title').x)
    .toBeCloseTo(130, 4);
});
