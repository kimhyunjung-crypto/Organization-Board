import { expect, test } from "@playwright/test";

test.describe("S00.03 Imaging Spike (Face Detection, EXIF, Crop & Interactive Harness)", () => {
  test("loads imaging spike at /?spike=imaging with dedicated worker", async ({ page }) => {
    await page.goto("/?spike=imaging");

    // Check header
    await expect(page.locator("h1")).toHaveText("조직보드 사진 자동·수동 편집 Spike");

    // Wait for worker face detection on default single-face case
    await expect(page.locator("text=완료 (1명 검출")).toBeVisible({ timeout: 15_000 });

    // Verify diagnostic metrics table
    await expect(page.locator("text=1254 × 1254 px")).toBeVisible();
    await expect(page.locator("text=정상 0°")).toBeVisible();
    await expect(page.locator("tr:has-text('검출 얼굴 수') td:nth-child(2)")).toHaveText("1명");

    // Verify roundtrip <= 1px passes
    await expect(page.locator("text=기준 충족: 합격")).toBeVisible();

    // Verify card photo canvas exists and has 265 x 311 dimensions
    const cardCanvas = page.locator("section:has-text('22.4 × 26.3mm 카드 인쇄 미리보기') canvas");
    await expect(cardCanvas).toBeVisible();

    const canvasDims = await cardCanvas.evaluate((el: HTMLCanvasElement) => ({
      width: el.width,
      height: el.height,
    }));
    expect(canvasDims.width).toBe(265);
    expect(canvasDims.height).toBe(311);

    // Verify canvas has non-transparent image pixels
    const hasPixels = await cardCanvas.evaluate((el: HTMLCanvasElement) => {
      const ctx = el.getContext("2d");
      if (!ctx) return false;
      const imgData = ctx.getImageData(0, 0, el.width, el.height);
      let nonZero = 0;
      for (let i = 0; i < imgData.data.length; i += 4) {
        if (imgData.data[i + 3]! > 0) nonZero++;
      }
      return nonZero > el.width * el.height * 0.9;
    });
    expect(hasPixels).toBe(true);
  });

  test("handles no-face test case with center cover fallback and user confirmation", async ({ page }) => {
    await page.goto("/?spike=imaging");

    // Click No Face test case
    await page.click("button:has-text('얼굴 없음')");

    // Expect 0 faces detected and fallback to cover
    await expect(page.locator("text=완료 (0명 검출")).toBeVisible({ timeout: 15_000 });

    // Expect NO_FACE warning banner
    await expect(page.locator("text=[NO_FACE]")).toBeVisible();
    await expect(page.locator("text=얼굴 미탐지")).toBeVisible();

    // Expect confirmation required
    await expect(page.locator("text=확인 대기 중")).toBeVisible();

    // Click "이 사진 사용" button
    const confirmButton = page.locator("button:has-text('이 사진 사용')");
    await expect(confirmButton).toBeEnabled();
    await confirmButton.click();

    // Status should update to confirmed
    await expect(page.locator("text=확인 완료 (사용 승인)")).toBeVisible();
  });

  test("handles multiple faces test case with cover fallback and warning", async ({ page }) => {
    await page.goto("/?spike=imaging");

    // Click Multiple Faces test case
    await page.click("button:has-text('다중 얼굴')");

    // Expect 2 faces detected
    await expect(page.locator("text=완료 (2명 검출")).toBeVisible({ timeout: 15_000 });

    // Expect MULTIPLE_FACES warning banner
    await expect(page.locator("text=[MULTIPLE_FACES]")).toBeVisible();
    await expect(page.locator("text=다중 얼굴: 2명의 얼굴이 감지되었습니다.")).toBeVisible();

    // Confirm photo works
    await page.click("button:has-text('이 사진 사용')");
    await expect(page.locator("text=확인 완료 (사용 승인)")).toBeVisible();
  });

  test("handles edge face clamping and low resolution warnings", async ({ page }) => {
    await page.goto("/?spike=imaging");

    // Test low resolution case (200x200)
    await page.click("button:has-text('저해상도 이미지')");
    await expect(page.locator("text=[LOW_RESOLUTION]")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=인쇄 권장 해상도(265 × 311px) 미만")).toBeVisible();

    // Test edge clamped face
    await page.click("button:has-text('가장자리 인접 얼굴')");
    await expect(page.locator("text=완료 (1명 검출")).toBeVisible({ timeout: 15_000 });
    await expect(
      page.locator("text=구도 편차 초과").or(page.locator("text=얼굴 경계가 크롭 영역 바깥으로 잘립니다")),
    ).toBeVisible({ timeout: 15_000 });
  });

  test("supports interactive zoom, center preservation, pan, and resets", async ({ page }) => {
    await page.goto("/?spike=imaging");
    await expect(page.locator("text=완료 (1명 검출")).toBeVisible({ timeout: 15_000 });

    // Initial zoom and crop text
    const initialCropText = await page.locator("tr:has-text('크롭 좌표') td:nth-child(2)").innerText();

    // Adjust zoom slider
    const zoomSlider = page.locator("input[type='range']");
    await zoomSlider.fill("2.5");

    await expect(page.locator("span:has-text('2.50x')")).toBeVisible();

    // Crop coordinates should have changed
    const zoomedCropText = await page.locator("tr:has-text('크롭 좌표') td:nth-child(2)").innerText();
    expect(zoomedCropText).not.toBe(initialCropText);

    // Roundtrip accuracy must still be <= 1px
    await expect(page.locator("text=기준 충족: 합격")).toBeVisible();

    // Click "원본 기준 초기화 (중앙 Cover)"
    await page.click("button:has-text('원본 기준 초기화')");
    await expect(page.locator("span:has-text('1.00x')")).toBeVisible();

    // Click "자동 초기화"
    await page.click("button:has-text('자동 초기화')");
    const restoredCropText = await page.locator("tr:has-text('크롭 좌표') td:nth-child(2)").innerText();
    expect(restoredCropText).toBe(initialCropText);
  });

  test("validates real JPEG EXIF orientation fixtures 1, 3, 6, 8 with upright detection", async ({ page }) => {
    await page.goto("/?spike=imaging");

    // EXIF Orientation 1 (Normal)
    await page.click("button:has-text('EXIF Orientation 1')");
    await expect(page.locator("text=600 × 500 px")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=완료 (1명 검출")).toBeVisible();
    await expect(page.locator("tr:has-text('EXIF 회전 태그') td:nth-child(2)")).toHaveText("1 (정상 0°)");

    // EXIF Orientation 3 (180 deg)
    await page.click("button:has-text('EXIF Orientation 3')");
    await expect(page.locator("text=600 × 500 px")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=완료 (1명 검출")).toBeVisible();
    await expect(page.locator("tr:has-text('EXIF 회전 태그') td:nth-child(2)")).toContainText("Orientation 3");

    // EXIF Orientation 6 (90 deg CW, raw 500x600 -> oriented 600x500)
    await page.click("button:has-text('EXIF Orientation 6')");
    await expect(page.locator("text=600 × 500 px")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=완료 (1명 검출")).toBeVisible();
    await expect(page.locator("tr:has-text('EXIF 회전 태그') td:nth-child(2)")).toContainText("Orientation 6");

    // EXIF Orientation 8 (270 deg CW, raw 500x600 -> oriented 600x500)
    await page.click("button:has-text('EXIF Orientation 8')");
    await expect(page.locator("text=600 × 500 px")).toBeVisible({ timeout: 15_000 });
    await expect(page.locator("text=완료 (1명 검출")).toBeVisible();
    await expect(page.locator("tr:has-text('EXIF 회전 태그') td:nth-child(2)")).toContainText("Orientation 8");

    // All must pass roundtrip <= 1px
    await expect(page.locator("text=기준 충족: 합격")).toBeVisible();
  });
});
