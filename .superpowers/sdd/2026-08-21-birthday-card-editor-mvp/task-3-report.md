# Task 3 구현 보고서: Port와 책임별 Zustand Store

## 변경 요약

- `EditorRenderer`, `DesignRepository`, `AssetGateway`, `DesignExporter`의 네 외부 Port 계약과 재수출 진입점을 추가했다.
- `Design`, `Editor Runtime`, `Editor UI` 상태를 서로 독립적인 Zustand vanilla Store factory로 분리했다.
- Design Store는 Task 2의 불변 Design 연산만 재사용하고, Runtime Store는 25%~200% zoom 제한을 적용한다.
- UI Store는 패널, 모바일 시트, 저장 상태, 오류, 복구 안내만 소유한다.

## RED 증거

구현 전 `rtk npm test -- src/features/editor/model/editor-stores.test.ts`를 실행했다.

결과: `./design-store`를 resolve하지 못해 1개 test file이 실패했다. 이는 Store factory가 아직 없어서 발생한 의도된 실패다.

## GREEN 및 리팩터링 증거

- 최소 Port/Store 구현 후 focused test를 실행해 6개 테스트가 통과했다.
- 테스트가 실제 Store 상태 전이, Store 간 비간섭, zoom 상·하한, UI 상태 전이를 검증하도록 구성했다. mock은 사용하지 않았다.
- Design Store는 요소/레이어/배경 변경 로직을 중복 구현하지 않고 Task 2의 `addElement`, `replaceElement`, `removeElement`, `moveElement`, `setPageBackground`를 호출한다.

## 변경 파일

- `src/features/editor/core/ports/editor-renderer.ts`
- `src/features/editor/core/ports/design-repository.ts`
- `src/features/editor/core/ports/asset-gateway.ts`
- `src/features/editor/core/ports/design-exporter.ts`
- `src/features/editor/core/ports/index.ts`
- `src/features/editor/model/design-store.ts`
- `src/features/editor/model/editor-runtime-store.ts`
- `src/features/editor/model/editor-ui-store.ts`
- `src/features/editor/model/editor-stores.test.ts`

## 검증

```text
rtk npm test -- src/features/editor/model/editor-stores.test.ts  # 1 file, 6 tests PASS
rtk npm run lint                                                  # PASS
rtk npm run typecheck                                             # PASS
rtk npm test                                                      # 4 files, 31 tests PASS
```

## 우려 및 후속 작업

- 현재 MVP는 단일 페이지 편집이므로 Runtime Store의 기본 `activePageId`는 `page-1`이다. Design Store actions는 pageId를 명시적으로 받아 향후 다중 페이지 UI가 추가돼도 document 연산의 대상이 모호해지지 않게 했다.
- Port는 계약만 정의한다. IndexedDB, Asset, Fabric, PNG 구현체는 이후 Task에서 Port를 통해 주입한다.
