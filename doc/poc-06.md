# POC-06 — XLSX 파서와 입력 한계 시험

- Story: S00.02
- 작성일: 2026-09-15
- 상태: 완료 — 2026-09-15 orchestrator 통합 검증 통과
- 환경: Windows, Node.js 24.18.0, npm 11.16.0
- 데이터: 저장소에서 생성한 `합성 인물` fixture만 사용. 실제 직원정보와 실제 업무 XLSX는 사용하지 않음

## 1. 구현 범위

- ExcelJS 4.4.0을 실제 Web Worker 안에서 실행하는 브라우저 파서
- fflate 0.8.3 기반 ZIP 구조·엔트리 수·선언 크기·실제 해제량 검사
- 첫 번째 `visible` 시트와 `이름`, `직군`, `계약형태` 헤더 검사
- 문자열과 rich text 허용, 수식·하이퍼링크·숫자·날짜·논리값·오류 셀 거부
- 정상 행과 `sourceRow`, `column`, `code`만 담은 오류 행의 구조화 결과
- 배치 신규 추가와 재시도 교체 계약. 실패 시 이전 정상 배치 객체를 그대로 유지
- 10,000ms 제한 후 Worker 종료 계약
- 실제 직원정보를 표시하지 않는 `SpreadsheetHarness`

제품의 직원 목록이나 XLSX 가져오기 화면은 구현하지 않았다. 이 코드는 S00.02 기술 시험용이다.

## 2. 시험 상한과 결과

| 항목 | 적용값 | 시험 결과 | 판단 |
|---|---:|---|---|
| 파일 크기 | 5MiB | 경계값 허용, 1바이트 초과 거부 | 유지 |
| 데이터 행 | 1,000행 | 1,000행 허용, 1,001행 거부 | 유지 |
| ZIP 엔트리 | 2,000개 | 2,001개 거부 | 유지 |
| ZIP 선언 해제 크기 | 50MiB | 50MiB + 1바이트 합성 압축 입력 거부 | 유지 |
| ZIP 실제 해제 크기 | 50MiB | local header에 크기가 없는 streaming ZIP을 실제 해제하며 50MiB + 1바이트 입력 거부 | 유지 |
| Worker 시간 | 10,000ms | 단위시험 및 실제 Chromium Worker 지연 주입·10초 종료·기존 결과 유지 통과 | 유지 |

fflate에는 압축 입력을 1,024바이트씩 전달한다. 각 엔트리의 선언 크기를 먼저 합산하고, `ondata`로 나온 실제 바이트도 별도로 합산한다. 한도를 넘으면 해당 스트림을 종료하고 ExcelJS에는 전달하지 않는다. 중복 엔트리, 절대·역참조 경로, 잘린 중앙 디렉터리, 중앙 디렉터리와 발견 엔트리 수 불일치도 거부한다.

이 방식은 JavaScript 프로세스의 절대 메모리 hard cap이 아니다. fflate가 한 번의 callback에서 만든 출력 chunk만큼 관찰 임계값을 일시적으로 넘을 수 있으며, 입력 ArrayBuffer와 inflater 상태도 메모리에 존재한다. ZIP 검사를 통과한 뒤 ExcelJS가 workbook 객체를 만드는 메모리는 행 제한을 확인하기 전에 사용된다. 따라서 5MiB 입력 제한, 50MiB 해제 관찰 제한과 별도 Worker의 10초 종료를 함께 적용한다.

중앙 디렉터리의 단일 disk, 오프셋, 크기와 총 엔트리 수는 확인하지만 각 central entry와 local header의 CRC·크기 필드를 일대일로 대조하지는 않는다. fflate 해제와 ExcelJS 파싱 실패가 추가 방어선이며, 이 차이를 완전한 악성 ZIP 메모리 제한으로 표현하면 안 된다. ZIP64와 multi-disk ZIP은 이 MVP 입력 범위에서 지원하지 않는다.

## 3. 워크북과 셀 정책

- workbook 순서에서 첫 `visible` 시트만 읽는다. 그 앞의 `hidden`·`veryHidden` 시트는 건너뛴다.
- 헤더는 공백을 정리한 뒤 필수 헤더가 정확히 하나씩 있어야 한다. 순서는 자유다.
- 필수 헤더와 필수 데이터 셀의 병합은 파일 전체 오류다. 읽지 않는 추가 열의 병합은 차단하지 않고 추가 열과 함께 무시한다.
- 세 필수 값이 모두 빈 행은 제외한다.
- 문자열과 rich text의 표시 문자열만 허용한다. 수식 결과를 계산하거나 읽지 않고 하이퍼링크를 열지 않는다.
- 오류 UI에는 원본 셀 값, 이름, 파일명과 전체 로컬 경로를 표시하지 않는다.
- 동명이인은 유효한 별도 행으로 유지한다.

합성 혼합 fixture의 첫 숨김 시트는 건너뛰었고 두 번째 표시 시트에서 정상 3행, 오류 3행, 빈 행 1개 제외 결과를 얻었다. 오류는 수식 `FORMULA_NOT_ALLOWED`, 하이퍼링크 `HYPERLINK_NOT_ALLOWED`, 숫자 `NUMBER_NOT_ALLOWED`로 분류됐다. 테스트는 오류 결과에 실제 수식과 링크 문자열이 포함되지 않는 것도 확인한다.

## 4. 배치 재시도와 실패 복구

신규 배치는 입력 순서 뒤에 추가한다. 같은 `batchId`의 재시도 성공은 기존 위치의 결과를 교체하고 revision만 증가시키므로 기존 정상 행을 중복 추가하지 않는다. 파일·ZIP·Worker 실패 결과는 배치 배열을 변경하지 않는다.

Worker 생성 예외, `postMessage`의 `DataCloneError`, Worker 실행 오류, message 역직렬화 오류와 시간 초과를 모두 구조화된 `WORKER_FAILED` 또는 `WORKER_TIMEOUT`으로 바꾼다. 시작된 Worker와 timer는 성공·실패 모두 정리한다.

## 5. 의존성과 번들 판단

| 항목 | 확인 결과 |
|---|---|
| ExcelJS | 4.4.0 정확 버전, MIT. 브라우저 Worker에서 합성 1행 실제 파싱 성공 |
| fflate | 0.8.3 정확 버전, MIT. 선언 크기와 streaming 실제 출력 제한 시험 통과 |
| Vite 분리 빌드 | 성공. `spreadsheet.worker` 952.54kB, UI lazy chunk 8.54kB |
| 실행 위치 | ExcelJS와 fflate는 main UI chunk가 아닌 비동기 Worker chunk에 포함 |

ExcelJS의 browser declaration은 `load` 입력을 Node `Buffer`로 좁혀 적지만 배포 browser build는 `Uint8Array`를 받는다. 구현에는 이 차이를 한 곳에 설명하고 Worker build와 실제 Edge 실행으로 확인했다.

`npm audit`은 ExcelJS의 전이 의존성 `uuid@8.3.2`에 moderate advisory 2건을 집계한다. ExcelJS 소스에서 uuid 호출은 조건부 서식 확장 쓰기의 `v4()` 무인자 호출이며, POC-06 읽기 경로는 이를 호출하지 않는다. Vite의 CommonJS 번들에는 관련 모듈 코드가 포함돼 있으므로 의존성 재고 위험은 남는다. 제안 자동 수정은 ExcelJS 3.4.0으로의 강제 다운그레이드여서 적용하지 않았다.

채택 판단은 **ExcelJS 4.4.0 + fflate 0.8.3 조건부 채택**이다. 현재 기능 계약과 Worker build는 적합하다. S02.02 제품 적용 전 최신 ExcelJS가 uuid 범위를 갱신했는지 다시 확인하고, advisory가 실제 호출 경로에 영향을 주거나 유지보수 상태가 악화되면 동일한 `SpreadsheetAdapter` 계약으로 SheetJS CE를 비교한다.

## 6. 자동·브라우저 검증 기록

| 검사 | 결과 |
|---|---|
| `npm run test -- spreadsheet` | 통과: 4 files, 20 tests, 4.40s |
| 소유 파일 대상 TypeScript strict 검사 | 통과 |
| 소유 파일 대상 ESLint | 통과 |
| `npx vite build --outDir tmp/spreadsheet-build` | 통과: 1.10s, Worker 952.54kB |
| 시스템 Edge headless, `http://127.0.0.1:5173/?spike=spreadsheet` | 실제 Worker로 합성 1행 파싱 성공, 정상 1행·오류 0행 표시, 합성 이름 원문 미표시 |
| Playwright `tests/e2e/spreadsheet.spec.ts` | 통과: 혼합 행 0.86초, 손상·실제 10초 종료·기존 배치 유지 12.2초(각 전체 테스트 소요 시간) |
| 통합 `npm run typecheck`, `npm run lint`, `npm run test` | 통과: 전체 단위시험 45개 |
| 통합 `npm run test:e2e -- --workers=2` | 내부 build 통과, Chromium 153.0.8010.12에서 전체 12개 E2E 통과(29.4초) |

첫 개발서버 혼합 fixture 확인은 응답을 30초 기다리다 시간 초과했다. 원인이 Vite의 최초 Worker 변환인지 확정하지 못했다. 이후 단순 합성 1행은 성공했고, orchestrator의 production preview 통합 검사에서 새 브라우저의 첫 혼합 fixture 처리·손상 파일·실제 10초 종료가 모두 통과했다. 0.86초는 전체 테스트 소요 시간이므로 순수 파싱 시간이나 최종 지원 성능으로 사용하지 않는다.

담당자 인계 시 존재했던 병렬 개발 파일의 타입 오류는 통합 검사 시 해소됐으며 전체 strict·린트·단위시험·빌드·E2E를 통과했다.

## 7. 완료 판정과 후속 범위

S00.02 / POC-06의 시험 계약과 실패 복구를 통과해 완료로 판정한다. 입력 상한은 기술 시험용 잠정값이며 S00.05의 규모·메모리 시험 후 최종 지원 범위를 결정한다. ExcelJS의 조건부 채택과 알려진 ZIP·의존성 한계는 §2·5를 따른다. 직원 입력·오류 행 수정·가져오기 제품 화면은 E02의 후속 작업이다.
