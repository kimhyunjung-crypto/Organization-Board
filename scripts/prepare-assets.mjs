#!/usr/bin/env node
/**
 * scripts/prepare-assets.mjs
 * 
 * Repeatable asset preparation script for org-board (S00.01).
 * Downloads and prepares:
 *  - NanumGothic-ExtraBold.ttf and OFL.txt from official google/fonts
 *  - blaze_face_short_range.tflite from official MediaPipe storage
 *  - WASM and JS loader files from installed @mediapipe/tasks-vision (when available)
 * 
 * Generates public/assets/manifest.json with pinned SHA-256 checksums, licenses, and sources.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_ASSETS_DIR = path.join(ROOT_DIR, 'public', 'assets');

// Pinned metadata for authoritative official sources
export const PINNED_ASSETS = {
  font: {
    relPath: 'fonts/NanumGothic-ExtraBold.ttf',
    publicPath: '/assets/fonts/NanumGothic-ExtraBold.ttf',
    source: 'https://raw.githubusercontent.com/google/fonts/133ccbee9a8b408eb71f31a36ccb9116f5c695ad/ofl/nanumgothic/NanumGothic-ExtraBold.ttf',
    version: '1.000 (google/fonts commit 133ccbee9a8b408eb71f31a36ccb9116f5c695ad)',
    license: 'OFL-1.1',
    sha256: '5c4568e5295a8c52bc30e7efa1ea6d2de43556268ef42daba93540a1ece691ae',
    expectedSize: 2112720,
    magicOffset: 0,
    magicHex: '00010000',
    description: 'Nanum Gothic ExtraBold 800 TTF font'
  },
  ofl: {
    relPath: 'fonts/OFL.txt',
    publicPath: '/assets/fonts/OFL.txt',
    source: 'https://raw.githubusercontent.com/google/fonts/133ccbee9a8b408eb71f31a36ccb9116f5c695ad/ofl/nanumgothic/OFL.txt',
    version: '1.1 (google/fonts commit 133ccbee9a8b408eb71f31a36ccb9116f5c695ad)',
    license: 'OFL-1.1',
    sha256: 'eeacf16032901d0ed0456876ec77b8f0fda6b3fecec7d972f8543eb602e6c30f',
    expectedSize: 4534,
    description: 'SIL Open Font License 1.1 for Nanum Gothic'
  },
  model: {
    relPath: 'models/blaze_face_short_range.tflite',
    publicPath: '/assets/models/blaze_face_short_range.tflite',
    source: 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
    version: 'v1 (float16)',
    license: 'Apache-2.0',
    sha256: 'b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f',
    expectedSize: 229746,
    magicOffset: 4,
    magicAscii: 'TFL3',
    description: 'MediaPipe BlazeFace short-range face detector TFLite model (float16)'
  }
};

/**
 * Calculates SHA-256 hash of a buffer
 */
export function computeSha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Downloads a file into buffer from URL
 */
async function fetchBinary(url) {
  console.log(`[DOWNLOAD] Fetching: ${url}`);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${url}: HTTP ${response.status} ${response.statusText}`);
  }
  const arrayBuf = await response.arrayBuffer();
  return Buffer.from(arrayBuf);
}

/**
 * Validates binary signature / magic bytes
 */
export function verifySignature(buffer, assetMeta) {
  if (assetMeta.magicHex) {
    const actualHex = buffer.subarray(assetMeta.magicOffset, assetMeta.magicOffset + (assetMeta.magicHex.length / 2)).toString('hex');
    if (actualHex.toLowerCase() !== assetMeta.magicHex.toLowerCase()) {
      throw new Error(`Magic bytes mismatch for ${assetMeta.relPath}: expected hex ${assetMeta.magicHex}, got ${actualHex}`);
    }
  }
  if (assetMeta.magicAscii) {
    const actualAscii = buffer.subarray(assetMeta.magicOffset, assetMeta.magicOffset + assetMeta.magicAscii.length).toString('ascii');
    if (actualAscii !== assetMeta.magicAscii) {
      throw new Error(`Magic bytes mismatch for ${assetMeta.relPath}: expected ascii ${assetMeta.magicAscii}, got ${actualAscii}`);
    }
  }
  return true;
}

/**
 * Prepares a single pinned asset
 */
async function preparePinnedAsset(key, meta) {
  const targetPath = path.join(PUBLIC_ASSETS_DIR, meta.relPath);
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  let buffer;
  let needDownload = true;

  if (fs.existsSync(targetPath)) {
    buffer = fs.readFileSync(targetPath);
    const existingHash = computeSha256(buffer);
    if (existingHash === meta.sha256) {
      console.log(`[CACHE OK] ${meta.relPath} matches pinned SHA-256 (${existingHash.slice(0, 12)}...)`);
      needDownload = false;
    } else {
      console.warn(`[REPLACE] ${meta.relPath} hash mismatch (found ${existingHash}, expected ${meta.sha256}). Re-downloading.`);
    }
  }

  if (needDownload) {
    buffer = await fetchBinary(meta.source);
    const downloadedHash = computeSha256(buffer);
    if (downloadedHash !== meta.sha256) {
      throw new Error(`Downloaded content SHA-256 mismatch for ${meta.relPath}! Expected: ${meta.sha256}, Got: ${downloadedHash}`);
    }
    verifySignature(buffer, meta);
    fs.writeFileSync(targetPath, buffer);
    console.log(`[SAVED] ${meta.relPath} (${buffer.length} bytes, SHA-256 verified)`);
  } else {
    verifySignature(buffer, meta);
  }

  return {
    path: meta.publicPath,
    source: meta.source,
    version: meta.version,
    sha256: meta.sha256,
    license: meta.license
  };
}

/**
 * Prepares WASM files from installed @mediapipe/tasks-vision package
 */
function prepareWasmAssets() {
  const wasmTargetDir = path.join(PUBLIC_ASSETS_DIR, 'mediapipe', 'wasm');
  fs.mkdirSync(wasmTargetDir, { recursive: true });

  const tasksVisionWasmDir = path.join(ROOT_DIR, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm');
  const wasmManifestEntries = [];

  if (!fs.existsSync(tasksVisionWasmDir)) {
    console.warn('\n--------------------------------------------------------------------------------');
    console.warn('[BLOCKER] @mediapipe/tasks-vision is not installed in node_modules.');
    console.warn('  Reason: Another agent is responsible for preparing npm packages.');
    console.warn('  Impact: WASM assets in /assets/mediapipe/wasm/ cannot be copied from node_modules yet.');
    console.warn('  Action: Once the package agent completes npm install, rerun:');
    console.warn('          node scripts/prepare-assets.mjs');
    console.warn('--------------------------------------------------------------------------------\n');
    return { status: 'blocked', entries: wasmManifestEntries };
  }

  console.log(`[WASM] Found installed @mediapipe/tasks-vision at: ${tasksVisionWasmDir}`);
  const files = fs.readdirSync(tasksVisionWasmDir).sort();

  const pkgJsonPath = path.join(ROOT_DIR, 'node_modules', '@mediapipe', 'tasks-vision', 'package.json');
  const tasksVisionVersion = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8')).version;
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'package-lock.json'), 'utf8'));
  if (tasksVisionVersion !== lock.packages['node_modules/@mediapipe/tasks-vision']?.version) {
    throw new Error('Installed MediaPipe version differs from package-lock.json; run npm ci.');
  }
  const previousManifest = JSON.parse(fs.readFileSync(path.join(PUBLIC_ASSETS_DIR, 'manifest.json'), 'utf8'));
  const pinnedWasm = new Map(previousManifest.assets
    .filter(asset => asset.path.startsWith('/assets/mediapipe/wasm/'))
    .map(asset => [asset.path, asset]));
  if (pinnedWasm.size === 0) {
    throw new Error('No reviewed WASM hashes in manifest; restore the version-controlled manifest.');
  }

  for (const file of files) {
    if (!file.endsWith('.wasm') && !file.endsWith('.js')) continue;

    const srcFilePath = path.join(tasksVisionWasmDir, file);
    const destFilePath = path.join(wasmTargetDir, file);

    const buffer = fs.readFileSync(srcFilePath);

    // Verify WASM magic bytes: 0x00 0x61 0x73 0x6D (\0asm)
    if (file.endsWith('.wasm')) {
      const magic = buffer.subarray(0, 4).toString('hex');
      if (magic !== '0061736d') {
        throw new Error(`Invalid WASM magic bytes in ${file}: expected 0061736d, got ${magic}`);
      }
    }

    const fileSha256 = computeSha256(buffer);
    const pinned = pinnedWasm.get(`/assets/mediapipe/wasm/${file}`);
    if (!pinned || pinned.sha256 !== fileSha256 || pinned.version !== tasksVisionVersion) {
      throw new Error(`Unreviewed MediaPipe asset change: ${file}. Review the package and manifest before upgrading.`);
    }
    fs.copyFileSync(srcFilePath, destFilePath);
    console.log(`[WASM COPIED] ${file} (${buffer.length} bytes, SHA-256: ${fileSha256.slice(0, 12)}...)`);

    wasmManifestEntries.push({
      path: `/assets/mediapipe/wasm/${file}`,
      source: `@mediapipe/tasks-vision@${tasksVisionVersion}/wasm/${file}`,
      version: tasksVisionVersion,
      sha256: fileSha256,
      license: 'Apache-2.0'
    });
  }

  return { status: 'ok', entries: wasmManifestEntries };
}

/**
 * Main asset preparation process
 */
async function main() {
  console.log('=== org-board Asset Preparation (S00.01) ===\n');

  fs.mkdirSync(PUBLIC_ASSETS_DIR, { recursive: true });

  const manifestAssets = [];

  // 1. Prepare Font and License
  const fontEntry = await preparePinnedAsset('font', PINNED_ASSETS.font);
  manifestAssets.push(fontEntry);

  const oflEntry = await preparePinnedAsset('ofl', PINNED_ASSETS.ofl);
  manifestAssets.push(oflEntry);

  // 2. Prepare Face Detector Model
  const modelEntry = await preparePinnedAsset('model', PINNED_ASSETS.model);
  manifestAssets.push(modelEntry);

  // 3. Prepare WASM from installed @mediapipe/tasks-vision
  const wasmResult = prepareWasmAssets();
  manifestAssets.push(...wasmResult.entries);

  // 4. Write manifest.json
  const manifestPath = path.join(PUBLIC_ASSETS_DIR, 'manifest.json');
  const manifestData = {
    name: 'org-board-assets',
    description: 'Static offline assets for org-board MVP',
    generatedAt: new Date().toISOString(),
    assets: manifestAssets,
    pendingDependencies: wasmResult.status === 'blocked' ? [
      {
        dependency: '@mediapipe/tasks-vision',
        targetPath: '/assets/mediapipe/wasm/',
        status: 'BLOCKED_PENDING_PACKAGE_AGENT',
        reason: 'Awaiting npm package installation by package preparation agent'
      }
    ] : []
  };

  fs.writeFileSync(manifestPath, JSON.stringify(manifestData, null, 2) + '\n', 'utf8');
  console.log(`\n[MANIFEST WRITTEN] ${manifestPath}`);
  console.log(`Total active assets in manifest: ${manifestAssets.length}`);

  if (wasmResult.status === 'blocked') {
    console.log('\n[STATUS] Font and Model successfully prepared and verified.');
    console.log('[STATUS] WASM asset copying pending installation of @mediapipe/tasks-vision.');
  } else {
    console.log('\n[SUCCESS] All assets (fonts, models, wasm) prepared and verified successfully.');
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch(err => {
    console.error('\n[FATAL ERROR]', err.message);
    process.exit(1);
  });
}
