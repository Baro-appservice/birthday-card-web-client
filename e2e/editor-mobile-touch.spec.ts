import { expect, test } from '@playwright/test';

import { waitForEditorReady } from './editor-helpers';

test('실제 touch context에서 Canvas 요소를 탭해 속성 시트를 연다', async ({ page }) => {
  await page.goto('/editor/e2e-mobile-touch');
  await waitForEditorReady(page);

  const canvas = page.getByTestId('editor-canvas-frame');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('모바일 Canvas 위치를 찾을 수 없습니다.');
  const scale = box.width / 1080;

  await canvas.tap({
    position: {
      x: (130 + 410) * scale,
      y: (130 + 65) * scale,
    },
  });

  await expect(page.getByRole('dialog', { name: '선택한 요소 편집' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '선택한 텍스트 내용' }))
    .toHaveValue('오늘은 제 생일이에요!');
});
