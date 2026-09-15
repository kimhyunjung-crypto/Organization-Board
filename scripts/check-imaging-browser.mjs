import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from '@playwright/test';

// Independent integration regression against the real browser decoder and Canvas.
// Run against the Vite development server: node scripts/check-imaging-browser.mjs
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.goto(process.argv[2] ?? 'http://127.0.0.1:5173/?spike=imaging');
  const result = await page.evaluate(async () => {
    const { normalizeImageOrientation } = await import('/src/technical/imaging/exif.ts');
    const { computeFaceCrop } = await import('/src/technical/imaging/crop.ts');
    const missingEyes = computeFaceCrop({
      width: 1000, height: 1000,
      faceBox: { x: 300, y: 300, width: 200, height: 220 },
    });
    const expected = [
      ['R', 'G', 'B', 'Y'], ['G', 'R', 'Y', 'B'],
      ['Y', 'B', 'G', 'R'], ['B', 'Y', 'R', 'G'],
      ['R', 'B', 'G', 'Y'], ['B', 'R', 'Y', 'G'],
      ['Y', 'G', 'B', 'R'], ['G', 'Y', 'R', 'B'],
    ];
    const colors = { R: [240, 20, 20], G: [20, 220, 20], B: [20, 20, 240], Y: [240, 220, 20] };
    const checks = [];
    for (const [width, height] of [[256, 256], [320, 240]]) {
      const source = document.createElement('canvas');
      source.width = width; source.height = height;
      const ctx = source.getContext('2d');
      ['R', 'G', 'B', 'Y'].forEach((color, index) => {
        ctx.fillStyle = `rgb(${colors[color].join(',')})`;
        ctx.fillRect((index % 2) * width / 2, Math.floor(index / 2) * height / 2, width / 2, height / 2);
      });
      const jpeg = await new Promise(resolve => source.toBlob(resolve, 'image/jpeg', 0.98));
      const raw = new Uint8Array(await jpeg.arrayBuffer());
      for (let orientation = 1; orientation <= 8; orientation++) {
        // APP1 Exif, little-endian TIFF, one SHORT orientation tag.
        const app1 = new Uint8Array([
          0xff,0xe1,0,34, 69,120,105,102,0,0, 73,73,42,0,8,0,0,0,
          1,0, 0x12,1,3,0,1,0,0,0,orientation,0,0,0, 0,0,0,0,
        ]);
        const tagged = new Blob([raw.slice(0,2), app1, raw.slice(2)], { type: 'image/jpeg' });
        const normalized = await normalizeImageOrientation(tagged);
        const canvas = normalized.canvas;
        const out = canvas.getContext('2d');
        const actual = [[0.2,0.2],[0.8,0.2],[0.2,0.8],[0.8,0.8]].map(([x,y]) => {
          const pixel = out.getImageData(Math.floor(canvas.width*x), Math.floor(canvas.height*y), 1, 1).data;
          return Object.entries(colors).sort((a,b) =>
            a[1].reduce((sum,c,i)=>sum+(c-pixel[i])**2,0) - b[1].reduce((sum,c,i)=>sum+(c-pixel[i])**2,0),
          )[0][0];
        });
        checks.push({ width, height, orientation, actual, expected: expected[orientation-1],
          pass: actual.join('') === expected[orientation-1].join('') });
      }
    }
    return { missingEyesRequiresConfirmation: missingEyes.requiresConfirmation, checks };
  });
  await mkdir('tmp', { recursive: true });
  await writeFile('tmp/imaging-browser-review.json', JSON.stringify(result, null, 2));
  const failures = result.checks.filter(check => !check.pass);
  console.log(JSON.stringify({ orientationCases: result.checks.length, failures,
    missingEyesRequiresConfirmation: result.missingEyesRequiresConfirmation }, null, 2));
  assert.equal(failures.length, 0, 'Real JPEG/Canvas orientation mismatch');
  assert.equal(result.missingEyesRequiresConfirmation, true, 'Missing eye landmarks require manual confirmation');
} finally {
  await browser.close();
}
