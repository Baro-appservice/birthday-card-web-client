import { expect, test } from '@playwright/test';

import {
  expectPngDimensions,
  findElement,
  readSavedDesign,
  waitForEditorReady,
  waitForInitialDesignSave,
} from './editor-helpers';

test.use({ viewport: { width: 390, height: 844 } });

test('390px에서 텍스트를 편집하고 Undo·Redo·저장·PNG를 완료한다', async ({ page }) => {
  const cardId = 'e2e-mobile-flow';
  const changedText = '모바일에서도 함께 축하해 주세요!';
  await page.goto(`/editor/${cardId}`);
  await waitForEditorReady(page);
  await waitForInitialDesignSave(page, cardId);

  await expect(page.getByRole('toolbar', { name: '모바일 편집 도구' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: '데스크톱 편집 도구' })).toHaveCount(0);

  const canvas = page.getByTestId('editor-canvas-frame');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('모바일 Canvas 위치를 찾을 수 없습니다.');
  const scale = box.width / 1080;
  await canvas.click({
    position: {
      x: (130 + 410) * scale,
      y: (130 + 65) * scale,
    },
  });

  const sheet = page.getByRole('dialog', { name: '선택한 요소 편집' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('textbox', { name: '선택한 텍스트 내용' }).fill(changedText);
  await expect.poll(async () => (
    findElement(await readSavedDesign(page, cardId), 'title').text
  )).toBe(changedText);
  await sheet.getByRole('button', { name: '속성 시트 닫기' }).click();

  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect.poll(async () => (
    findElement(await readSavedDesign(page, cardId), 'title').text
  )).toBe('오늘은 제 생일이에요!');

  await page.getByRole('button', { name: '다시 실행' }).click();
  await expect.poll(async () => (
    findElement(await readSavedDesign(page, cardId), 'title').text
  )).toBe(changedText);
  await expect(page.getByText('저장됨', { exact: true })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG 저장' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`birthday-${cardId}.png`);
  await expectPngDimensions(download);
});

test.describe('tablet smoke', () => {
  test.use({ viewport: { width: 820, height: 1180 } });

  test('820px에서 drawer와 잘리지 않은 Canvas를 표시한다', async ({ page }) => {
    await page.goto('/editor/e2e-tablet-smoke');
    await waitForEditorReady(page);

    const drawerButton = page.getByRole('button', { name: '편집 도구 열기' });
    await expect(drawerButton).toBeVisible();
    await drawerButton.click();
    await expect(page.getByRole('navigation', { name: '태블릿 편집 도구' })).toBeVisible();

    const box = await page.getByTestId('editor-canvas-frame').boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(820);
    expect(box!.y + box!.height).toBeLessThanOrEqual(1180);
  });
});
