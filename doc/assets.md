# 조직보드 정적 자산 명세서 (Assets Specification)

- 문서 버전: v1.1
- 작성일: 2026-09-15
- 담당 Story: **S00.01 — 재현 가능한 기술 시험 환경 준비**
- 기준 문서: [TRD v0.9](trd.md) §2, §3, §14; [FRD v0.9](frd.md) F8.8; [Development Plan](plan.md) S00.01

---

## 1. 개요 및 원칙

조직보드 웹 애플리케이션은 Windows localhost 오프라인 환경에서 동작하는 단일 사용자 도구입니다. 따라서 폰트, 머신러닝 모델, WebAssembly 런타임 등 애플리케이션 실행에 필요한 모든 정적 자산은 외부 CDN이나 원격 서버에 의존하지 않고 로컬 배포 경로(`public/assets/`)에 포함되어야 합니다.

### 핵심 원칙
1. **공식 출처 (Official Sources Only):** Google Fonts 공식 저장소, Google MediaPipe 공식 스토리지, 공식 npm 패키지(`@mediapipe/tasks-vision@1.0.1`)만 출처로 사용합니다.
2. **해시 고정 및 엄격 검증 (Pinned Hashes & Strict Validation):** 모든 파일은 정확한 버전, 커밋, SHA-256 체크섬을 기록하여 위변조 및 손상을 방지합니다.
3. **바이너리 시그니처 검증 (Signature Verification):** TTF (`0x00010000`), TFLite (`TFL3`), WASM (`0x00 0x61 0x73 0x6D`) 바이너리 매직 헤더를 스크립트로 자동 검증합니다.
4. **정규 경로 및 순회/중복 경로 거부 (Canonical Paths & Traversal/Duplicate Rejection):** 모든 자산 경로는 `/assets/` 기준 정규 경로(canonical path)만을 허용하며, 상대 경로(`..`, `.`), 중복 경로, 디렉토리 순회 시도를 엄격히 거부합니다.
5. **필수 자산 누락 및 보류 의존성 차단 (Zero Missing Assets & Zero Pending Dependencies):** 필수 폰트, OFL 라이선스, 모델, WASM 바이너리, JS 로더 중 하나라도 누락되거나 미해결 보류 의존성이 존재할 경우 검증 스크립트는 즉시 종료 코드 1로 실패하며 결코 성공으로 처리되지 않습니다.
6. **확장자 기반 개인정보 스캔 (Extension-based Privacy Scan):** 실제 직원 사진, 스프레드시트 등 비인가 파일 확장자(.xlsx, .csv, .jpg, .png 등)를 스캔하여 검사된 확장자 목록만을 명확히 보고합니다.
7. **재현 가능한 스크립트 (Repeatable Scripts):** `scripts/prepare-assets.mjs`와 `scripts/verify-assets.mjs`를 통해 자산 준비 및 무결성 검증을 독립적으로 재현합니다.

---

## 2. 자산 목록 및 상세 명세 (Asset Inventory)

| 자산 경로 | 공식 출처 URL / 패키지 | 버전 / 커밋 | 라이선스 | SHA-256 체크섬 | 크기 | 매직 시그니처 / 유형 | 상태 |
|---|---|---|---|---|---:|---|---|
| `/assets/fonts/NanumGothic-ExtraBold.ttf` | [google/fonts](https://raw.githubusercontent.com/google/fonts/133ccbee9a8b408eb71f31a36ccb9116f5c695ad/ofl/nanumgothic/NanumGothic-ExtraBold.ttf) | `1.000` (`133ccbe`) | OFL-1.1 | `5c4568e5295a8c52bc30e7efa1ea6d2de43556268ef42daba93540a1ece691ae` | 2,112,720 B | `00010000` (TTF) | 준비 및 검증 완료 |
| `/assets/fonts/OFL.txt` | [google/fonts](https://raw.githubusercontent.com/google/fonts/133ccbee9a8b408eb71f31a36ccb9116f5c695ad/ofl/nanumgothic/OFL.txt) | `1.1` (`133ccbe`) | OFL-1.1 | `eeacf16032901d0ed0456876ec77b8f0fda6b3fecec7d972f8543eb602e6c30f` | 4,534 B | 텍스트 라이선스 | 준비 및 검증 완료 |
| `/assets/models/blaze_face_short_range.tflite` | [Google Storage](https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite) | `v1 (float16)` | Apache-2.0 | `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f` | 229,746 B | `TFL3` (offset 4) | 준비 및 검증 완료 |
| `/assets/mediapipe/wasm/vision_wasm_internal.js` | `@mediapipe/tasks-vision` | `1.0.1` | Apache-2.0 | `e170ee67dd4e16c1a6fcd8840a206687e5a59b22c20e4a902bc445b095454d73` | 323,377 B | JS 로더 | 준비 및 검증 완료 |
| `/assets/mediapipe/wasm/vision_wasm_internal.wasm` | `@mediapipe/tasks-vision` | `1.0.1` | Apache-2.0 | `8da277a733926eacd0474b8704b36742d6ec3231c57a860c5b889dff8f1df886` | 11,756,954 B | `0061736d` (WASM) | 준비 및 검증 완료 |
| `/assets/mediapipe/wasm/vision_wasm_module_internal.js` | `@mediapipe/tasks-vision` | `1.0.1` | Apache-2.0 | `da8934057f147b622e82cfb4c0dbd85461c598e268588b5a8ba9ca963a8ff82d` | 323,415 B | JS 로더 | 준비 및 검증 완료 |
| `/assets/mediapipe/wasm/vision_wasm_module_internal.wasm` | `@mediapipe/tasks-vision` | `1.0.1` | Apache-2.0 | `2dabd8e23c60984628beb7bb338764c81a08e6837145273f59578684b5d53c1b` | 11,756,972 B | `0061736d` (WASM) | 준비 및 검증 완료 |
| `/assets/mediapipe/wasm/vision_wasm_nosimd_internal.js` | `@mediapipe/tasks-vision` | `1.0.1` | Apache-2.0 | `e81d715a3d42cc3373602eb2f7aff795d164934db680e32496b65dab537f9658` | 323,180 B | JS 로더 | 준비 및 검증 완료 |
| `/assets/mediapipe/wasm/vision_wasm_nosimd_internal.wasm` | `@mediapipe/tasks-vision` | `1.0.1` | Apache-2.0 | `a28483cd42e74e855bf5ebdb6b40d9b66a5b49e35e95020bc97669e6822a3192` | 10,960,242 B | `0061736d` (WASM) | 준비 및 검증 완료 |

---

## 3. 개별 자산 상세

### 3.1 나눔고딕 ExtraBold 800 TTF (`/assets/fonts/NanumGothic-ExtraBold.ttf`)
- **역할:** 웹 화면(Canvas) 및 생성 PDF(pdf-lib + @pdf-lib/fontkit)에서 직원 이름 렌더링에 사용되는 단일 기준 글꼴.
- **출처:** Google Fonts 공식 저장소 (`google/fonts`, ofl/nanumgothic).
  - 저장소 경로: `https://github.com/google/fonts/tree/main/ofl/nanumgothic`
  - 원시 다운로드 URL: `https://raw.githubusercontent.com/google/fonts/133ccbee9a8b408eb71f31a36ccb9116f5c695ad/ofl/nanumgothic/NanumGothic-ExtraBold.ttf`
  - 고정 커밋 ID: `133ccbee9a8b408eb71f31a36ccb9116f5c695ad`
- **저작권 및 디자이너:**
  - 저작권자: NHN Corporation (`Copyright (c) 2010, NHN Corporation`)
  - 디자이너: Sandoll Communications Inc.
- **라이선스:** SIL Open Font License, Version 1.1 (`OFL.txt` 동봉 및 `THIRD_PARTY_NOTICES.md` 수록).
- **무결성 검증:**
  - SHA-256: `5c4568e5295a8c52bc30e7efa1ea6d2de43556268ef42daba93540a1ece691ae`
  - 파일 시그니처: 시작 4바이트가 `0x00 0x01 0x00 0x00` (TrueType Font Magic).

### 3.2 MediaPipe BlazeFace Short Range Face Detector (`/assets/models/blaze_face_short_range.tflite`)
- **역할:** 브라우저 Web Worker 내부에서 직원 사진의 얼굴 위치(바운딩 박스 및 6개 랜드마크)를 검출하는 온디바이스 모델.
- **출처:** Google 공식 MediaPipe 모델 스토리지.
  - 다운로드 URL: `https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite`
  - 상위 프로젝트: [Google MediaPipe](https://github.com/google-ai-edge/mediapipe) / [MediaPipe Face Detector](https://developers.google.com/mediapipe/solutions/vision/face_detector)
- **양자화 및 포맷:** TensorFlow Lite FlatBuffer, float16 양자화 모델 (파일 크기: 229,746 바이트).
- **저작권 및 라이선스:** Google LLC, Apache License 2.0 (`THIRD_PARTY_NOTICES.md` 수록).
- **무결성 검증:**
  - SHA-256: `b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f`
  - 파일 시그니처: 오프셋 4의 4바이트가 ASCII `TFL3` (0x54, 0x46, 0x4C, 0x33).
- **주의사항:** 본 단계(S00.01)는 정적 자산 무결성 및 라이선스 준비 작업이며, 얼굴 검출기의 기능적 동작 검증(S00.03)은 별도 시험 작업으로 수행됩니다.

### 3.3 MediaPipe Tasks Vision WebAssembly 런타임 (`/assets/mediapipe/wasm/`)
- **역할:** 브라우저 내부에서 TFLite 모델 추론을 수행하기 위한 WebAssembly 바이너리 및 JS 로더 모듈.
- **출처:** 공식 npm 패키지 `@mediapipe/tasks-vision` 내 `wasm/` 디렉토리.
- **설치된 정확한 버전 (Exact Installed Version):** `@mediapipe/tasks-vision@1.0.1`
- **저작권 및 라이선스:** Google LLC, Apache License 2.0.
- **상태 및 통합 완료 내역:**
  - **상태:** 준비 및 검증 완료 (`COMPLETED`, 보류 의존성 블로커 전면 해제)
  - **반영 결과:** `@mediapipe/tasks-vision@1.0.1`이 `node_modules`에 설치 완료됨에 따라 `scripts/prepare-assets.mjs`를 통해 WASM 바이너리 3개(`vision_wasm_internal.wasm`, `vision_wasm_module_internal.wasm`, `vision_wasm_nosimd_internal.wasm`)와 JS 로더 3개(`vision_wasm_internal.js`, `vision_wasm_module_internal.js`, `vision_wasm_nosimd_internal.js`)가 `public/assets/mediapipe/wasm/`에 복사되었습니다.
  - **무결성 검증:** WASM 매직 바이트(`0x00 0x61 0x73 0x6D`) 및 개별 파일 SHA-256 해시 검증이 완료되었으며, `manifest.json`에 정규 경로로 등록되었습니다. 보류 의존성(`pendingDependencies`)은 빈 배열(`[]`)로 전환되었습니다.

---

## 4. 자산 매니페스트 계약 (`public/assets/manifest.json`)

`public/assets/manifest.json`은 런타임 및 빌드 도구가 로컬 자산의 무결성을 확인할 수 있도록 구조화된 JSON 파일입니다.

```json
{
  "name": "org-board-assets",
  "description": "Static offline assets for org-board MVP",
  "generatedAt": "2026-09-15T05:32:32.417Z",
  "assets": [
    {
      "path": "/assets/fonts/NanumGothic-ExtraBold.ttf",
      "source": "https://raw.githubusercontent.com/google/fonts/133ccbee9a8b408eb71f31a36ccb9116f5c695ad/ofl/nanumgothic/NanumGothic-ExtraBold.ttf",
      "version": "1.000 (google/fonts commit 133ccbee9a8b408eb71f31a36ccb9116f5c695ad)",
      "sha256": "5c4568e5295a8c52bc30e7efa1ea6d2de43556268ef42daba93540a1ece691ae",
      "license": "OFL-1.1"
    },
    {
      "path": "/assets/fonts/OFL.txt",
      "source": "https://raw.githubusercontent.com/google/fonts/133ccbee9a8b408eb71f31a36ccb9116f5c695ad/ofl/nanumgothic/OFL.txt",
      "version": "1.1 (google/fonts commit 133ccbee9a8b408eb71f31a36ccb9116f5c695ad)",
      "sha256": "eeacf16032901d0ed0456876ec77b8f0fda6b3fecec7d972f8543eb602e6c30f",
      "license": "OFL-1.1"
    },
    {
      "path": "/assets/models/blaze_face_short_range.tflite",
      "source": "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite",
      "version": "v1 (float16)",
      "sha256": "b4578f35940bf5a1a655214a1cce5cab13eba73c1297cd78e1a04c2380b0152f",
      "license": "Apache-2.0"
    },
    {
      "path": "/assets/mediapipe/wasm/vision_wasm_internal.js",
      "source": "@mediapipe/tasks-vision@1.0.1/wasm/vision_wasm_internal.js",
      "version": "1.0.1",
      "sha256": "e170ee67dd4e16c1a6fcd8840a206687e5a59b22c20e4a902bc445b095454d73",
      "license": "Apache-2.0"
    },
    {
      "path": "/assets/mediapipe/wasm/vision_wasm_internal.wasm",
      "source": "@mediapipe/tasks-vision@1.0.1/wasm/vision_wasm_internal.wasm",
      "version": "1.0.1",
      "sha256": "8da277a733926eacd0474b8704b36742d6ec3231c57a860c5b889dff8f1df886",
      "license": "Apache-2.0"
    },
    {
      "path": "/assets/mediapipe/wasm/vision_wasm_module_internal.js",
      "source": "@mediapipe/tasks-vision@1.0.1/wasm/vision_wasm_module_internal.js",
      "version": "1.0.1",
      "sha256": "da8934057f147b622e82cfb4c0dbd85461c598e268588b5a8ba9ca963a8ff82d",
      "license": "Apache-2.0"
    },
    {
      "path": "/assets/mediapipe/wasm/vision_wasm_module_internal.wasm",
      "source": "@mediapipe/tasks-vision@1.0.1/wasm/vision_wasm_module_internal.wasm",
      "version": "1.0.1",
      "sha256": "2dabd8e23c60984628beb7bb338764c81a08e6837145273f59578684b5d53c1b",
      "license": "Apache-2.0"
    },
    {
      "path": "/assets/mediapipe/wasm/vision_wasm_nosimd_internal.js",
      "source": "@mediapipe/tasks-vision@1.0.1/wasm/vision_wasm_nosimd_internal.js",
      "version": "1.0.1",
      "sha256": "e81d715a3d42cc3373602eb2f7aff795d164934db680e32496b65dab537f9658",
      "license": "Apache-2.0"
    },
    {
      "path": "/assets/mediapipe/wasm/vision_wasm_nosimd_internal.wasm",
      "source": "@mediapipe/tasks-vision@1.0.1/wasm/vision_wasm_nosimd_internal.wasm",
      "version": "1.0.1",
      "sha256": "a28483cd42e74e855bf5ebdb6b40d9b66a5b49e35e95020bc97669e6822a3192",
      "license": "Apache-2.0"
    }
  ],
  "pendingDependencies": []
}
```

### 필드 및 보안 요구사항
- `path`: 웹 루트 기준 정규 절대 경로 (`/assets/...`). 백슬래시, 상대 경로(`..`, `.`), 중복 경로 불허.
- `source`: 공식 원격 소스 URL 또는 정확한 npm 패키지 버전 식별자
- `sha256`: 파일의 SHA-256 체크섬 (소문자 64글자 16진수)
- `license`: SPDX 라이선스 식별자 (`OFL-1.1`, `Apache-2.0`)
- `version`: 자산의 고정 버전 및 커밋 정보 (WASM의 경우 `1.0.1`)
- `pendingDependencies`: 보류 의존성 배열. 빈 배열(`[]`)이어야 검증이 통과되며 잔여 항목 존재 시 즉시 실패.

---

## 5. 실행 및 검증 방법

외부 의존성 없이 Node.js 표준 라이브러리(`node:fs`, `node:crypto`, `node:path`)만으로 동작합니다.

### 5.1 자산 다운로드 및 준비
```bash
node scripts/prepare-assets.mjs
```
- 고정된 공식 URL로부터 글꼴 및 모델을 다운로드합니다.
- 기존 파일이 존재하고 SHA-256이 일치하면 다운로드를 건너뜁니다 (멱등성 보장).
- 설치된 `@mediapipe/tasks-vision@1.0.1`로부터 WASM 바이너리 및 JS 로더를 복사하고 매직 바이트(`0x00 0x61 0x73 0x6D`)를 확인합니다.
- `public/assets/manifest.json`을 생성/갱신합니다.

### 5.2 자산 무결성 및 보안 검증
```bash
node scripts/verify-assets.mjs
```
- `manifest.json` 파싱 및 스키마 유효성을 검사합니다.
- 보류 의존성(`pendingDependencies`) 유무를 확인하여 잔여 항목이 있을 경우 즉시 종료 코드 1로 실패합니다.
- 자산 경로의 정규성(canonical path)을 검증하고, 경로 순회(`..`), 중복 경로, 비인가 슬래시를 감지 시 즉시 거부합니다.
- 필수 자산 카테고리(폰트, OFL 라이선스, 모델, WASM 바이너리, JS 로더)가 하나라도 누락되면 즉시 종료 코드 1로 실패합니다.
- 등록된 모든 파일의 로컬 존재 여부 및 SHA-256 체크섬을 대조합니다.
- 바이너리 시그니처 (TTF `00010000`, TFLite `TFL3`, WASM `0061736d`)를 검증합니다.
- `public/assets/` 내에 지정된 비인가 확장자(`.xlsx`, `.xls`, `.csv`, `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`)가 존재하는지 스캔하며 검사된 확장자 목록만을 명확히 보고합니다.
- 매니페스트에 등록되지 않은 불필요한 디스크 파일이 존재하는지 검증합니다.
