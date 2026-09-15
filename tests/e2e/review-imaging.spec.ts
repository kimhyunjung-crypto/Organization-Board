import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';

test('model loading failure leaves manual editing usable without external requests', async ({ page }) => {
  const external: string[] = [];
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(url.hostname)) external.push(url.href);
  });
  await page.route('**/blaze_face_short_range.tflite', route => route.abort());
  await page.goto('/?spike=imaging');
  await expect(page.getByText('[DETECTION_FAILED]', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.locator('input[type="range"]').fill('2.5');
  await expect(page.locator('tr').filter({ hasText: '줌 배율' })).toContainText('2.50x');
  await page.getByRole('button', { name: '이 사진 사용 (확인 완료)', exact: true }).click();
  await expect(page.getByText('확인 완료 (사용 승인)', { exact: true })).toBeVisible();
  expect(external).toEqual([]);
});

test('a stalled model is terminated at the 10 second limit and permits manual recovery', async ({ page }) => {
  await page.route('**/blaze_face_short_range.tflite', async route => {
    await new Promise(resolve => setTimeout(resolve, 11_500));
    await route.abort().catch(() => undefined);
  });
  await page.goto('/?spike=imaging');
  await expect(page.getByText('[WORKER_TIMEOUT]', { exact: false })).toBeVisible({ timeout: 15_000 });
  await page.locator('input[type="range"]').fill('2');
  await expect(page.locator('tr').filter({ hasText: '줌 배율' })).toContainText('2.00x');
});

test('real inference on a large source maps back to original dimensions', async ({ page }) => {
  await page.goto('/?spike=imaging');
  await expect(page.getByText('완료 (1명 검출', { exact: false })).toBeVisible({ timeout: 15_000 });
  const source = await readFile('tests/fixtures/images/synthetic-portrait.png');
  const largeImage = await page.evaluate(async base64 => {
    const image = new Image();
    image.src = `data:image/png;base64,${base64}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.width * 2; canvas.height = image.height * 2;
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    return { data: canvas.toDataURL('image/png').split(',')[1]!, width: canvas.width, height: canvas.height };
  }, source.toString('base64'));
  await page.locator('input[type="file"]').setInputFiles({
    name: 'synthetic-large.png', mimeType: 'image/png', buffer: Buffer.from(largeImage.data, 'base64'),
  });
  await expect(page.locator('tr').filter({ hasText: '방향 보정 원본 크기' })).toContainText(`${largeImage.width} × ${largeImage.height}`);
  await expect(page.getByText('완료 (1명 검출', { exact: false })).toBeVisible({ timeout: 15_000 });
  await expect(page.locator('tr').filter({ hasText: '검출 얼굴 수' })).toContainText('1명');
  await expect(page.getByText('기준 충족: 합격', { exact: false })).toBeVisible();
});
