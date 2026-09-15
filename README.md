# 조직보드

Windows localhost에서 직원정보와 사진으로 조직보드 인쇄용 PDF를 만드는 프로젝트입니다. 현재는 **E00 기술 시험 환경을 개발 중**이며, 실제 업무용 네 화면과 PDF 생성 기능의 완성을 뜻하지 않습니다.

## 개발 시작

Node.js 24.18.0과 npm 11.16.0으로 검증합니다. 저장소를 받은 개발자는 다음 순서로 실행합니다.

```powershell
npm ci
node scripts/verify-assets.mjs
npm run dev
```

개발서버 터미널에 표시된 localhost 주소를 엽니다. `Ctrl+C`로 종료합니다. npm 설치에는 인터넷이 필요합니다. 런타임용 폰트·모델·WASM은 `public/assets/`에 포함하며 자산 갱신 시에만 `node scripts/prepare-assets.mjs`를 실행합니다.

## 검증

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

브라우저 시험 환경을 처음 준비할 때 필요하면 `npx playwright install chromium`으로 시험용 브라우저를 설치합니다. 결과와 완료 여부는 [검증 기록](doc/verification.md)에 기록합니다.

## 문서

- [요구사항과 개발 계획](doc/README.md)
- [모델별 역할·병렬 실행·선행 조건](doc/development-execution.md)
- [자산 출처와 라이선스](doc/assets.md)
- [개발 검증 기록](doc/verification.md)

시험 데이터는 합성 데이터만 사용합니다. 실제 직원정보나 사진을 저장소에 추가하지 마세요. 사용자용 시작·종료 묶음은 S07.03에서 제공할 예정입니다.
