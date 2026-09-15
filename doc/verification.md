# 개발 검증 기록

## 환경과 기록 원칙

- 날짜: 2026-09-15, Windows / PowerShell, 작업 폴더 `D:\org-board`.
- Node.js: v24.18.0, npm: 11.16.0.
- 기준 문서 원본 보존 커밋: `263a38a`.
- S00.01 구현 커밋: `1043948`.
- 역할과 선행 조건: [development-execution.md](development-execution.md).
- 실제 직원 데이터는 사용하지 않는다. 모델 파일 존재·해시 검증은 얼굴 검출 품질 검증을 뜻하지 않는다.
- 실물 인쇄와 사용자 시안 판단을 자동 검사 결과로 대체하지 않는다.

## S00.01 — 재현 가능한 기술 시험 환경 준비

- 상태: 완료 (2026-09-15).
- 담당: GPT-5.6-sol(xhigh) 앱·검증 환경, Gemini 3.8 Flash High 자산, orchestrator 통합.
- 구현 범위: React·TypeScript·Vite 시험 harness, 고정 의존성, 로컬 폰트·모델·WASM, 비식별 fixture, 실행 가능한 검증 명령.
- 자산 근거: 준비 후 [assets.md](assets.md), `public/assets/manifest.json`, `THIRD_PARTY_NOTICES.md`에 기록.
- 완료 판정: 아래 검사를 실행한 뒤 결과를 갱신한다.

| 검사 | 상태 | 근거 |
|---|---|---|
| 잠금 파일 기반 새 설치 | 통과 | package.json/lockfile만 복사한 tmp/clean-install-s00-01에서 npm ci, 354 packages 설치 성공 |
| TypeScript strict | 통과 | GPT 담당 실행: npm run typecheck |
| 린트 | 통과 | GPT 담당 실행: npm run lint |
| 기본 시험·합성 fixture | 통과 | GPT 담당 실행: npm run test, 4개 파일·7개 테스트 |
| 빌드 | 통과 | GPT 담당 실행: npm run build, Vite 8.3.0 |
| localhost 화면·로컬 자산 | 통과 | npm run test:e2e, Chromium 153.0.8010.12, 1개 테스트 통과·외부 요청 0건; agent-browser 화면 확인 |
| 자산 출처·라이선스·SHA-256 | 통과 | prepare-assets 및 verify-assets, 로컬 자산 9개·보류 0건 |

필수 자산 누락·중복·경로 순회·보류 의존성은 검증 실패로 처리한다. 자산 재준비는 잠금 파일과 설치 MediaPipe 버전의 일치 및 기존 manifest의 WASM 해시를 요구한다. 버전 변경 시 검토 없이 해시를 갱신하지 않는다.

E2E 첫 실행은 필요한 Chromium revision 1243 미설치로 실패했으며 `npx playwright install chromium` 후 재실행에서 통과했다. 테스트 브라우저 설치는 개발 환경 준비이며 사용자 런타임 설치 방식은 S07.03에서 다룬다.

생성된 비식별 인물 fixture와 프롬프트는 `tests/fixtures/images/README.md`에 기록했다. 본 Story 완료는 M0 완료를 뜻하지 않는다.

### 중간 통합 확인

- React 19.3.0 / TypeScript 6.0.3 / Vite 8.3.0 / MediaPipe Tasks Vision 1.0.1. 정확한 전체 버전은 package-lock.json에 기록한다.
- TypeScript 7과 typescript-eslint의 peer 범위 충돌을 강제 설치로 우회하지 않고 호환되는 TypeScript 6.0.3을 사용했다.
- agent-browser 0.37.1, HeadlessChrome 153.0.0.0에서 `http://127.0.0.1:5173` 화면 표시 확인. 최초 점검에서는 WASM 미등록을 화면이 준비 실패로 올바르게 표시했다. 콘솔 오류는 관찰되지 않았다. 이 결과는 자산 완료나 추론 성공 판정이 아니다.
- `npm audit --json`: moderate 2건(ExcelJS 및 전이 uuid), high/critical 0건. [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq)의 uuid v3/v5/v6 버퍼 경계 검사 문제다. 설치된 ExcelJS의 `lib/xlsx/xform/sheet/cf-ext/cf-rule-ext-xform.js`는 인수 없는 uuid v4를 호출한다. 해당 사용 경로에서는 공지된 조건이 관찰되지 않았으나 S00.02의 번들·파서 검증과 의존성 채택 판단이 남아 있다. 자동 제안의 ExcelJS 3.4.0 강제 다운그레이드는 적용하지 않았다.

## 후속 기술 시험의 완료 조건

| Story / POC | 필요한 증거 | 현재 상태 |
|---|---|---|
| S00.02 / POC-06 | XLSX 정상·오류 행, 숨김 시트·수식·병합·손상·압축 한계·시간 제한, 기존 데이터 유지 | 완료: [poc-06.md](poc-06.md), 실제 Worker E2E 통과 |
| S00.03 / POC-02·03 일부 | EXIF 1~8, 얼굴 0·1·다수, 실제 검출 Worker와 실패 복구, 좌표 오차 ≤1px | 진행 중: Gemini 3.8 Flash High |
| S00.04 / POC-03·04·05 | 동일 크롭 PDF, 독립 PDF 검사, 글리프 누락, 눈금자 PDF, 100% 실제 인쇄 가로·세로 ±0.5mm | 미착수 |
| S00.05 / POC-01·07 | 1·21·22·100명 실제 시간·메모리·오프라인·Windows 시작·종료 | 미착수 |
| S00.06 / M0 | 네 화면 시안·오류 상태·잠정 정책·사용자 판단 기록 | 미착수 |

M0 및 제품 기능 68개 검증은 아직 완료되지 않았다.

## S00.02·03 통합 검사 (14:58)

- 전체 typecheck·lint 통과, Vitest 10개 파일 / 45개 테스트 통과.
- `npm run test:e2e -- --workers=2`: Vite build 및 Chromium 153.0.8010.12에서 12개 테스트 통과(29.4초).
- XLSX: 혼합 행, 손상 입력, 실제 Worker 10초 종료 후 이전 배치 유지 통과. 상세 내용은 POC-06 기록 참조.
- 사진: 실제 단일·0·다중 얼굴, 수동 편집·초기화, EXIF, 모델 다운로드 실패·10초 지연·큰 원본 입력 통과.
- `node scripts/check-imaging-browser.mjs`: 실제 JPEG 정사각형/비정사각형 × EXIF 1~8의 16조합 실패 0건, 눈 기준점 누락 경고 통과.
- 남은 S00.03 조건: production preview는 통과했으나 Vite 개발서버가 로컬 WASM JS URL에 붙이는 `?import` 처리 문제를 Gemini가 수정 중이다. 이 문제가 해결되기 전 S00.03을 완료로 표시하지 않는다.
