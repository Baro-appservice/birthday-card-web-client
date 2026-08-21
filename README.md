# Birthday Canvas Web Client

브라우저에서 자기 생일 카드를 꾸미고 자동 저장한 뒤 `1080 × 1350` PNG로 내려받는 Next.js 편집기 MVP입니다. 기본 샘플과 편집 흐름은 백엔드나 외부 네트워크 없이 동작합니다.

## 요구 사항

- Node.js `20.9.0` 이상
- npm
- E2E 실행 시 Playwright Chromium

현재 검증 환경은 Node.js `22.22.3`입니다.

## 설치와 실행

```bash
npm ci
npm run dev
```

브라우저에서 [http://localhost:3000/editor/local-demo](http://localhost:3000/editor/local-demo)를 엽니다.

production build를 확인하고 실행하려면 다음 명령을 사용합니다.

```bash
npm run build
npm run start
```

## 검증 명령

```bash
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

`npm run check`는 lint, typecheck, Vitest, production build를 차례로 실행합니다. `npm run test:e2e`는 전용 `127.0.0.1:3100` 개발 서버를 자동으로 시작하고 데스크톱, 390px 모바일, 820px 태블릿 Chromium 흐름을 검증합니다.

## 브라우저 저장 초기화

카드 Design과 업로드 이미지는 현재 브라우저의 IndexedDB `birthday-canvas` 데이터베이스에 저장됩니다. 로컬 데이터를 모두 초기화하려면 편집기 탭을 닫고 같은 origin의 개발자 도구 Console에서 다음을 실행한 뒤 페이지를 새로고침합니다.

```js
indexedDB.deleteDatabase('birthday-canvas');
```

이 작업은 해당 origin에 저장된 모든 로컬 카드와 업로드 이미지를 삭제하며 복구할 수 없습니다.

## 손상 문서 복구와 저장 재시도

현재 저장 문서가 손상되었거나 지원하지 않는 버전이면 편집기는 이를 자동으로 덮어쓰지 않습니다. 사용자가 직전 정상 카드 또는 샘플 카드를 명시적으로 선택한 뒤에만 복구 문서를 메모리에 적용하고 저장을 시도합니다.

복구 문서의 IndexedDB 저장이 실패해도 복구한 in-memory Design으로 편집 화면에는 진입합니다. 상단의 `저장 실패 · 다시 시도` 상태와 오류 원인은 계속 표시되며, `다시 시도`를 누르면 같은 복구 문서를 다시 영속화합니다. 저장이 확인되기 전에는 브라우저 탭을 닫거나 새로고침하지 않는 것이 안전합니다.

## 아키텍처와 저장 범위

제품이 소유하는 `Design` JSON이 저장 원본이며 Fabric.js 객체는 화면 렌더링과 포인터 상호작용에만 사용됩니다. React UI는 Fabric API를 직접 호출하지 않고 `Editor` 경계를 통해 편집합니다. Design과 이미지 asset은 IndexedDB Adapter 뒤에 저장되고 Design에는 Fabric JSON, Blob URL, 이미지 바이너리가 포함되지 않습니다.

이번 MVP에는 계정, 서버 동기화, 공유 링크, 게시 기능이 없습니다. 저장 내용은 브라우저와 origin에 종속되므로 브라우저 데이터 삭제, 시크릿 모드 종료, 다른 기기 또는 다른 origin에서는 이어서 편집할 수 없습니다.

## 보안 감사 예외와 공개 배포 gate

`Next.js 16.2.11`은 승인된 MVP 고정 버전이므로 이번 로컬 개발 범위에서는 의존성 버전을 변경하지 않습니다. `npm audit`가 보고하는 이 버전의 transitive PostCSS/Sharp 취약 경로는 **로컬 MVP 실행에만 한정해 허용한 예외**이며, 인터넷에 공개 배포해도 된다는 승인이 아닙니다.

공개 환경으로 배포하기 전에는 반드시 별도 승인 아래 Next.js를 `16.3.1` 이상인 안전한 승인 버전으로 올리고, lint, typecheck, 전체 Vitest, production build, 전체 Playwright 회귀와 `npm audit`를 다시 통과해야 합니다. 이 upgrade와 전체 회귀 검증이 완료되지 않으면 공개 배포를 중단합니다.
