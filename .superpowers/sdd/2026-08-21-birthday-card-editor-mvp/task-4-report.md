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

## 독립 리뷰 대응 (Important 1–3, Minor 4)

### 적용 정책

- 문서 변경은 **Command 실행 → renderer.render → onDocumentChange**가 모두 성공할 때만 확정한다. 실패하면 Design, selection, History stack snapshot을 복구하고, 복구된 Design을 renderer에 최선으로 재반영한 뒤 최초 오류를 유지한다.
- 모든 비동기 public 작업은 하나의 operation queue를 통과한다. upload와 export도 큐에 포함하며, upload 이후 dispose·명령·render·notification 실패 시 새 asset을 제거하는 보상 작업을 실행한다.
- History는 명령 실행 성공 전 stack을 이동하지 않는다. Composite는 실행/undo 중간 실패 시 완료된 부분을 역순 보상한다.
- Renderer selection은 입력 순서를 유지하며 중복을 제거한다. 같은 Editor 인스턴스의 두 번째 mount는 명확히 거부한다.

### RED → GREEN 기록

- RED 4: render 또는 동기 `onDocumentChange` 실패 뒤 새 요소가 남고 History도 undo 가능 상태로 남는 것을 재현했다. renderer transform/text 이벤트도 실패 후 Domain 변경이 남았다.
- RED 5: undo/redo throw가 stack을 pop한 뒤 기록을 유실하고, Composite와 중복 selection 삭제가 partial mutation을 남기는 것을 재현했다.
- RED 6: upload가 queue 밖에서 실행되어 export가 선행하고, 실패·dispose 뒤 새 asset이 제거되지 않으며, 두 번째 mount가 허용되는 것을 재현했다.
- GREEN 4: History snapshot과 Editor 문서 트랜잭션, 복구 렌더링, 이벤트 error 상태 기록을 추가했다.
- GREEN 5: peek-then-move History, Composite 역보상, selection dedupe를 적용했다.
- GREEN 6: upload→command→render→notification과 export를 단일 generic queue에 넣고 업로드 asset 보상 및 중복 mount 방어를 적용했다.

### 리뷰 대응 검증

- focused Editor/Command test: PASS, 28 tests
- `rtk npm run typecheck`: PASS

## 재검토 대응 (Important 1–4, Minor 5)

### 적용 정책

- `dispose()`는 세대를 증가시키며, 모든 renderer/export await 뒤 해당 세대가 여전히 활성인지 확인한다. 세대가 바뀌면 callback·select·ready 전환 없이 실패하고, 문서 트랜잭션은 Domain·History·selection을 복구한다.
- rollback renderer가 실패하면 최초 오류를 그대로 throw하되 Runtime의 `canvasStatus`를 `error`로 남긴다. dispose된 renderer에는 rollback render를 시도하지 않는다.
- 다중 삭제 대상은 현재 page index 내림차순으로 고정한다. Composite의 역순 undo가 인접·비인접 레이어를 원래 순서로 복구한다.
- Composite 일반 계약은 보상 실패 시 완전 원자성이 아닌 best-effort compensation이다. 최초 오류와 모든 보상 오류를 `AggregateError.errors`에 보존한다. Editor 문서 snapshot rollback은 user-facing 원자성 안전망으로 유지한다.
- `selection:changed`도 동일 operation queue에 넣어 앞선 mutation rollback 이후 FIFO로 반영하고, renderer listener는 이를 await하지 않는다.

### RED → GREEN 기록

- RED 7: rollback render가 실패해도 canvas가 `ready`인 상태, render 대기 중 dispose 뒤 callback/select/asset이 남는 상태, 두 번째 selection event가 rollback에 유실되는 상태를 재현했다.
- RED 8: 선택 순서에 의존하는 다중 삭제 undo가 `[a,b,d,c]`를 만드는 상태와 Composite 보상 오류를 삼키는 상태를 재현했다.
- GREEN 7: generation token 검증, disposed rollback-render 차단, recovery-render 실패의 `canvasStatus='error'`, FIFO selection queue를 적용했다.
- GREEN 8: 내림차순 multi-delete command 구성 및 `AggregateError` 기반 best-effort compensation 오류 보존을 적용했다.

### 재검토 검증

- focused Editor/Command test: PASS, 37 tests
- `rtk npm run lint`: PASS
- `rtk npm run typecheck`: PASS
- `rtk npm test`: PASS, 6 files / 69 tests
- `rtk git diff --check`: PASS

## 최종 리뷰 대응 (Important 1–2)

### 적용 정책

- 문서 트랜잭션의 실패 가능한 순서는 `render → generation 검증 → select → generation 검증 → onDocumentChange`다. 동기 `onDocumentChange`는 commit 경계의 마지막 호출이므로 그 뒤에는 rollback을 일으킬 수 있는 작업이나 검증을 두지 않는다.
- 첫 `mount()` 호출은 renderer 결합 가능성이 시작되는 순간 `mountAttempted`로 기록한다. render/select가 실패해도 같은 Editor 인스턴스는 재-mount하지 않아 reset/unmount Port가 없는 renderer를 재결합하지 않는다.

### RED → GREEN 기록

- RED 9: select가 실패해도 `onDocumentChange`가 새 Design으로 한 번 호출되는 상태와, 초기 render/select 실패 후 두 번째 mount가 renderer를 다시 mount하는 상태를 재현했다.
- GREEN 9: select를 저장 알림보다 앞으로 이동하고, mountAttempted 수명주기 플래그를 영구화했다. 이미지 select 실패에도 새 asset 보상이 수행되고 Store/History가 rollback되는 것을 고정했다.

### 최종 리뷰 검증

- focused Editor/Command test: PASS, 40 tests
- `rtk npm run lint`: PASS
- `rtk npm run typecheck`: PASS
- `rtk npm test`: PASS, 6 files / 72 tests
- `rtk git diff --check`: PASS

## 승인 리뷰 마지막 대응 (Important 1)

### 적용 정책

- 업로드가 성공한 뒤 문서 transaction이 실패하면 add/replace 이미지 모두 같은 보상 helper로 새 asset을 한 번 제거한다.
- 제거가 성공하면 원래 transaction 오류 객체를 그대로 throw한다. 제거도 실패하면 asset ID와 보상 실패 맥락을 포함한 `AggregateError`로 원래 오류와 cleanup 오류를 함께 노출한다.
- upload 자체가 실패한 경우에는 아직 생성된 asset이 없으므로 remove를 호출하지 않는다.

### RED → GREEN 기록

- RED 10: addImage와 replaceSelectedImage에서 remove 실패가 조용히 무시되고 원래 transaction 오류만 반환되는 상태를 재현했다.
- GREEN 10: `rethrowAfterUploadedAssetCompensation` 공통 helper로 원래 오류 identity 및 두 오류를 가진 `AggregateError.errors`를 구분해 보존했다.

### 승인 리뷰 검증

- focused Editor/Command test: PASS, 44 tests
- `rtk npm run typecheck`: PASS
