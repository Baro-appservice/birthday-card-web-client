# Task 4 구현 보고서 — Command, History, Editor facade

## RED → GREEN 기록

- RED 1: `editor-history.test.ts`, `editor.test.ts`를 먼저 추가한 뒤 `rtk npm test -- src/features/editor/core src/features/editor/commands`를 실행했다. `editor-history`, `editor`, Command 모듈을 찾지 못해 요구 기능 부재로 2개 suite가 실패했다.
- GREEN 1: Command/History와 Editor facade를 구현한 뒤 focused test 12개가 통과했다.
- RED 2: Add 명령이 생성 시점의 레이어 삽입 위치를 보존해야 한다는 테스트를 추가했다. 명령 생성 뒤 다른 요소가 추가되면 대상이 마지막에 붙어 실패했다.
- GREEN 2: `AddElementCommand`가 생성 시점의 index를 캡처하고 execute/redo에서 그 index로 이동하도록 보완해 focused test 13개가 통과했다.
- RED 3: 느린 첫 `renderer.render()` 중 두 번째 명령이 들어올 때 render와 `onDocumentChange`가 직렬화되어야 한다는 테스트를 추가했다. render가 즉시 두 번 시작되어 실패했다.
- GREEN 3: Editor 내부 operation queue로 문서 명령·undo·redo·mount를 직렬화해 focused Editor test 9개가 통과했다.

## 변경 파일

- `src/features/editor/core/editor-command.ts`
- `src/features/editor/core/editor-history.ts`
- `src/features/editor/core/editor-history.test.ts`
- `src/features/editor/core/editor.ts`
- `src/features/editor/core/editor.test.ts`
- `src/features/editor/commands/add-element-command.ts`
- `src/features/editor/commands/delete-element-command.ts`
- `src/features/editor/commands/update-element-command.ts`
- `src/features/editor/commands/transform-element-command.ts`
- `src/features/editor/commands/reorder-element-command.ts`
- `src/features/editor/commands/change-background-command.ts`
- `src/features/editor/index.ts`

## 검증

- `rtk npm test -- src/features/editor/core/editor-history.test.ts` — PASS, 5 tests
- `rtk npm test -- src/features/editor/core src/features/editor/commands` — PASS, 13 tests
- `rtk npm run lint` — PASS
- `rtk npm run typecheck` — PASS
- `rtk npm test` — PASS, 6 files / 46 tests
- `rtk git diff --check` — PASS

## 우려와 후속 연결점

- Renderer event는 Port 계약상 동기 콜백이므로 이벤트 처리 중 render 오류는 호출자에게 반환할 수 없다. unhandled rejection을 막고 Runtime의 `canvasStatus`를 `error`로 전환하도록 처리했다.
- `EditorApi` 계약은 brief와 동일하게 유지했다. 구독 해제와 renderer 정리를 위한 `dispose()`는 concrete `Editor`에만 제공하므로, 이후 Provider 조립 단계에서 unmount 시 이를 호출해야 한다.
