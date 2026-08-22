import { expect, test } from '@playwright/test';

import {
  findElement,
  readSavedDesign,
  waitForEditorReady,
  waitForInitialDesignSave,
} from './editor-helpers';

test('선택 요소를 정렬·회전·투명도 편집·복제하고 Undo한다', async ({ page }) => {
  const cardId = 'e2e-selection-actions';
  await page.goto(`/editor/${cardId}`);
  await waitForEditorReady(page);
  await waitForInitialDesignSave(page, cardId);

  await page.getByRole('button', { name: '레이어' }).click();
  await page.getByRole('button', { name: '오늘은 제 생일이에요! 레이어 선택' }).click();
  const before = await readSavedDesign(page, cardId);
  const beforeTitle = findElement(before, 'title');
  const beforeCount = before.pages[0]?.elements.length ?? 0;

  await page.getByRole('button', { name: '캔버스 왼쪽에 맞춤' }).click();
  await expect.poll(async () => findElement(await readSavedDesign(page, cardId), 'title').x)
    .toBeCloseTo(0, 4);

  const rotation = page.getByRole('spinbutton', { name: '회전 각도' });
  await rotation.fill('30');
  await rotation.press('Tab');
  await expect.poll(async () => findElement(await readSavedDesign(page, cardId), 'title').rotation)
    .toBe(30);

  const opacity = page.getByRole('slider', { name: '투명도' });
  await opacity.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '60';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await expect.poll(async () => findElement(await readSavedDesign(page, cardId), 'title').opacity)
    .toBe(0.6);

  await page.getByRole('button', { name: '복제' }).click();
  await expect.poll(async () => (await readSavedDesign(page, cardId)).pages[0]?.elements.length)
    .toBe(beforeCount + 1);

  const duplicated = (await readSavedDesign(page, cardId)).pages[0]?.elements
    .filter((element) => element.type === 'text' && element.text === beforeTitle.text)
    .find((element) => element.id !== 'title');
  expect(duplicated).toBeTruthy();
  expect(duplicated?.x).toBeCloseTo(32, 4);
  expect(duplicated?.rotation).toBe(30);
  expect(duplicated?.opacity).toBe(0.6);

  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect.poll(async () => (await readSavedDesign(page, cardId)).pages[0]?.elements.length)
    .toBe(beforeCount);
});
