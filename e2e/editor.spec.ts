import { expect, test } from '@playwright/test';

import {
  expectPngDimensions,
  expectZoomEdgesAndCanvasIdentity,
  dragElementOnCanvas,
  findElement,
  readDesignRecord,
  readSavedDesign,
  seedDesignRecord,
  resizeElementFromBottomRight,
  waitForEditorReady,
  waitForInitialDesignSave,
  type StoredDesign,
} from './editor-helpers';

test('25%와 200%에서 모든 Canvas edge에 접근하고 같은 Canvas를 유지한다', async ({ page }) => {
  await page.goto('/editor/e2e-desktop-zoom');
  await waitForEditorReady(page);

  await expectZoomEdgesAndCanvasIdentity(page);
});

test('Shift와 marquee는 사용자 다중 선택이나 저장되지 않는 group transform을 만들지 않는다', async ({ page }) => {
  const cardId = 'e2e-single-selection';
  await page.goto(`/editor/${cardId}`);
  await waitForEditorReady(page);
  await waitForInitialDesignSave(page, cardId);
  const initial = await readSavedDesign(page, cardId);
  const title = findElement(initial, 'title');
  const name = findElement(initial, 'name');
  const frame = page.getByTestId('editor-canvas-frame');
  const box = await frame.boundingBox();
  if (!box) throw new Error('Canvas 위치를 찾을 수 없습니다.');
  const scale = box.width / 1080;
  const point = (element: typeof title) => ({
    x: box.x + (element.x + element.width / 2) * scale,
    y: box.y + (element.y + element.height / 2) * scale,
  });

  await page.mouse.click(point(title).x, point(title).y);
  await page.keyboard.down('Shift');
  await page.mouse.click(point(name).x, point(name).y);
  await page.keyboard.up('Shift');
  await dragElementOnCanvas(page, name, { x: 70, y: 40 });

  await expect.poll(async () => findElement(await readSavedDesign(page, cardId), 'name').x)
    .toBeGreaterThan(name.x);
  expect(findElement(await readSavedDesign(page, cardId), 'title').x).toBe(title.x);

  const beforeMarquee = await readSavedDesign(page, cardId);
  const beforeMarqueeTitle = findElement(beforeMarquee, 'title');
  const beforeMarqueeName = findElement(beforeMarquee, 'name');
  await page.mouse.move(box.x + 10 * scale, box.y + 10 * scale);
  await page.mouse.down();
  await page.mouse.move(box.x + 1060 * scale, box.y + 410 * scale, { steps: 8 });
  await page.mouse.up();
  await dragElementOnCanvas(page, beforeMarqueeTitle, { x: 60, y: 30 });

  await expect.poll(async () => findElement(await readSavedDesign(page, cardId), 'title').x)
    .toBeGreaterThan(beforeMarqueeTitle.x);
  expect(findElement(await readSavedDesign(page, cardId), 'name').x).toBe(beforeMarqueeName.x);
  await page.reload();
  await waitForEditorReady(page);
  expect(findElement(await readSavedDesign(page, cardId), 'title').x).toBeGreaterThan(beforeMarqueeTitle.x);
});

test('자기 생일 카드를 편집하고 저장·복원·다운로드한다', async ({ page }) => {
  const cardId = 'e2e-desktop-flow';
  const changedText = '올해도 제 생일을 축하해 주세요!';
  await page.goto(`/editor/${cardId}`);
  await waitForEditorReady(page);
  await waitForInitialDesignSave(page, cardId);

  await page.getByRole('button', { name: '레이어' }).click();
  await page.getByRole('button', { name: '오늘은 제 생일이에요! 레이어 선택' }).click();
  await page.getByRole('textbox', { name: '선택한 텍스트 내용' }).fill(changedText);
  await expect.poll(async () => (
    findElement(await readSavedDesign(page, cardId), 'title').text
  )).toBe(changedText);

  await page.getByRole('button', { name: '사진', exact: true }).click();
  await page.getByLabel('사진 파일 선택').setInputFiles({
    name: 'birthday.png',
    mimeType: 'image/png',
    buffer: await page.screenshot({ type: 'png' }),
  });
  await expect.poll(async () => {
    const design = await readSavedDesign(page, cardId);
    return design.pages[0]?.elements.some(
      (element) => element.type === 'image' && element.assetId?.startsWith('asset:'),
    );
  }).toBe(true);

  await page.getByRole('button', { name: '레이어' }).click();
  await page.getByRole('button', { name: `${changedText} 레이어 선택` }).click();
  const originalTitle = findElement(await readSavedDesign(page, cardId), 'title');
  await dragElementOnCanvas(page, originalTitle, { x: 120, y: 60 });

  await expect.poll(async () => findElement(
    await readSavedDesign(page, cardId),
    'title',
  ).x).toBeGreaterThan(130);
  const movedX = findElement(await readSavedDesign(page, cardId), 'title').x;

  await page.getByRole('button', { name: '실행 취소' }).click();
  await expect.poll(async () => findElement(
    await readSavedDesign(page, cardId),
    'title',
  ).x).toBe(130);

  await page.getByRole('button', { name: '다시 실행' }).click();
  await expect.poll(async () => findElement(
    await readSavedDesign(page, cardId),
    'title',
  ).x).toBe(movedX);

  await page.getByRole('button', { name: `${changedText} 레이어 선택` }).click();
  const beforeResize = findElement(await readSavedDesign(page, cardId), 'title');
  await resizeElementFromBottomRight(page, beforeResize, { width: 140, height: 90 });
  await expect.poll(async () => {
    const title = findElement(await readSavedDesign(page, cardId), 'title');
    return title.width > beforeResize.width && title.height > beforeResize.height;
  }).toBe(true);
  const resizedTitle = findElement(await readSavedDesign(page, cardId), 'title');

  await page.reload();
  await waitForEditorReady(page);
  await page.getByRole('button', { name: '레이어' }).click();
  await expect(page.getByRole('button', { name: `${changedText} 레이어 선택` })).toBeVisible();
  const restoredTitle = findElement(await readSavedDesign(page, cardId), 'title');
  expect(restoredTitle.x).toBeCloseTo(resizedTitle.x, 8);
  expect(restoredTitle.width).toBeCloseTo(resizedTitle.width, 8);
  expect(restoredTitle.height).toBeCloseTo(resizedTitle.height, 8);

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG 저장' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe(`birthday-${cardId}.png`);
  await expectPngDimensions(download);

  const serialized = JSON.stringify(await readSavedDesign(page, cardId));
  expect(serialized).not.toContain('blob:');
  expect(serialized).not.toContain('fabric');
});

test('손상된 현재 카드는 선택 전까지 유지하고 직전 정상 카드로 복구한다', async ({ page }) => {
  const cardId = 'e2e-corrupt-recovery';
  await page.goto(`/editor/${cardId}`);
  await waitForEditorReady(page);
  await expect.poll(() => readDesignRecord(page, cardId)).toBeTruthy();
  const valid = (await readDesignRecord(page, cardId))?.current as StoredDesign;
  const corrupt = { version: 1, width: 'broken', height: 1350, pages: [] };
  await seedDesignRecord(page, {
    cardId,
    current: corrupt,
    backup: valid,
    updatedAt: 101,
  });

  await page.reload();
  await expect(page.getByRole('dialog', { name: '저장된 카드를 복구할까요?' })).toBeVisible();
  await page.waitForTimeout(750);
  expect((await readDesignRecord(page, cardId))?.current).toEqual(corrupt);

  await page.getByRole('button', { name: '직전 정상 카드 복구' }).click();
  await waitForEditorReady(page);
  await expect.poll(async () => (await readSavedDesign(page, cardId)).width).toBe(1080);
  expect((await readDesignRecord(page, cardId))?.backup).toEqual(valid);
});

test('지원하지 않는 문서는 선택 전까지 유지하고 backup이 없으면 샘플로 복구한다', async ({ page }) => {
  const cardId = 'e2e-unsupported-recovery';
  await page.goto(`/editor/${cardId}`);
  await waitForEditorReady(page);
  await expect.poll(() => readDesignRecord(page, cardId)).toBeTruthy();
  const unsupported = { version: 999 };
  await seedDesignRecord(page, {
    cardId,
    current: unsupported,
    backup: null,
    updatedAt: 202,
  });

  await page.reload();
  await expect(page.getByRole('dialog', { name: '저장된 카드를 복구할까요?' })).toBeVisible();
  expect(page.getByRole('button', { name: '직전 정상 카드 복구' })).toHaveCount(0);
  await page.waitForTimeout(750);
  expect((await readDesignRecord(page, cardId))?.current).toEqual(unsupported);

  await page.getByRole('button', { name: '샘플 카드로 다시 시작' }).click();
  await waitForEditorReady(page);
  await expect.poll(async () => (await readSavedDesign(page, cardId)).version).toBe(1);
  expect((await readDesignRecord(page, cardId))?.backup).toBeNull();
});
