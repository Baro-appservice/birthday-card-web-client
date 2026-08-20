# 자기 생일 카드 편집기 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자가 완성된 자기 생일 샘플 카드를 반응형 편집기에서 수정하고, 브라우저에 안전하게 저장·복원하며, Undo/Redo와 PNG 다운로드까지 수행할 수 있는 Next.js MVP를 만든다.

**Architecture:** 제품 소유 `Design` JSON을 원본으로 두고 UI는 `Editor` API만 호출한다. Fabric.js, IndexedDB, Asset 저장, PNG 출력은 각각 Port 뒤의 Adapter로 격리하며, 의미 있는 변경은 Command와 History를 거쳐 Design Store에 반영한다.

**Tech Stack:** Next.js 16.2.11, React 19.2, TypeScript, Fabric.js 7.4.0, Zustand 5.0.15, Zod 4.4.3, Tailwind CSS 4.3.3, IndexedDB, Vitest 4.1.10, React Testing Library 16.3.2, Playwright 1.62.1

**Spec:** `docs/superpowers/specs/2026-08-21-birthday-card-editor-mvp-design.md`

## Global Constraints

- 현재 폴더 자체를 독립 Next.js 애플리케이션으로 사용한다.
- Next.js는 `16.2.11`, Tailwind CSS는 `4.3.3`으로 고정한다.
- Fabric.js 객체를 영구 Domain 또는 저장 모델로 사용하지 않는다.
- React UI는 Fabric.js를 직접 조작하지 않고 Editor 경계를 통한다.
- `entities/design`은 Next.js, React, Zustand, Fabric.js를 import하지 않는다.
- 교체 가능한 Port는 `EditorRenderer`, `DesignRepository`, `AssetGateway`, `DesignExporter` 네 개로 제한한다.
- Design 좌표와 PNG 출력은 `1080 × 1350`, 화면 비율은 `4:5`다.
- 768px 미만은 모바일, 768px 이상 1024px 미만은 태블릿, 1024px 이상은 데스크톱 편집 UI를 사용한다.
- 디자인과 업로드 이미지는 IndexedDB에 저장하되, Domain에는 Blob URL이나 Fabric JSON을 기록하지 않는다.
- 이번 계획은 백엔드, 인증, 공유 링크, 댓글, 좋아요, 템플릿 갤러리, 이미지 자르기, 멀티 페이지를 포함하지 않는다.
- 모든 커밋은 논리적인 기능 단위로 만들고 한국어 제목과 상세 본문에 변경 이유와 검증 명령을 기록한다.

---

## File Map

### Application foundation

- `package.json`: 고정 의존성, 개발·검증 스크립트
- `next.config.ts`, `tsconfig.json`, `eslint.config.mjs`, `postcss.config.mjs`: Next.js와 품질 도구 설정
- `vitest.config.ts`, `vitest.setup.ts`, `playwright.config.ts`: 단위·컴포넌트·E2E 테스트 설정
- `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`: 루트 화면과 전역 디자인 토큰

### Product-owned design domain

- `src/entities/design/model/element.ts`: Text, Image, Shape 요소 타입
- `src/entities/design/model/design.ts`: Design, DesignPage 타입과 상수
- `src/entities/design/model/design-schema.ts`: Zod 런타임 검증
- `src/entities/design/model/design-operations.ts`: 요소 추가·수정·삭제·레이어 순서의 순수 함수
- `src/entities/design/model/sample-design.ts`: 자기 생일 샘플 문서
- `src/entities/design/index.ts`: Domain 공개 API

### Editor application

- `src/features/editor/core/ports/*.ts`: 네 개의 외부 Port와 EditorEvent 타입
- `src/features/editor/model/*.ts`: Design, Runtime, UI Zustand vanilla Store
- `src/features/editor/core/editor-history.ts`: Command 실행, Undo, Redo
- `src/features/editor/commands/*.ts`: 추가, 삭제, 수정, transform, 레이어, 배경 Command
- `src/features/editor/core/editor.ts`: UI가 사용하는 단일 Editor facade

### Infrastructure adapters

- `src/features/editor/persistence/browser/editor-db.ts`: IndexedDB 연결과 record 타입
- `src/features/editor/persistence/browser/indexeddb-design-repository.ts`: Design 저장·백업·복구 상태
- `src/features/editor/persistence/browser/browser-asset-gateway.ts`: 번들 Asset과 업로드 Blob 처리
- `src/features/editor/persistence/save-coordinator.ts`: debounce 저장과 재시도
- `src/features/editor/fabric/fabric-element-mapper.ts`: Domain에서 Fabric Object로 변환
- `src/features/editor/fabric/fabric-event-adapter.ts`: Fabric 이벤트를 EditorEvent로 변환
- `src/features/editor/fabric/fabric-editor-renderer.ts`: Canvas lifecycle과 전체 렌더링
- `src/features/editor/fabric/fabric-design-exporter.ts`: PNG Blob 생성

### React composition

- `src/features/editor/context/editor-provider.tsx`: Store, Editor, Adapter 조립
- `src/features/editor/hooks/use-editor.ts`: UI용 Editor facade 접근
- `src/features/editor/hooks/use-editor-session.ts`: load, initialize, save, recover 흐름
- `src/features/editor/hooks/use-keyboard-shortcuts.ts`: 데스크톱 단축키
- `src/widgets/editor/editor-screen.tsx`: 반응형 편집기 화면 조합
- `src/widgets/editor/toolbar/*.tsx`: 상단 및 맥락 툴바
- `src/widgets/editor/sidebar/*.tsx`: 데스크톱 도구와 레이어
- `src/widgets/editor/mobile/*.tsx`: 하단 도구와 속성 Bottom Sheet
- `src/widgets/editor/canvas/editor-canvas.tsx`: Canvas element와 viewport
- `src/widgets/editor/canvas/editor-canvas.module.css`: Fabric wrapper 전용 스타일
- `src/shared/ui/*.tsx`: Button, IconButton, ColorInput, Toast, Dialog
- `public/assets/birthday-placeholder.svg`: 네트워크 없이 표시되는 번들 샘플 이미지

### Verification

- `src/**/*.test.ts`, `src/**/*.test.tsx`: Domain, Store, Command, Adapter, UI 테스트
- `e2e/editor.spec.ts`: 데스크톱 핵심 흐름
- `e2e/editor-mobile.spec.ts`: 모바일 레이아웃과 간편 편집 흐름

---

### Task 1: Next.js와 테스트 기반 구성

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `eslint.config.mjs`
- Create: `postcss.config.mjs`
- Create: `vitest.config.ts`
- Create: `vitest.setup.ts`
- Create: `playwright.config.ts`
- Create: `src/app/layout.tsx`
- Create: `src/app/page.tsx`
- Create: `src/app/page.test.tsx`
- Create: `src/app/globals.css`

**Interfaces:**
- Consumes: 승인된 버전과 현재 루트 Git 저장소
- Produces: `@/*` 경로 별칭, `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`

- [ ] **Step 1: 고정된 런타임과 테스트 의존성을 설치한다**

Run:

```bash
rtk npm init -y
rtk npm install --save-exact next@16.2.11 react@19.2.0 react-dom@19.2.0 fabric@7.4.0 zustand@5.0.15 zod@4.4.3
rtk npm install --save-dev --save-exact tailwindcss@4.3.3 @tailwindcss/postcss@4.3.3 vitest@4.1.10 @testing-library/react@16.3.2 @testing-library/dom @testing-library/jest-dom @testing-library/user-event jsdom fake-indexeddb@6.2.5 @playwright/test@1.62.1
rtk npm install --save-dev typescript @types/node @types/react @types/react-dom eslint eslint-config-next@16.2.11
```

`package.json`의 scripts를 다음 값으로 맞춘다.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "check": "npm run lint && npm run typecheck && npm test && npm run build"
  }
}
```

- [ ] **Step 2: Next.js, Tailwind, Vitest, Playwright 설정과 실패하는 루트 테스트를 작성한다**

`vitest.config.ts`는 jsdom과 `@` 별칭을 설정한다.

```ts
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
  },
});
```

`src/app/page.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import HomePage from './page';

it('로컬 자기 생일 카드 편집기로 이동할 수 있다', () => {
  render(<HomePage />);
  expect(screen.getByRole('link', { name: '내 생일 카드 만들기' }))
    .toHaveAttribute('href', '/editor/local-demo');
});
```

- [ ] **Step 3: 테스트가 요구사항 때문에 실패하는지 확인한다**

Run: `rtk npm test -- src/app/page.test.tsx`

Expected: `src/app/page.tsx`가 없거나 링크를 제공하지 않아 FAIL.

- [ ] **Step 4: 최소 루트 화면과 전역 토큰을 구현한다**

`src/app/page.tsx`:

```tsx
import Link from 'next/link';

export default function HomePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--workspace)] p-6">
      <Link
        href="/editor/local-demo"
        className="rounded-full bg-[var(--brand)] px-6 py-3 font-semibold text-white"
      >
        내 생일 카드 만들기
      </Link>
    </main>
  );
}
```

`src/app/globals.css`에는 `@import 'tailwindcss';`와 `--brand`, `--workspace`, `--surface`, `--celebration-pink`, `--shadow-soft` 토큰을 정의한다. `layout.tsx`는 한국어 `lang="ko"`와 `globals.css` import를 가진다.

- [ ] **Step 5: 기반 검증을 실행한다**

Run: `rtk npm test -- src/app/page.test.tsx && npm run lint && npm run typecheck && npm run build`

Expected: 테스트 1개 PASS, lint/typecheck/build exit 0.

- [ ] **Step 6: 기반 구성을 커밋한다**

```bash
rtk git add package.json package-lock.json next.config.ts tsconfig.json next-env.d.ts eslint.config.mjs postcss.config.mjs vitest.config.ts vitest.setup.ts playwright.config.ts src/app
rtk git commit -m "chore: Next.js 편집기 개발 기반을 구성한다" -m "- Next.js 16.2.11과 React, TypeScript, Tailwind를 고정 버전으로 설정한다.
- Vitest와 Playwright를 추가해 단위·컴포넌트·E2E 검증 경로를 마련한다.
- 로컬 자기 생일 카드 편집기로 이동하는 최소 진입 화면을 제공한다.

검증: npm test -- src/app/page.test.tsx, npm run lint, npm run typecheck, npm run build"
```

---

### Task 2: Design Domain과 런타임 스키마

**Files:**
- Create: `src/entities/design/model/element.ts`
- Create: `src/entities/design/model/design.ts`
- Create: `src/entities/design/model/design-schema.ts`
- Create: `src/entities/design/model/design-operations.ts`
- Create: `src/entities/design/model/sample-design.ts`
- Create: `src/entities/design/model/design-schema.test.ts`
- Create: `src/entities/design/model/design-operations.test.ts`
- Create: `src/entities/design/index.ts`

**Interfaces:**
- Consumes: `zod@4.4.3`
- Produces: `Design`, `DesignElement`, `TransformSnapshot`, `designSchema`, `createSampleDesign()`, `addElement()`, `replaceElement()`, `removeElement()`, `moveElement()`

- [ ] **Step 1: 스키마와 레이어 동작의 실패 테스트를 작성한다**

```ts
import { createSampleDesign, designSchema } from '@/entities/design';

it('자기 생일 샘플은 유효한 1080x1350 문서다', () => {
  const design = createSampleDesign();
  expect(designSchema.parse(design)).toMatchObject({
    version: 1,
    width: 1080,
    height: 1350,
  });
  expect(design.pages[0].elements.some(
    (element) => element.type === 'text' && element.text.includes('제 생일'),
  )).toBe(true);
});

it('이미지 요소에 브라우저 URL 저장을 허용하지 않는다', () => {
  const design = createSampleDesign();
  const image = design.pages[0].elements.find((element) => element.type === 'image');
  if (!image) throw new Error('샘플 이미지 요소가 없습니다.');
  expect(designSchema.safeParse({
    ...design,
    pages: [{
      ...design.pages[0],
      elements: [{ ...image, src: 'blob:http://localhost/temporary' }],
    }],
  }).success).toBe(false);
});
```

레이어 테스트는 배열 `[back, middle, front]`에서 `moveElement(page, 'middle', 2)` 결과가 `[back, front, middle]`인지 검증한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `rtk npm test -- src/entities/design/model`

Expected: Domain module이 존재하지 않아 FAIL.

- [ ] **Step 3: 프레임워크 독립 타입과 strict Zod 스키마를 구현한다**

`element.ts`의 공개 타입은 다음 계약을 따른다.

```ts
export interface BaseElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

export interface TransformSnapshot {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: 'left' | 'center' | 'right';
}

export interface ImageElement extends BaseElement {
  type: 'image';
  assetId: string;
}

export interface ShapeElement extends BaseElement {
  type: 'shape';
  shape: 'rectangle' | 'circle';
  fill: string;
}
```

모든 Zod object는 `.strict()`를 적용한다. `createSampleDesign()`은 고정 ID와 `builtin:birthday-photo`를 사용해 테스트와 최초 화면을 결정적으로 만든다.

- [ ] **Step 4: 순수 Design 연산을 구현한다**

```ts
export function replaceElement(
  page: DesignPage,
  elementId: string,
  replacement: DesignElement,
): DesignPage {
  const index = page.elements.findIndex((element) => element.id === elementId);
  if (index < 0) throw new Error(`존재하지 않는 요소입니다: ${elementId}`);
  const elements = page.elements.slice();
  elements[index] = replacement;
  return { ...page, elements };
}
```

`addElement`, `removeElement`, `moveElement`, `replaceElement`, `setPageBackground`는 입력 객체를 변경하지 않고 새 객체를 반환한다.

- [ ] **Step 5: Domain 검증을 실행한다**

Run: `rtk npm test -- src/entities/design/model && npm run typecheck`

Expected: Domain 테스트 PASS, `entities/design`에 React/Fabric/Zustand import가 없음.

- [ ] **Step 6: Domain을 커밋한다**

```bash
rtk git add src/entities/design
rtk git commit -m "feat: 제품 소유 디자인 문서 모델을 정의한다" -m "- Fabric과 무관한 Text, Image, Shape 요소와 4:5 Design 타입을 추가한다.
- strict Zod 스키마로 저장 문서와 브라우저 임시 URL 유입을 검증한다.
- 불변 레이어 연산과 자기 생일 샘플 문서를 테스트로 고정한다.

검증: npm test -- src/entities/design/model, npm run typecheck"
```

---

### Task 3: Port와 책임별 Zustand Store

**Files:**
- Create: `src/features/editor/core/ports/editor-renderer.ts`
- Create: `src/features/editor/core/ports/design-repository.ts`
- Create: `src/features/editor/core/ports/asset-gateway.ts`
- Create: `src/features/editor/core/ports/design-exporter.ts`
- Create: `src/features/editor/core/ports/index.ts`
- Create: `src/features/editor/model/design-store.ts`
- Create: `src/features/editor/model/editor-runtime-store.ts`
- Create: `src/features/editor/model/editor-ui-store.ts`
- Create: `src/features/editor/model/editor-stores.test.ts`

**Interfaces:**
- Consumes: `Design`, `DesignElement`, `zustand/vanilla`
- Produces: 네 Port 타입, `createDesignStore()`, `createEditorRuntimeStore()`, `createEditorUiStore()`

- [ ] **Step 1: Store 책임 분리 테스트를 작성한다**

```ts
it('Design Store 변경은 Runtime과 UI Store를 건드리지 않는다', () => {
  const designStore = createDesignStore(createSampleDesign());
  const runtimeStore = createEditorRuntimeStore();
  const uiStore = createEditorUiStore();

  designStore.getState().setBackground('#ffffff');

  expect(designStore.getState().design.pages[0].background).toBe('#ffffff');
  expect(runtimeStore.getState().selectedElementIds).toEqual([]);
  expect(uiStore.getState().saveStatus).toBe('saved');
});

it('zoom은 25%와 200% 사이로 제한한다', () => {
  const store = createEditorRuntimeStore();
  store.getState().setZoom(3);
  expect(store.getState().zoom).toBe(2);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `rtk npm test -- src/features/editor/model/editor-stores.test.ts`

Expected: Store factory가 없어 FAIL.

- [ ] **Step 3: 네 Port 계약을 정확히 정의한다**

```ts
export type DesignLoadResult =
  | { status: 'empty' }
  | { status: 'loaded'; design: Design }
  | {
      status: 'recoverable';
      reason: 'corrupt' | 'unsupported-version';
      backup: Design | null;
    };

export type EditorEvent =
  | { type: 'selection:changed'; elementIds: string[] }
  | {
      type: 'element:transformed';
      elementId: string;
      before: TransformSnapshot;
      after: TransformSnapshot;
    }
  | { type: 'text:edited'; elementId: string; before: string; after: string };
```

네 Port의 정확한 계약은 다음과 같다. `EditorRenderer` 구현체 생성 시 `AssetGateway`를 주입한다.

```ts
export interface EditorRenderer {
  mount(element: HTMLCanvasElement): void;
  render(design: Design): Promise<void>;
  select(elementIds: string[]): void;
  subscribe(listener: (event: EditorEvent) => void): () => void;
  dispose(): void;
}

export interface DesignRepository {
  load(cardId: string): Promise<DesignLoadResult>;
  save(cardId: string, design: Design): Promise<void>;
}

export interface AssetReference {
  id: string;
  mimeType: string;
  width: number;
  height: number;
}

export interface AssetGateway {
  upload(file: File): Promise<AssetReference>;
  resolveUrl(assetId: string): Promise<string>;
  remove(assetId: string): Promise<void>;
}

export interface ExportOptions {
  width: 1080;
  height: 1350;
}

export interface DesignExporter {
  exportPng(design: Design, options: ExportOptions): Promise<Blob>;
}
```

- [ ] **Step 4: vanilla Store를 구현한다**

`DesignState`는 `replaceDesign`, `addElement`, `replaceElement`, `removeElement`, `moveElement`, `setBackground`를 제공한다. `EditorRuntimeState`는 selection, zoom, interaction, canvas status를 제공한다. `EditorUiState`는 active panel, mobile sheet, save status, error, recovery notice를 제공한다.

```ts
export type SaveStatus = 'saving' | 'saved' | 'error';
export type EditorPanel = 'text' | 'image' | 'shape' | 'layers' | null;

export type DesignStore = StoreApi<DesignState>;
export type EditorRuntimeStore = StoreApi<EditorRuntimeState>;
export type EditorUiStore = StoreApi<EditorUiState>;
```

- [ ] **Step 5: Store 테스트와 import 경계를 검증한다**

Run: `rtk npm test -- src/features/editor/model && npm run typecheck`

Expected: Store 테스트 PASS.

- [ ] **Step 6: Port와 Store를 커밋한다**

```bash
rtk git add src/features/editor/core/ports src/features/editor/model
rtk git commit -m "feat: 편집기 외부 경계와 상태 소유권을 분리한다" -m "- Renderer, Design 저장소, Asset, Exporter의 네 Port를 정의한다.
- Design, Runtime, UI 상태를 독립된 Zustand vanilla Store로 구성한다.
- zoom 제한과 Store 간 비간섭을 테스트해 거대한 단일 Store를 방지한다.

검증: npm test -- src/features/editor/model, npm run typecheck"
```

---

### Task 4: Command, History와 Editor facade

**Files:**
- Create: `src/features/editor/core/editor-command.ts`
- Create: `src/features/editor/core/editor-history.ts`
- Create: `src/features/editor/core/editor-history.test.ts`
- Create: `src/features/editor/commands/add-element-command.ts`
- Create: `src/features/editor/commands/delete-element-command.ts`
- Create: `src/features/editor/commands/update-element-command.ts`
- Create: `src/features/editor/commands/transform-element-command.ts`
- Create: `src/features/editor/commands/reorder-element-command.ts`
- Create: `src/features/editor/commands/change-background-command.ts`
- Create: `src/features/editor/core/editor.ts`
- Create: `src/features/editor/core/editor.test.ts`
- Create: `src/features/editor/index.ts`

**Interfaces:**
- Consumes: Task 3의 Store와 Port, Task 2의 Design 연산
- Produces: `EditorHistory`, `Editor`, UI가 호출하는 `addText`, `addShape`, `addImage`, `updateSelection`, `deleteSelection`, `bringForward`, `sendBackward`, `undo`, `redo`, `setZoom`, `setBackground`, `exportPng`

- [ ] **Step 1: History와 transform의 실패 테스트를 작성한다**

```ts
it('새 명령을 실행하면 redo 기록을 비운다', () => {
  const history = new EditorHistory();
  const first = createSpyCommand();
  const second = createSpyCommand();
  history.execute(first);
  history.undo();
  history.execute(second);
  expect(history.canRedo()).toBe(false);
});

it('transform command는 before와 after를 정확히 왕복한다', () => {
  const store = createDesignStore(createSampleDesign());
  const command = new TransformElementCommand(store, 'page-1', 'title', {
    before: { x: 180, y: 140, width: 720, height: 180, rotation: 0 },
    after: { x: 220, y: 180, width: 680, height: 170, rotation: 8 },
  });
  command.execute();
  expect(findElement(store, 'title').x).toBe(220);
  command.undo();
  expect(findElement(store, 'title').x).toBe(180);
});
```

같은 테스트 파일에서 사용하는 helper는 로컬로 정의한다.

```ts
const createSpyCommand = (): EditorCommand => ({
  execute: vi.fn(),
  undo: vi.fn(),
});

const findElement = (store: DesignStore, elementId: string) => {
  const element = store.getState().design.pages[0].elements
    .find((candidate) => candidate.id === elementId);
  if (!element) throw new Error(`테스트 요소가 없습니다: ${elementId}`);
  return element;
};
```

- [ ] **Step 2: 실패를 확인한다**

Run: `rtk npm test -- src/features/editor/core src/features/editor/commands`

Expected: History와 Command가 없어 FAIL.

- [ ] **Step 3: Command와 History를 최소 구현한다**

```ts
export interface EditorCommand {
  execute(): void;
  undo(): void;
}

export class EditorHistory {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];

  execute(command: EditorCommand) {
    command.execute();
    this.undoStack.push(command);
    this.redoStack = [];
  }
}
```

각 Command는 생성 시 before/after 또는 삭제 위치를 캡처한다. Undo 중 현재 selection은 별도 Runtime Store에서 정리한다.

- [ ] **Step 4: UI가 사용하는 Editor facade를 구현한다**

`Editor`는 Fabric 타입을 공개하지 않는다. 모든 문서 변경 뒤 `renderer.render(currentDesign)`과 `onDocumentChange(currentDesign)`를 호출한다. Renderer의 `element:transformed`와 `text:edited` 이벤트도 Command 한 개로 변환한다.

```ts
export interface EditorDependencies {
  designStore: DesignStore;
  runtimeStore: EditorRuntimeStore;
  renderer: EditorRenderer;
  assetGateway: AssetGateway;
  exporter: DesignExporter;
  idGenerator: () => string;
  onDocumentChange: (design: Design) => void;
}

export type SelectionPatch =
  | {
      type: 'text';
      changes: Partial<Pick<TextElement,
        'text' | 'fontFamily' | 'fontSize' | 'fontWeight' | 'color' | 'textAlign'>>;
    }
  | { type: 'shape'; changes: Partial<Pick<ShapeElement, 'fill'>> };

export interface EditorApi {
  mount(canvas: HTMLCanvasElement): Promise<void>;
  addText(): Promise<void>;
  addShape(shape: 'rectangle' | 'circle'): Promise<void>;
  addImage(file: File): Promise<void>;
  replaceSelectedImage(file: File): Promise<void>;
  updateSelection(patch: SelectionPatch): Promise<void>;
  deleteSelection(): Promise<void>;
  bringForward(): Promise<void>;
  sendBackward(): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  setZoom(zoom: number): void;
  setBackground(color: string): Promise<void>;
  exportPng(): Promise<Blob>;
}
```

이미지 업로드는 `assetGateway.upload(file)`이 성공한 뒤에만 `AddElementCommand`를 실행한다.

- [ ] **Step 5: Editor facade 테스트를 통과시킨다**

Fake Renderer, Fake AssetGateway, Fake Exporter를 사용해 UI 동작이 Port 호출과 Design 변경으로만 이어지는지 검증한다.

Run: `rtk npm test -- src/features/editor/core src/features/editor/commands && npm run typecheck`

Expected: History, Command, facade 테스트 PASS.

- [ ] **Step 6: Editor Core를 커밋한다**

```bash
rtk git add src/features/editor/core src/features/editor/commands src/features/editor/index.ts
rtk git commit -m "feat: Command 기반 편집기 동작과 Undo Redo를 구현한다" -m "- 요소 추가·삭제·수정·transform·레이어·배경 변경을 되돌릴 수 있는 Command로 표현한다.
- 새 명령 실행 시 Redo 기록을 비우는 History 규칙을 테스트한다.
- UI와 Fabric 사이의 단일 진입점인 Editor facade를 제공한다.

검증: npm test -- src/features/editor/core src/features/editor/commands, npm run typecheck"
```

---

### Task 5: IndexedDB Design·Asset Adapter와 자동 저장

**Files:**
- Create: `src/features/editor/persistence/browser/editor-db.ts`
- Create: `src/features/editor/persistence/browser/indexeddb-design-repository.ts`
- Create: `src/features/editor/persistence/browser/indexeddb-design-repository.test.ts`
- Create: `src/features/editor/persistence/browser/browser-asset-gateway.ts`
- Create: `src/features/editor/persistence/browser/browser-asset-gateway.test.ts`
- Create: `src/features/editor/persistence/save-coordinator.ts`
- Create: `src/features/editor/persistence/save-coordinator.test.ts`
- Create: `src/features/editor/persistence/index.ts`
- Create: `public/assets/birthday-placeholder.svg`

**Interfaces:**
- Consumes: `DesignRepository`, `AssetGateway`, `designSchema`, `EditorUiStore`
- Produces: `openEditorDb()`, `requestToPromise()`, `transactionDone()`, `IndexedDbDesignRepository`, `BrowserAssetGateway`, `SaveCoordinator`

- [ ] **Step 1: 저장·백업·복구 상태의 실패 테스트를 작성한다**

```ts
import 'fake-indexeddb/auto';

it('두 번째 저장 시 직전 정상 문서를 backup으로 유지한다', async () => {
  const db = await openTestDb();
  const repository = new IndexedDbDesignRepository(db);
  const first = createSampleDesign();
  const second = { ...first, pages: [{ ...first.pages[0], background: '#ffffff' }] };
  await repository.save('local-demo', first);
  await repository.save('local-demo', second);
  await corruptCurrentRecord(db, 'local-demo');

  await expect(repository.load('local-demo')).resolves.toEqual({
    status: 'recoverable',
    reason: 'corrupt',
    backup: first,
  });
});
```

테스트 파일의 DB helper는 고유 이름을 사용하고 raw record 수정 범위를 테스트 안으로 제한한다.

```ts
const openTestDb = () => openEditorDb(`birthday-canvas-test-${crypto.randomUUID()}`);

async function corruptCurrentRecord(db: IDBDatabase, cardId: string) {
  const transaction = db.transaction('design-records', 'readwrite');
  const store = transaction.objectStore('design-records');
  const record = await requestToPromise<DesignRecord>(store.get(cardId));
  store.put({ ...record, current: { version: 999, broken: true } });
  await transactionDone(transaction);
}
```

Asset 테스트는 `builtin:birthday-photo`가 `/assets/birthday-placeholder.svg`로 해석되는지, PNG 업로드가 IndexedDB에 저장되고 `assetId`를 반환하는지, `text/plain`과 10MB 초과 파일을 거부하는지 검증한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `rtk npm test -- src/features/editor/persistence`

Expected: Browser Adapter가 없어 FAIL.

- [ ] **Step 3: IndexedDB record와 Repository를 구현한다**

DB 이름은 `birthday-canvas`, 버전은 `1`, object store는 `design-records`와 `asset-records`다.

```ts
interface DesignRecord {
  cardId: string;
  current: unknown;
  backup: unknown | null;
  updatedAt: number;
}
```

`save()`는 입력 Design을 먼저 검증하고, 하나의 readwrite transaction에서 기존 current를 backup으로 옮긴 뒤 새 current를 저장한다. `load()`는 current와 backup을 각각 검증해 `empty`, `loaded`, `recoverable` 결과를 반환한다.

- [ ] **Step 4: BrowserAssetGateway와 번들 SVG를 구현한다**

번들 Registry는 다음 상수를 사용한다.

```ts
const BUILTIN_ASSETS = {
  'builtin:birthday-photo': '/assets/birthday-placeholder.svg',
} as const;
```

사용자 파일은 `image/png`, `image/jpeg`, `image/webp`만 허용하고 최대 크기는 `10 * 1024 * 1024` bytes다. object URL은 assetId별로 캐시하고 `dispose()`에서 모두 revoke한다. Domain에는 반환 URL을 기록하지 않는다.

- [ ] **Step 5: 600ms SaveCoordinator를 테스트 우선으로 구현한다**

Fake timer로 여러 번 `schedule()`해도 마지막 Design만 한 번 저장되는지, 실패 시 UI status가 `error`, `retry()` 성공 시 `saved`가 되는지 검증한다.

```ts
class SaveCoordinator {
  schedule(design: Design): void;
  flush(): Promise<void>;
  retry(): Promise<void>;
  dispose(): void;
}
```

- [ ] **Step 6: 저장 Adapter 전체 검증을 실행한다**

Run: `rtk npm test -- src/features/editor/persistence && npm run typecheck`

Expected: IndexedDB, Asset, debounce, retry 테스트 PASS.

- [ ] **Step 7: Browser Adapter를 커밋한다**

```bash
rtk git add src/features/editor/persistence public/assets/birthday-placeholder.svg
rtk git commit -m "feat: 교체 가능한 브라우저 저장 Adapter를 구현한다" -m "- IndexedDB에 현재 Design과 직전 정상 백업을 transaction으로 저장한다.
- 번들 Asset과 사용자 이미지 Blob을 동일한 AssetGateway 계약으로 해석한다.
- 600ms debounce 저장과 실패 재시도 상태를 테스트로 보장한다.

검증: npm test -- src/features/editor/persistence, npm run typecheck"
```

---

### Task 6: Fabric Mapper, 이벤트 Adapter와 PNG Exporter

**Files:**
- Create: `src/features/editor/fabric/fabric-object-metadata.ts`
- Create: `src/features/editor/fabric/fabric-element-mapper.ts`
- Create: `src/features/editor/fabric/fabric-element-mapper.test.ts`
- Create: `src/features/editor/fabric/fabric-event-adapter.ts`
- Create: `src/features/editor/fabric/fabric-event-adapter.test.ts`
- Create: `src/features/editor/fabric/fabric-editor-renderer.ts`
- Create: `src/features/editor/fabric/fabric-design-exporter.ts`
- Create: `src/features/editor/fabric/index.ts`

**Interfaces:**
- Consumes: `Design`, `DesignElement`, `EditorRenderer`, `EditorEvent`, `AssetGateway`, `DesignExporter`
- Produces: `FabricEditorRenderer`, `FabricDesignExporter`, Domain/Fabric mapping helpers

- [ ] **Step 1: Fabric 변환 정규화의 실패 테스트를 작성한다**

```ts
it('Fabric scale을 Domain width와 height로 정규화한다', () => {
  expect(readTransform({
    left: 120,
    top: 240,
    width: 200,
    height: 100,
    scaleX: 1.5,
    scaleY: 2,
    angle: 12,
  })).toEqual({
    x: 120,
    y: 240,
    width: 300,
    height: 200,
    rotation: 12,
  });
});
```

Mapper 테스트는 Text가 `Textbox`, rectangle이 `Rect`, circle이 `Ellipse`, Image가 AssetGateway URL을 사용하며 모든 객체 metadata에 `elementId`가 들어가는지 검증한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `rtk npm test -- src/features/editor/fabric`

Expected: Fabric Adapter가 없어 FAIL.

- [ ] **Step 3: Domain에서 Fabric Object로 가는 Mapper를 구현한다**

모든 객체는 `originX: 'left'`, `originY: 'top'`을 사용한다. `readTransform()`은 Fabric의 `left`, `top`, `width * scaleX`, `height * scaleY`, `angle`을 `TransformSnapshot`으로 정규화해 export한다. `ImageElement`는 `await assetGateway.resolveUrl(assetId)` 후 `FabricImage.fromURL()`로 생성하고 Domain 크기에 맞게 scale한다. 생성 순서는 `page.elements` 배열 순서를 그대로 따른다.

- [ ] **Step 4: FabricEventAdapter를 구현한다**

다음 Fabric lifecycle을 서비스 이벤트로 바꾼다.

```text
selection:created / selection:updated / selection:cleared
→ selection:changed

mouse:down 또는 object:moving 시작
→ before transform 보관

object:modified
→ element:transformed 한 번 발생

text:editing:entered
→ before text 보관

text:editing:exited
→ text:edited 한 번 발생
```

`object:moving`, `object:scaling`, `object:rotating` 프레임에서는 Store 이벤트를 발생시키지 않는다.

- [ ] **Step 5: FabricEditorRenderer와 Exporter를 구현한다**

Renderer는 `mount`, `render`, `select`, `subscribe`, `dispose`를 구현한다. `render()`는 현재 generation 번호를 캡처해 느린 이미지 로드가 이후 렌더를 덮어쓰지 못하게 한다. 선택 ID는 전체 render 전후에 복원한다.

Exporter는 숨겨진 StaticCanvas를 `1080 × 1350`으로 만들고 Design 전체를 렌더한 뒤 PNG Blob을 생성하며 반드시 dispose한다.

- [ ] **Step 6: Fabric Adapter 검증을 실행한다**

Run: `rtk npm test -- src/features/editor/fabric && npm run typecheck`

Expected: mapper와 event normalization 테스트 PASS.

- [ ] **Step 7: Fabric Adapter를 커밋한다**

```bash
rtk git add src/features/editor/fabric
rtk git commit -m "feat: Fabric을 렌더링 Adapter 뒤에 격리한다" -m "- 제품 Design 요소를 Textbox, Image, Rect, Ellipse로 변환하는 Mapper를 구현한다.
- Fabric selection과 transform lifecycle을 서비스 EditorEvent로 정규화한다.
- 1080x1350 PNG를 생성하는 교체 가능한 Exporter를 추가한다.

검증: npm test -- src/features/editor/fabric, npm run typecheck"
```

---

### Task 7: Editor Session 조립과 동적 Route

**Files:**
- Create: `src/features/editor/context/editor-provider.tsx`
- Create: `src/features/editor/context/editor-context.ts`
- Create: `src/features/editor/hooks/use-editor.ts`
- Create: `src/features/editor/hooks/use-editor-session.ts`
- Create: `src/features/editor/hooks/use-editor-session.test.tsx`
- Create: `src/features/editor/testing/editor-test-kit.tsx`
- Create: `src/app/editor/[cardId]/page.tsx`
- Create: `src/widgets/editor/editor-screen.tsx`
- Create: `src/widgets/editor/canvas/editor-canvas.tsx`
- Create: `src/widgets/editor/canvas/editor-canvas.module.css`

**Interfaces:**
- Consumes: Task 2~6의 Domain, Store, Editor, Browser Adapter, Fabric Adapter
- Produces: `/editor/local-demo`, `EditorProvider`, `useEditor()`, load/initialize/autosave/recovery session

- [ ] **Step 1: Session load 상태의 실패 테스트를 작성한다**

```tsx
it('저장 문서가 없으면 샘플을 초기화하고 첫 저장을 예약한다', async () => {
  const kit = createEditorTestKit({ loadResult: { status: 'empty' } });
  const { result } = renderHook(() => useEditorSession('local-demo'), {
    wrapper: kit.wrapper,
  });

  await waitFor(() => expect(result.current.status).toBe('ready'));
  expect(kit.designStore.getState().design.pages[0].elements.length).toBeGreaterThan(0);
  expect(kit.saveCoordinator.schedule).toHaveBeenCalledOnce();
});

it('recoverable 결과는 복구 안내를 노출하고 자동 덮어쓰지 않는다', async () => {
  const kit = createEditorTestKit({
    loadResult: {
      status: 'recoverable',
      reason: 'corrupt',
      backup: createSampleDesign(),
    },
  });
  renderHook(() => useEditorSession('local-demo'), {
    wrapper: kit.wrapper,
  });
  await waitFor(() => {
    expect(kit.uiStore.getState().recoveryNotice).not.toBeNull();
  });
  expect(kit.repository.save).not.toHaveBeenCalled();
});
```

`createEditorTestKit()`은 같은 Task에서 생성하며 Fake Renderer, Repository, AssetGateway, Exporter와 실제 Store 세 개를 반환한다. `wrapper`는 이 의존성을 `EditorContext.Provider`에 전달한다. 뒤의 컴포넌트 테스트도 이 test kit를 사용한다.

```tsx
export interface EditorContextValue {
  editor: Editor;
  designStore: DesignStore;
  runtimeStore: EditorRuntimeStore;
  uiStore: EditorUiStore;
  repository: DesignRepository;
  saveCoordinator: Pick<SaveCoordinator, 'schedule' | 'flush' | 'retry' | 'dispose'>;
}

export function createEditorTestKit(options: {
  loadResult?: DesignLoadResult;
  editor?: Editor;
} = {}) {
  const designStore = createDesignStore(createSampleDesign());
  const runtimeStore = createEditorRuntimeStore();
  const uiStore = createEditorUiStore();
  const repository: DesignRepository = {
    load: vi.fn().mockResolvedValue(options.loadResult ?? { status: 'loaded', design: createSampleDesign() }),
    save: vi.fn().mockResolvedValue(undefined),
  };
  const renderer: EditorRenderer = {
    mount: vi.fn(),
    render: vi.fn().mockResolvedValue(undefined),
    select: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => undefined),
    dispose: vi.fn(),
  };
  const assetGateway: AssetGateway = {
    upload: vi.fn(),
    resolveUrl: vi.fn().mockResolvedValue('/assets/birthday-placeholder.svg'),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const exporter: DesignExporter = {
    exportPng: vi.fn().mockResolvedValue(new Blob([], { type: 'image/png' })),
  };
  const saveCoordinator = createMockSaveCoordinator();
  const editor = options.editor ?? new Editor({
    designStore,
    runtimeStore,
    renderer,
    assetGateway,
    exporter,
    idGenerator: () => 'test-element-id',
    onDocumentChange: saveCoordinator.schedule,
  });
  const value: EditorContextValue = {
    editor,
    designStore,
    runtimeStore,
    uiStore,
    repository,
    saveCoordinator,
  };
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <EditorContext.Provider value={value}>{children}</EditorContext.Provider>
  );
  return { ...value, wrapper };
}
```

`createMockSaveCoordinator()`는 메서드로 전달될 때도 `this`에 의존하지 않는다.

```ts
const createMockSaveCoordinator = () => ({
  schedule: vi.fn<(design: Design) => void>(),
  flush: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  retry: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  dispose: vi.fn<() => void>(),
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `rtk npm test -- src/features/editor/hooks/use-editor-session.test.tsx`

Expected: Provider와 session hook이 없어 FAIL.

- [ ] **Step 3: Provider에서 의존성을 한 번만 조립한다**

Provider는 Store 세 개, Browser Adapter, SaveCoordinator, Fabric Renderer, Exporter, Editor를 `useRef` 기반으로 한 번 생성한다. unmount 시 SaveCoordinator flush/dispose, Renderer dispose, BrowserAssetGateway dispose를 순서대로 호출한다.

`useEditor()`는 Editor facade와 Store selector hook만 노출하며 Fabric Canvas를 반환하지 않는다.

- [ ] **Step 4: load, initialize, recover 흐름을 구현한다**

`empty`는 샘플을 사용하고 저장을 예약한다. `loaded`는 저장 문서를 사용한다. `recoverable`은 저장을 예약하지 않고 recovery notice에 backup을 보관한다. 사용자가 복구를 선택할 때만 backup 또는 샘플을 적용하고 저장한다.

- [ ] **Step 5: Next.js 16 동적 Route와 Client boundary를 구현한다**

```tsx
import { EditorScreen } from '@/widgets/editor/editor-screen';

export default async function EditorPage({
  params,
}: {
  params: Promise<{ cardId: string }>;
}) {
  const { cardId } = await params;
  return <EditorScreen cardId={cardId} />;
}
```

`EditorScreen`만 `'use client'` 경계가 되며 `EditorCanvas`의 `<canvas ref>`가 준비된 뒤 `Editor.mount(canvas)`를 호출한다.

- [ ] **Step 6: Session과 build를 검증한다**

Run: `rtk npm test -- src/features/editor/hooks && npm run typecheck && npm run build`

Expected: session 테스트 PASS, dynamic route build PASS.

- [ ] **Step 7: Session 조립을 커밋한다**

```bash
rtk git add src/features/editor/context src/features/editor/hooks src/app/editor src/widgets/editor/editor-screen.tsx src/widgets/editor/canvas
rtk git commit -m "feat: 로컬 카드 편집 세션을 조립한다" -m "- Browser 저장소와 Fabric Adapter를 Provider에서 한 번 조립한다.
- empty, loaded, recoverable 문서 상태를 분리해 자동 덮어쓰기를 방지한다.
- Next.js 동적 Route 아래에 client 전용 Canvas lifecycle을 연결한다.

검증: npm test -- src/features/editor/hooks, npm run typecheck, npm run build"
```

---

### Task 8: 데스크톱 집중형 Editor UI

**Files:**
- Create: `src/shared/ui/button.tsx`
- Create: `src/shared/ui/icon-button.tsx`
- Create: `src/shared/ui/color-input.tsx`
- Create: `src/shared/ui/toast.tsx`
- Create: `src/shared/ui/dialog.tsx`
- Create: `src/widgets/editor/toolbar/editor-topbar.tsx`
- Create: `src/widgets/editor/toolbar/contextual-toolbar.tsx`
- Create: `src/widgets/editor/sidebar/editor-sidebar.tsx`
- Create: `src/widgets/editor/sidebar/text-panel.tsx`
- Create: `src/widgets/editor/sidebar/image-panel.tsx`
- Create: `src/widgets/editor/sidebar/shape-panel.tsx`
- Create: `src/widgets/editor/sidebar/layer-panel.tsx`
- Create: `src/widgets/editor/editor-desktop.test.tsx`
- Modify: `src/widgets/editor/editor-screen.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `useEditor()`, Editor UI/Runtime Store selector, Task 7 Canvas
- Produces: 1024px 이상 B 집중형 UI와 모든 데스크톱 MVP 조작

- [ ] **Step 1: UI가 Editor API만 호출하는 실패 테스트를 작성한다**

```tsx
it('텍스트 버튼은 Editor.addText만 호출한다', async () => {
  const kit = createEditorTestKit();
  const addText = vi.spyOn(kit.editor, 'addText');
  render(<EditorSidebar />, { wrapper: kit.wrapper });
  await userEvent.click(screen.getByRole('button', { name: '텍스트 추가' }));
  expect(addText).toHaveBeenCalledOnce();
});

it('사진 업로드 실패 시 ImageElement를 추가하지 않고 오류를 알린다', async () => {
  const kit = createEditorTestKit();
  vi.spyOn(kit.editor, 'addImage').mockRejectedValue(new Error('지원하지 않는 이미지'));
  render(<ImagePanel />, { wrapper: kit.wrapper });
  await userEvent.upload(
    screen.getByLabelText('사진 파일 선택'),
    new File(['not-an-image'], 'note.txt', { type: 'text/plain' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent('지원하지 않는 이미지');
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `rtk npm test -- src/widgets/editor/editor-desktop.test.tsx`

Expected: Toolbar와 Sidebar가 없어 FAIL.

- [ ] **Step 3: 소프트 스튜디오 토큰과 공유 UI를 구현한다**

전역 토큰은 라일락 brand, 연한 핑크 celebration, 따뜻한 흰색 surface, 보라 회색 workspace를 사용한다. Button은 `primary`, `secondary`, `ghost`, `danger` variant와 focus-visible ring을 제공한다. 모든 IconButton은 필수 `aria-label`을 받는다.

- [ ] **Step 4: 상단 바와 왼쪽 도구 패널을 구현한다**

상단 바는 서비스 이름, `저장 중/저장됨/저장 실패`, Undo, Redo, PNG 저장을 표시한다. 왼쪽은 텍스트, 사진, 도형, 레이어 탭과 카드 배경색 input을 제공한다. Canvas 아래에는 25%~200% 확대·축소 버튼과 현재 zoom을 표시한다. 파일 input은 `accept="image/png,image/jpeg,image/webp"`를 사용한다.

Canvas wrapper에는 `data-testid="editor-canvas"`를 부여한다. 레이어 항목은 텍스트 내용 또는 요소 종류를 포함한 `aria-label`, 예를 들어 `오늘은 제 생일이에요! 레이어 선택`을 제공해 키보드와 E2E 모두 동일한 사용자 경로를 사용하게 한다.

- [ ] **Step 5: 선택 요소용 맥락 툴바를 구현한다**

Text 선택 시 글꼴, 크기, 굵기, 색상, 정렬을 표시한다. 외부 폰트 요청 없이 `system-ui`, `Arial`, `Georgia` 세 선택지를 제공한다. Image 선택 시 사진 교체를 표시한다. Shape 선택 시 fill 색상을 표시한다. 공통으로 앞으로, 뒤로, 삭제를 제공한다.

UI는 선택된 Domain element를 읽고 다음 facade 메서드만 호출한다.

```ts
editor.updateSelection(patch);
editor.bringForward();
editor.sendBackward();
editor.deleteSelection();
```

- [ ] **Step 6: 데스크톱 UI 테스트와 수동 화면을 검증한다**

Run: `rtk npm test -- src/widgets/editor/editor-desktop.test.tsx && npm run typecheck`

Then run: `rtk npm run dev`

Observe at `http://localhost:3000/editor/local-demo`: 왼쪽 패널, 중앙 4:5 Canvas, 맥락 툴바, 상단 저장 상태가 보이고 브라우저 console error가 없음.

- [ ] **Step 7: 데스크톱 UI를 커밋한다**

```bash
rtk git add src/shared/ui src/widgets/editor src/app/globals.css
rtk git commit -m "feat: 소프트 스튜디오 데스크톱 편집 UI를 구현한다" -m "- 상단 상태 바와 텍스트·사진·도형·레이어 도구를 집중형 레이아웃으로 구성한다.
- 선택 요소 종류에 맞는 맥락 툴바를 제공한다.
- React UI가 Editor facade만 호출하는 경계를 컴포넌트 테스트로 확인한다.

검증: npm test -- src/widgets/editor/editor-desktop.test.tsx, npm run typecheck, /editor/local-demo 수동 확인"
```

---

### Task 9: 태블릿·모바일 적응형 UI와 키보드 접근성

**Files:**
- Create: `src/features/editor/hooks/use-keyboard-shortcuts.ts`
- Create: `src/features/editor/hooks/use-keyboard-shortcuts.test.tsx`
- Create: `src/shared/hooks/use-media-query.ts`
- Create: `src/widgets/editor/mobile/mobile-toolbar.tsx`
- Create: `src/widgets/editor/mobile/property-sheet.tsx`
- Create: `src/widgets/editor/editor-responsive.test.tsx`
- Modify: `src/widgets/editor/editor-screen.tsx`
- Modify: `src/widgets/editor/canvas/editor-canvas.module.css`
- Modify: `src/widgets/editor/toolbar/editor-topbar.tsx`

**Interfaces:**
- Consumes: Editor facade와 UI Store
- Produces: 768px 미만 모바일 Bottom Sheet, 태블릿 접이식 패널, 데스크톱 단축키

- [ ] **Step 1: 반응형 가시성과 단축키 실패 테스트를 작성한다**

```tsx
it('모바일에서는 왼쪽 Sidebar 대신 하단 도구를 표시한다', () => {
  mockMatchMedia('(max-width: 767px)', true);
  const kit = createEditorTestKit();
  render(<EditorScreen cardId="local-demo" />, { wrapper: kit.wrapper });
  expect(screen.getByRole('toolbar', { name: '모바일 편집 도구' })).toBeVisible();
  expect(screen.queryByRole('navigation', { name: '데스크톱 편집 도구' })).not.toBeInTheDocument();
});

it('입력 필드가 아닐 때 Ctrl+Z가 Editor.undo를 호출한다', () => {
  const kit = createEditorTestKit();
  const undo = vi.spyOn(kit.editor, 'undo');
  renderHook(() => useKeyboardShortcuts(kit.editor));
  fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
  expect(undo).toHaveBeenCalledOnce();
});
```

`mockMatchMedia`는 테스트 파일에 다음 구현으로 둔다.

```ts
function mockMatchMedia(query: string, matches: boolean) {
  vi.stubGlobal('matchMedia', vi.fn((requested: string) => ({
    matches: requested === query ? matches : false,
    media: requested,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })));
}
```

- [ ] **Step 2: 실패를 확인한다**

Run: `rtk npm test -- src/widgets/editor/editor-responsive.test.tsx src/features/editor/hooks/use-keyboard-shortcuts.test.tsx`

Expected: 모바일 도구와 단축키 hook이 없어 FAIL.

- [ ] **Step 3: 모바일과 태블릿 UI를 구현한다**

모바일은 상단 최소 상태 바, 중앙 Canvas, 하단 텍스트·사진·도형 버튼을 사용한다. 선택 속성은 `aria-modal="true"` Bottom Sheet에 표시한다. 레이어 정밀 패널과 다중 선택은 모바일에서 렌더하지 않는다.

태블릿은 왼쪽 패널을 drawer로 접고 선택 속성을 Bottom Sheet 또는 popover로 표시한다. root는 `min-height: 100dvh`, 하단 바는 `padding-bottom: env(safe-area-inset-bottom)`을 사용한다.

- [ ] **Step 4: 키보드와 touch 접근성을 구현한다**

지원 단축키:

```text
Delete 또는 Backspace → deleteSelection
Ctrl/Cmd + Z → undo
Ctrl/Cmd + Shift + Z → redo
Ctrl/Cmd + Y → redo
```

input, textarea, select, contenteditable 또는 Fabric text editing 중에는 단축키를 가로채지 않는다. 터치 버튼의 최소 hit area는 44px이다.

- [ ] **Step 5: 반응형 테스트와 화면을 검증한다**

Run: `rtk npm test -- src/widgets/editor/editor-responsive.test.tsx src/features/editor/hooks/use-keyboard-shortcuts.test.tsx && npm run typecheck`

Observe with browser widths 390px, 820px, 1280px: Canvas가 잘리지 않고 모바일 하단 도구, 태블릿 drawer, 데스크톱 Sidebar가 각각 표시됨.

- [ ] **Step 6: 적응형 UI를 커밋한다**

```bash
rtk git add src/features/editor/hooks src/shared/hooks src/widgets/editor
rtk git commit -m "feat: 모바일과 태블릿에 맞는 편집 경험을 제공한다" -m "- 화면 너비에 따라 하단 도구, 접이식 패널, 데스크톱 Sidebar를 전환한다.
- 100dvh와 Safe Area, 44px 터치 영역으로 모바일 사용성을 보강한다.
- 입력 중 충돌하지 않는 삭제와 Undo Redo 단축키를 테스트한다.

검증: 반응형 컴포넌트 테스트, 단축키 테스트, 390px·820px·1280px 수동 확인"
```

---

### Task 10: 복구 UI, PNG 다운로드, E2E와 최종 검증

**Files:**
- Create: `src/app/editor/[cardId]/error.tsx`
- Create: `src/features/editor/lib/download-blob.ts`
- Create: `src/features/editor/lib/download-blob.test.ts`
- Create: `src/widgets/editor/recovery-dialog.tsx`
- Create: `src/widgets/editor/recovery-dialog.test.tsx`
- Create: `src/widgets/editor/editor-error-state.tsx`
- Create: `e2e/editor.spec.ts`
- Create: `e2e/editor-mobile.spec.ts`
- Modify: `src/widgets/editor/editor-screen.tsx`
- Modify: `playwright.config.ts`
- Create: `README.md`

**Interfaces:**
- Consumes: 모든 앞선 Task의 완성된 편집 흐름
- Produces: 사용자 복구 선택, 실제 PNG 다운로드, 데스크톱·모바일 E2E, 실행 문서

- [ ] **Step 1: Blob 다운로드와 복구 UI 실패 테스트를 작성한다**

```ts
it('PNG Blob을 카드 ID가 포함된 파일명으로 내려받는다', () => {
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click')
    .mockImplementation(() => undefined);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test-download');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  downloadBlob(new Blob(['png'], { type: 'image/png' }), 'birthday-local-demo.png');
  expect(click).toHaveBeenCalledOnce();
  expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
});
```

RecoveryDialog 테스트는 backup이 있을 때 `직전 정상 카드 복구`, 없을 때 `샘플 카드로 다시 시작` 버튼을 표시하고 사용자 확인 전 repository.save를 호출하지 않는지 검증한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `rtk npm test -- src/features/editor/lib src/widgets/editor/recovery-dialog.test.tsx`

Expected: download helper와 복구 UI가 없어 FAIL.

- [ ] **Step 3: 오류·복구·다운로드 흐름을 구현한다**

`downloadBlob()`은 object URL 생성, 임시 anchor click, anchor 제거, URL revoke를 `try/finally`로 처리한다. Export 실패는 Design을 변경하지 않고 Toast를 표시한다. Route error boundary는 `다시 시도` 버튼으로 `reset()`을 호출한다.

복구 Dialog는 현재 손상 record를 자동 저장하지 않는다. 사용자가 backup 또는 sample을 선택하면 Design Store를 교체하고 `SaveCoordinator.flush()`를 호출한다.

- [ ] **Step 4: 데스크톱 E2E 핵심 흐름을 작성한다**

`e2e/editor.spec.ts`는 다음을 한 테스트에서 검증한다.

```ts
import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test('자기 생일 카드를 편집하고 저장·복원·다운로드한다', async ({ page }) => {
  await page.goto('/editor/local-demo');
  await expect(page.getByTestId('editor-canvas')).toBeVisible();

  await page.getByRole('button', { name: '레이어' }).click();
  await page.getByRole('button', { name: '오늘은 제 생일이에요! 레이어 선택' }).click();
  await page.getByRole('textbox', { name: '선택한 텍스트 내용' }).fill('올해도 제 생일을 축하해 주세요!');

  const fileInput = page.getByLabel('사진 파일 선택');
  await fileInput.setInputFiles({
    name: 'birthday.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'),
  });

  await expect(page.getByText('저장됨')).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '레이어' }).click();
  await expect(page.getByRole('button', { name: '올해도 제 생일을 축하해 주세요! 레이어 선택' })).toBeVisible();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'PNG 저장' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('birthday-local-demo.png');
  const downloadPath = await download.path();
  if (!downloadPath) throw new Error('다운로드 파일 경로가 없습니다.');
  const png = await readFile(downloadPath);
  expect(png.readUInt32BE(16)).toBe(1080);
  expect(png.readUInt32BE(20)).toBe(1350);
});
```

Canvas drag는 sample title의 알려진 Design 좌표를 viewport 좌표로 변환하고 저장 record를 직접 읽어 검증한다.

```ts
const canvas = page.getByTestId('editor-canvas');
const box = await canvas.boundingBox();
if (!box) throw new Error('Canvas 위치를 찾을 수 없습니다.');
const scale = box.width / 1080;
const start = { x: box.x + (180 + 360) * scale, y: box.y + (140 + 90) * scale };
await page.mouse.move(start.x, start.y);
await page.mouse.down();
await page.mouse.move(start.x + 80, start.y + 40, { steps: 8 });
await page.mouse.up();
await expect(page.getByText('저장됨')).toBeVisible();

const movedX = await readSavedElementX(page, 'local-demo', 'title');
expect(movedX).toBeGreaterThan(180);
await page.getByRole('button', { name: '실행 취소' }).click();
expect(await readSavedElementX(page, 'local-demo', 'title')).toBe(180);
await page.getByRole('button', { name: '다시 실행' }).click();
expect(await readSavedElementX(page, 'local-demo', 'title')).toBe(movedX);
```

`readSavedElementX()`는 테스트가 Fabric 객체에 의존하지 않고 제품 Design record를 검증하게 한다.

```ts
async function readSavedElementX(page: Page, cardId: string, elementId: string) {
  return page.evaluate(async ({ cardId, elementId }) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('birthday-canvas');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const record = await new Promise<{
      current: { pages: Array<{ elements: Array<{ id: string; x: number }> }> };
    }>((resolve, reject) => {
      const request = db.transaction('design-records').objectStore('design-records').get(cardId);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const element = record.current.pages[0].elements
      .find((candidate: { id: string }) => candidate.id === elementId);
    if (!element) throw new Error(`저장 요소가 없습니다: ${elementId}`);
    return element.x as number;
  }, { cardId, elementId });
}
```

- [ ] **Step 5: 모바일 E2E를 작성한다**

390×844 viewport에서 데스크톱 Sidebar가 없고 모바일 toolbar와 Bottom Sheet가 보이는지, 텍스트 수정, Undo/Redo, 저장, PNG 다운로드가 가능한지 검증한다. 태블릿은 820×1180 smoke test로 drawer 버튼과 잘리지 않은 Canvas bounding box를 확인한다.

- [ ] **Step 6: 전체 자동 검증을 실행한다**

Run:

```bash
rtk npm run lint
rtk npm run typecheck
rtk npm test
rtk npm run build
rtk npx playwright install chromium
rtk npm run test:e2e
rtk git diff --check
```

Expected: 모든 명령 exit 0, Chromium E2E PASS, working tree whitespace error 없음.

- [ ] **Step 7: 실제 브라우저 최종 검증을 수행한다**

`rtk npm run dev`로 실행한 뒤 1280px 데스크톱과 390px 모바일에서 다음을 직접 관찰한다.

```text
샘플 로드
텍스트 직접 편집
PNG/JPEG/WebP 업로드
요소 이동·크기·회전
레이어 앞뒤 이동
배경색 변경
Undo/Redo
새로고침 복원
PNG 파일 열기와 1080x1350 크기 확인
저장 실패와 복구 안내의 읽기 쉬운 문구 확인
브라우저 console error 없음
```

- [ ] **Step 8: README와 최종 구현을 커밋한다**

README에는 Node 요구사항, 설치, dev, test, E2E, build 명령, `/editor/local-demo`, 브라우저 저장 초기화 방법을 기록한다.

```bash
rtk git add src/app/editor src/features/editor/lib src/widgets/editor e2e playwright.config.ts README.md
rtk git commit -m "feat: 편집기 복구와 PNG 출력 흐름을 완성한다" -m "- 손상 문서를 자동 덮어쓰지 않는 사용자 선택형 복구 UI를 제공한다.
- 1080x1350 PNG 다운로드와 실패 알림을 연결한다.
- 데스크톱·태블릿·모바일의 저장 복원과 핵심 편집 흐름을 Playwright로 검증한다.
- 로컬 실행과 전체 검증 방법을 README에 기록한다.

검증: npm run lint, npm run typecheck, npm test, npm run build, npm run test:e2e, git diff --check"
```

---

## Final Acceptance Checklist

- [ ] `/editor/local-demo`에서 네트워크 없이 자기 생일 샘플 카드가 열린다.
- [ ] Text, Image, rectangle, circle 요소를 추가하고 단일 선택으로 편집할 수 있다.
- [ ] 이동, 크기, 회전은 interaction 종료 시 Command 한 개만 기록한다.
- [ ] Undo/Redo와 새 명령의 Redo 초기화가 동작한다.
- [ ] Design JSON에 Fabric 객체, Fabric JSON, Blob URL, 이미지 바이너리가 없다.
- [ ] React UI에 `fabric` import가 없다.
- [ ] IndexedDB 현재 문서와 직전 정상 backup이 복구 상태를 구분한다.
- [ ] 데스크톱, 태블릿, 모바일에서 지정된 적응형 UI가 동작한다.
- [ ] PNG 출력 파일이 실제로 열리고 `1080 × 1350`이다.
- [ ] lint, typecheck, Vitest, production build, Playwright E2E가 모두 통과한다.
- [ ] 각 구현 커밋에 상세한 한국어 본문과 검증 명령이 기록되어 있다.
