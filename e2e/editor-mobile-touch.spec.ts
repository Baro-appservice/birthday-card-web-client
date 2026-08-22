import { expect, test } from '@playwright/test';

import { waitForEditorReady } from './editor-helpers';

test('실제 touch context에서 Canvas 요소를 탭해 속성 시트를 열고 선택을 유지한 채 접는다', async ({ page }) => {
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

  const sheet = page.getByRole('dialog', { name: '선택한 요소 편집' });
  await expect(sheet).toBeVisible();
  await expect(page.getByRole('textbox', { name: '선택한 텍스트 내용' }))
    .toHaveValue('오늘은 제 생일이에요!');

  await sheet.getByRole('button', { name: '속성 시트 닫기' }).click();
  const reopen = page.getByRole('button', { name: '선택한 요소 속성 열기' });
  await expect(reopen).toBeVisible();
  await reopen.click();
  await expect(page.getByRole('dialog', { name: '선택한 요소 편집' })).toBeVisible();
});
