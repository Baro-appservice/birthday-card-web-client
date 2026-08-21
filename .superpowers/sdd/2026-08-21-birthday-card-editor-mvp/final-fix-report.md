# Birthday Card Editor MVP 최종 수정 보고서

- 작업일: 2026-08-21
- FIX_BASE: `bf9e0f03a18fa2aca30d7873e3385d02f56eb1e7`
- 기준 문서:
  - `docs/superpowers/specs/2026-08-21-birthday-card-editor-mvp-design.md`
  - `docs/superpowers/plans/2026-08-21-birthday-card-editor-mvp.md`
  - `ARCHITECTURE_NEXT_NEST.md`
  - `.superpowers/sdd/2026-08-21-birthday-card-editor-mvp/progress.md`

## 결론

최종 whole-branch 리뷰에서 확인된 중요 항목 5개, 즉 빈 페이지 문서 허용, 이미지 한 장 실패의 전체 Canvas 전파, 사용자 다중 선택 변형, assembly 초기화/Canvas 실패 재시도 부재, 100% 초과 줌 접근성 문제를 모두 수정했다. 함께 요청된 minor 5개와 정책/문서 3개도 반영했다.

최종 상태는 ESLint, TypeScript, Vitest 206건, production build, Playwright 9건이 모두 통과한다. `npm audit`는 버전을 바꾸거나 자동 수정하지 않고 관찰했으며, 고정된 Next.js 16.2.11의 transitive PostCSS/Sharp 경로에서 high 3건을 보고한다. 이 예외는 README에 로컬 MVP 한정으로 명시했고 공개 배포 전 승인된 Next.js 16.3.1 이상 upgrade와 전체 회귀를 gate로 기록했다.

## RED → GREEN 증거

### 1. Design 무결성, 글꼴, 입력 경계, sidebar, PNG 검증

RED:

```text
npm test -- design-schema indexeddb-design-repository editor fabric-element-mapper editor-desktop png-metadata
Test Files 6 failed
Tests 12 failed | 68 passed
```

- `pages: []`가 schema를 통과했다.
- 신규/샘플 텍스트가 승인되지 않은 `Pretendard`를 저장했다.
- 알 수 없는 기존 글꼴의 UI/Canvas fallback이 없었다.
- 임시로 비운 font-size가 즉시 `0`을 Editor에 보냈고 Editor 경계도 비정상 값을 허용했다.
- `readTransform`이 `Number.MAX_VALUE * 2` 결과인 `Infinity`를 반환했다.
- sidebar가 완결되지 않은 tab semantics를 사용했다.
- E2E PNG 검증은 일부 signature만 확인했다. 독립 helper unit test를 먼저 추가해 모듈 부재/잘못된 header 허용을 RED로 확인했다.

GREEN:

```text
npm test -- src/entities/design/model/design-schema.test.ts \
  src/features/editor/persistence/browser/indexeddb-design-repository.test.ts \
  src/features/editor/core/editor.test.ts \
  src/features/editor/fabric/fabric-element-mapper.test.ts \
  src/widgets/editor/editor-desktop.test.tsx \
  src/features/editor/lib/png-metadata.test.ts
Test Files 6 passed
Tests 85 passed
```

- `Design.pages`를 최소 1개로 제한했다.
- 빈 페이지 current record는 recoverable corrupt가 되고, 유효 backup을 보존/제공하는 repository 회귀를 추가했다.
- sample과 신규 텍스트는 `system-ui`를 사용한다. legacy unknown font는 Domain을 고치지 않고 Adapter/UI에서 `system-ui`로 표시한다.
- font-size는 draft에 머물며 blur/Enter에서만 12–160으로 clamp한다. 빈 문자열/NaN은 원래 값으로 복구하며 Editor도 범위 밖·비유한 patch를 거부한다.
- transform 곱셈 결과도 유한하고 양수인지 검사한다.
- tool sidebar는 일반 button + `aria-pressed` 의미로 단순화했다.
- PNG helper는 최소 24 bytes, 전체 8-byte signature `89504e470d0a1a0a`, 첫 chunk length 13, `IHDR`, 양수 dimensions를 검증한다.

### 2. 이미지 부분 실패와 단일 선택 계약

RED:

```text
npm test -- fabric-element-mapper fabric-editor-renderer \
  fabric-design-exporter fabric-event-adapter editor
Test Files 5 failed
Tests 11 failed | 55 passed
```

- asset URL resolve/decode 하나가 실패하면 page mapper Promise가 reject되어 다른 text/shape까지 렌더/편집/export되지 않았다.
- Fabric Canvas가 marquee와 Shift `ActiveSelection`을 허용했다.
- programmatic multi-selection과 Editor delete가 여러 ID를 유지/변형하는 테스트 계약을 가지고 있었다.

GREEN:

```text
npm test -- src/features/editor/fabric/fabric-element-mapper.test.ts \
  src/features/editor/fabric/fabric-editor-renderer.test.ts \
  src/features/editor/fabric/fabric-design-exporter.test.ts \
  src/features/editor/fabric/fabric-event-adapter.test.ts \
  src/features/editor/core/editor.test.ts
Test Files 5 passed
Tests 66 passed

npx playwright test e2e/editor.spec.ts \
  -g 'Shift와 marquee는 사용자 다중 선택이나 저장되지 않는 group transform을 만들지 않는다'
1 passed
```

- 각 image 실패를 Adapter 내부 Fabric `Rect` placeholder로 격리했다. placeholder는 원래 `elementId`, 위치, 크기, 회전을 보존하고 Domain에 상태를 추가하지 않는다.
- renderer/selection/exporter의 부분 실패 테스트에서 정상 text/shape와 placeholder가 함께 살아 있고 선택/export 가능함을 확인했다.
- 기존 stale render generation 방어도 유지했다.
- Canvas 생성 경계에 `selection: false`, `selectionKey: null`, `altSelectionKey: null`을 적용했다.
- renderer와 event adapter, Editor UI selection은 최대 첫 ID 하나로 정규화한다. UI delete도 첫 유효 ID만 처리한다.
- 실제 Chromium에서 Shift click 및 marquee 뒤 group transform/미저장 변형이 생기지 않음을 검증했다.

### 3. 전체 assembly 재시도와 복구 저장 실패 정책

RED:

```text
npm test -- src/features/editor/context/editor-provider.test.tsx
Test Files 1 failed
Tests 4 failed | 7 passed
```

- IndexedDB/factory 실패 뒤 접근 가능한 retry가 없었다.
- 같은 Editor의 두 번째 mount가 금지되어 있는데 Canvas mount/render 실패는 새 assembly가 아니라 reload 또는 고착 상태로 끝났다.
- cleanup 한 단계가 throw하면 뒤 자원이 정리되지 않을 수 있었다.

GREEN:

```text
npm test -- src/features/editor/context/editor-provider.test.tsx
Test Files 1 passed
Tests 11 passed

npm test -- src/features/editor/hooks/use-editor-session.test.tsx
Test Files 1 passed
Tests 6 passed
```

- `retryAssembly`가 기존 publication을 먼저 제거하고, 이전 assembly의 flush/dispose/Editor/asset/DB cleanup을 차례로 수행한 뒤 factory로 새 assembly를 만든다.
- cleanup 실패는 해당 단계에 격리되어 다음 cleanup과 fresh factory 생성이 계속된다.
- 취소된 느린 setup은 stale publication하지 않고 생성된 assembly를 정리한다.
- factory fail→retry success, Canvas mount fail→retry success, render fail→retry success, cleanup failure continuation, retry focus를 테스트했다.
- `EditorErrorState` action은 accessible button이며 error 진입 시 focus된다.
- 실제 `SaveCoordinator`를 사용한 integration test로 복구 저장 실패 후에도 recovered in-memory Design이 ready editor에 들어가고 saveStatus/saveError가 보이며 retry가 같은 Design을 영속화함을 확인했다.

### 4. 25%–200% 줌의 실제 scroll layout

RED:

```text
npm test -- src/widgets/editor/editor-desktop.test.tsx \
  src/widgets/editor/editor-responsive.test.tsx
Tests 2 failed | 5 passed
```

- transform-only 확대는 layout `scrollWidth`/`scrollHeight`에 반영되지 않아 200% Canvas edge에 접근할 수 없었다.
- 초기 실제 브라우저 RED에서 25% stage의 변형 surface가 각각 35px, 54px의 잘못된 overflow를 만들었다.

GREEN:

```text
npm test -- src/widgets/editor/editor-desktop.test.tsx \
  src/widgets/editor/editor-responsive.test.tsx
Test Files 2 passed
Tests 7 passed

npx playwright test e2e/editor.spec.ts -g '25%와 200%'
1 passed

npx playwright test e2e/editor-mobile.spec.ts -g '25%'
2 passed (390px, 820px)
```

- 하나의 Canvas DOM을 실제 크기의 zoom stage 안에 두었다. stage width/height가 배율을 반영해 진짜 scroll extent를 만든다.
- zoom surface transform은 stage 내부 시각 배율만 담당하며 stage overflow를 격리한다.
- 25%에서 card가 맞으면 중앙 정렬되고 불필요한 overflow가 없으며, 200%에서는 start/end edge까지 scroll할 수 있다.
- desktop, 390px mobile, 820px tablet에서 edge 접근성과 Canvas DOM identity 불변을 실제 Chromium으로 검증했다.

### 5. 최종 전체 회귀에서 발견한 E2E selector

RED:

```text
npm run test:e2e
1 failed | 8 passed
```

- accessible button 이름을 단순화하면서 `getByRole('button', { name: '사진' })`이 “사진” tool과 “사진 레이어 선택” 둘 다 부분 일치했다.

GREEN:

```text
npm run test:e2e
9 passed
```

- tool button 선택자에 `exact: true`를 추가해 테스트 의도를 명확히 했다.

### 6. lint 피드백

RED:

```text
npm run lint
react-hooks/set-state-in-effect: FontSizeInput prop 동기화 effect
```

GREEN:

- 동기화 effect를 제거하고 `${selected.id}:${selected.fontSize}` key로 외부 확정 값이 바뀔 때 draft 인스턴스를 재생성했다.
- 최종 `npm run lint` 통과.

## 최종 검증

```text
npm run lint
PASS

npm run typecheck
PASS

npm test
Test Files 25 passed (25)
Tests 206 passed (206)

npm run build
Next.js 16.2.11 (Turbopack)
Compiled successfully
TypeScript, static page generation, page optimization PASS

npm run test:e2e
9 passed

git diff --check
PASS
```

production build는 최초 sandbox 실행에서 Turbopack CSS worker의 local process/port 생성이 `Operation not permitted`로 차단되었다. 같은 tree와 명령을 권한 허용 환경에서 재실행해 성공했으므로 코드/타입/build 오류가 아닌 실행 sandbox 제약으로 판정했다.

## 경계 검색

```text
rg "from ['\"]fabric|import\\(['\"]fabric" src/app src/widgets src/shared
no matches

rg "from ['\"]fabric|import\\(['\"]fabric" src
matches only src/features/editor/fabric and its tests

rg "from ['\"](react|next|fabric|zustand)|blob:|URL.createObjectURL|toJSON" src/entities/design
no production matches
```

Domain의 `blob:` 검색 결과는 schema가 transient URL을 그대로 보존하는 기존 round-trip 테스트 fixture 두 곳뿐이다. 실제 Blob 생성/URL 수명과 Fabric API는 Adapter/feature 경계에 남아 있다.

## 변경 파일

Domain·Core·Persistence:

- `src/entities/design/model/design-schema.ts`
- `src/entities/design/model/design-schema.test.ts`
- `src/entities/design/model/sample-design.ts`
- `src/features/editor/core/editor.ts`
- `src/features/editor/core/editor.test.ts`
- `src/features/editor/persistence/browser/indexeddb-design-repository.test.ts`
- `src/features/editor/lib/png-metadata.ts`
- `src/features/editor/lib/png-metadata.test.ts`

Fabric Adapter:

- `src/features/editor/fabric/fabric-element-mapper.ts`
- `src/features/editor/fabric/fabric-element-mapper.test.ts`
- `src/features/editor/fabric/fabric-editor-renderer.ts`
- `src/features/editor/fabric/fabric-editor-renderer.test.ts`
- `src/features/editor/fabric/fabric-event-adapter.ts`
- `src/features/editor/fabric/fabric-event-adapter.test.ts`
- `src/features/editor/fabric/fabric-design-exporter.test.ts`

Assembly·Session:

- `src/features/editor/context/editor-context.ts`
- `src/features/editor/context/editor-provider.tsx`
- `src/features/editor/context/editor-provider.test.tsx`
- `src/features/editor/hooks/use-editor.ts`
- `src/features/editor/hooks/use-editor-session.test.tsx`
- `src/features/editor/testing/editor-test-kit.tsx`

UI·Layout:

- `src/widgets/editor/canvas/editor-canvas.tsx`
- `src/widgets/editor/canvas/editor-canvas.module.css`
- `src/widgets/editor/editor-screen.tsx`
- `src/widgets/editor/editor-error-state.tsx`
- `src/widgets/editor/editor-desktop.test.tsx`
- `src/widgets/editor/editor-responsive.test.tsx`
- `src/widgets/editor/sidebar/editor-sidebar.tsx`
- `src/widgets/editor/toolbar/contextual-toolbar.tsx`

E2E·문서:

- `e2e/editor-helpers.ts`
- `e2e/editor.spec.ts`
- `e2e/editor-mobile.spec.ts`
- `README.md`
- `.superpowers/sdd/2026-08-21-birthday-card-editor-mvp/final-fix-report.md`

## 결정 및 정책

1. 손상/미지원 문서의 자동 덮어쓰기는 하지 않는다. 사용자가 recovery를 선택하면 recovered Design으로 ready 상태에 진입하고, 저장 실패 상태/오류는 계속 노출하며 retry로 동일 Design을 영속화한다.
2. user-created multi-selection은 MVP에서 금지한다. 내부 인터페이스가 `string[]`를 유지하더라도 실제 Fabric/UI boundary는 최대 한 ID만 허용한다.
3. 깨진 image placeholder는 Adapter 전용이다. Domain schema나 저장 JSON에는 placeholder/error 필드를 넣지 않는다.
4. mobile에서도 Task 9 ruling대로 physical keyboard shortcut을 계속 활성화한다. 기존 mobile Ctrl+Z 회귀 테스트를 유지했다.
5. Next.js 16.2.11과 dependency range는 이번 wave에서 바꾸지 않는다. audit 예외는 local MVP에만 한정하고 public deployment는 승인된 Next.js 16.3.1 이상 upgrade 및 전체 regression 전까지 금지한다.

## npm audit 관찰과 남은 우려

```text
npm audit
3 high severity vulnerabilities
- postcss <= 8.5.22 (Next.js transitive)
- sharp < 0.35.0 / libvips advisories (Next.js transitive)
fix suggestion: npm audit fix --force -> next@16.3.1
```

요청대로 `npm audit fix` 또는 dependency version 변경은 실행하지 않았다. 기능/회귀 blocker는 없다. 유일한 잔여 우려는 이 고정 dependency audit 예외이며, 공개 배포 전에 README의 gate를 반드시 해소해야 한다.
