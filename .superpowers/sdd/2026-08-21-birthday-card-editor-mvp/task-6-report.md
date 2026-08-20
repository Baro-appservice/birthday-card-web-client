# Task 6 구현 보고

## 변경 사항

- Fabric 객체의 `elementId`는 `WeakMap` metadata로만 관리하여 저장 Domain에 Fabric 데이터가 섞이지 않게 했다.
- Design 요소를 `Textbox`, `Rect`, `Ellipse`, `FabricImage`로 변환하고, 이미지 URL은 `AssetGateway`에서 해석했다.
- Fabric transform의 0·`NaN`·무한대 값을 유효한 Domain `TransformSnapshot`으로 정규화했다.
- selection, transform, text-edit lifecycle을 `EditorEvent`로 단일화하고 중복 프레임·metadata 누락·중복 해제를 안전하게 처리했다.
- 렌더 세대 번호로 느린 이미지 로드의 stale render를 차단하고 선택을 복원했다.
- `StaticCanvas` 기반 1080×1350 PNG exporter가 이미지 로드 완료와 `toBlob()` 실패를 처리하며 항상 dispose하도록 구현했다.

## 검증

- `npm test -- src/features/editor/fabric` — 2 files, 11 tests passed
- `npm run typecheck` — passed
- `npm run lint` — passed
- `npm test` — 12 files, 118 tests passed
- `npm run build` — passed
- `git diff --check` — passed

초기 sandbox build는 Turbopack CSS 처리의 local port bind 제한으로 실패했으며, 동일 명령을 권한 확장으로 재실행해 성공을 확인했다.

---

## 리뷰 수정 1차

### 반영 내용

- `selection:created`와 `selection:updated`는 Fabric 7.4의 delta payload를 사용하지 않고 `canvas.getActiveObjects()`의 전체 선택 순서를 읽는다. 중복 ID는 순서를 유지해 제거한다.
- 복수 선택 `ActiveSelection`에는 이동·X/Y 크기 변경·회전 lock을 명시적으로 설정했다. 따라서 다중 선택은 delete/layer 조작에는 남아 있으나 Domain 단일 transform event를 만들 수 없다.
- Textbox 생성 뒤 실제 Fabric base `height`와 `width`를 기준으로 scale을 보정해, Domain의 명시적 width/height가 `readTransform()`을 왕복해도 보존된다. 텍스트 편집 뒤 재매핑도 같은 계약을 따른다.
- Fabric-aware fake를 사용해 renderer의 stale image generation, 선택 복원/없는 ID, mount·subscribe·unsubscribe·dispose teardown을 검증했다.
- StaticCanvas fake로 exporter의 1080×1350/options literal, `toBlob()` null/error, 항상 dispose를 검증했다.

### RED 증거

실행:

```bash
rtk npm test -- src/features/editor/fabric/fabric-event-adapter.test.ts src/features/editor/fabric/fabric-element-mapper.test.ts src/features/editor/fabric/fabric-editor-renderer.test.ts
```

결과: 3 files 중 3 failed, 17 tests 중 4 failed.

- `selection:updated`가 `['title', 'name']` 대신 delta `['name']`를 emit했다.
- 샘플 title의 `readTransform()` height가 Domain `130` 대신 Textbox base `81.36`이었다.
- renderer public tests 두 개는 sample image를 실제 jsdom image loader로 통과시켜 timeout이 났다. Canvas를 검증하지 않는 text-only fixture로 바꿔 Fabric-aware fake 경계를 유지했다.

### GREEN 증거

```bash
rtk npm test -- src/features/editor/fabric
rtk npm run typecheck
rtk npm run lint
rtk npm test
rtk npm run build
rtk git diff --check
```

- `fabric-event-adapter.test.ts`, `fabric-element-mapper.test.ts`, `fabric-editor-renderer.test.ts`, `fabric-design-exporter.test.ts`: 4 files, 21 tests passed.
- typecheck와 lint passed.
- 전체: 14 files, 128 tests passed.
- build passed. 최초 sandbox build의 Turbopack local port bind 제한은 권한 확장 재실행으로 해소됐다.
- diff check passed.

---

## 리뷰 수정 2차

### 추가 회귀 범위

- `fabric-event-adapter.test.ts`에 Fabric 7.4 removal delta 시나리오를 추가했다. active objects가 `[title, name]`에서 `[title]`로 바뀌고 event payload가 `selected: []`, `deselected: [name]`만 제공해도 `selection:changed`는 payload-derived 값이 아니라 전체 현재 상태 `['title']`를 emit하는지 확인한다.
- 기존 add delta 시나리오는 유지했다.

### RED/GREEN 증거

코드 변경 전 새 회귀 테스트를 먼저 추가하고 실행했다.

```bash
rtk npm test -- src/features/editor/fabric/fabric-event-adapter.test.ts
```

결과: 1 file, 8 tests passed. 이 test-only round에서는 1차 수정의 `canvas.getActiveObjects()` 구현이 이미 올바른 removal 동작을 제공했으므로 production defect가 재현되지 않았고 코드 수정은 하지 않았다.

최종 검증 명령:

```bash
rtk npm test -- src/features/editor/fabric
rtk npm run typecheck
rtk npm run lint
rtk npm test
rtk git diff --check
```

결과:

- Fabric: 4 files, 22 tests passed.
- typecheck와 lint passed.
- 전체: 14 files, 129 tests passed.
- diff check passed.
