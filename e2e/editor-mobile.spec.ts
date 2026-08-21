import { expect, test } from '@playwright/test';

import {
  dragElementOnCanvas,
  expectPngDimensions,
  findElement,
  readSavedDesign,
  resizeElementFromBottomRight,
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

  await page.getByRole('button', { name: '사진' }).click();
  const photoSheet = page.getByRole('dialog', { name: '사진 추가' });
  await expect(photoSheet).toBeVisible();
  await photoSheet.getByLabel('사진 파일 선택').setInputFiles({
    name: 'mobile-birthday.png',
    mimeType: 'image/png',
    buffer: await page.screenshot({ type: 'png' }),
  });
  await expect.poll(async () => {
    const design = await readSavedDesign(page, cardId);
    return design.pages[0]?.elements.some(
      (element) => element.type === 'image' && element.assetId?.startsWith('asset:'),
    );
  }).toBe(true);
  const uploaded = (await readSavedDesign(page, cardId)).pages[0]!.elements.find(
    (element) => element.type === 'image' && element.assetId?.startsWith('asset:'),
  );
  if (!uploaded) throw new Error('업로드한 모바일 ImageElement를 찾을 수 없습니다.');

  const imageSheet = page.getByRole('dialog', { name: '선택한 요소 편집' });
  await expect(imageSheet).toBeVisible();
  await imageSheet.getByRole('button', { name: '속성 시트 닫기' }).click();
  await dragElementOnCanvas(page, uploaded, { x: 110, y: 75 });
  await expect.poll(async () => {
    const moved = findElement(await readSavedDesign(page, cardId), uploaded.id);
    return moved.x > uploaded.x && moved.y > uploaded.y;
  }).toBe(true);
  const movedImage = findElement(await readSavedDesign(page, cardId), uploaded.id);

  await resizeElementFromBottomRight(page, movedImage, { width: 120, height: 90 });
  await expect.poll(async () => {
    const resized = findElement(await readSavedDesign(page, cardId), uploaded.id);
    return resized.width > movedImage.width && resized.height > movedImage.height;
  }).toBe(true);
  const persistedImage = findElement(await readSavedDesign(page, cardId), uploaded.id);

  await page.reload();
  await waitForEditorReady(page);
  const restored = await readSavedDesign(page, cardId);
  expect(findElement(restored, 'title').text).toBe(changedText);
  expect(findElement(restored, uploaded.id)).toMatchObject({
    assetId: uploaded.assetId,
    x: persistedImage.x,
    y: persistedImage.y,
    width: persistedImage.width,
    height: persistedImage.height,
  });

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
