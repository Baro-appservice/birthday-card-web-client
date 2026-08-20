# 자기 생일 카드 편집기 MVP 설계

## 1. 문서 목적

이 문서는 사용자가 자기 생일 카드를 직접 꾸미는 웹 편집기 MVP의 승인된 설계를 기록한다. 사용자는 완성된 샘플 카드에서 시작해 문구, 사진, 도형을 편집하고 브라우저에 저장한 뒤 PNG로 내려받을 수 있다.

제품의 장기 흐름은 다음과 같다.

```text
사용자가 자기 생일 카드를 만든다
→ 링크로 공유한다
→ 지인들이 카드를 보고 축하와 댓글을 남긴다
```

이번 MVP는 첫 번째 단계인 카드 편집 경험만 검증한다. 백엔드, 인증, 공유 링크, 게시, 댓글, 좋아요는 구현하지 않는다.

## 2. 기준 아키텍처

프로젝트 루트의 `ARCHITECTURE_NEXT_NEST.md`를 최우선 아키텍처 규칙으로 따른다. 특히 다음 세 가지 규칙은 변경하지 않는다.

1. Fabric.js 객체를 영구 Domain 또는 저장 모델로 사용하지 않는다.
2. React UI는 Fabric.js를 직접 조작하지 않고 Editor 경계를 통한다.
3. 추후 백엔드가 도입되더라도 Next.js는 웹 계층을, NestJS는 비즈니스 API를 소유한다.

현재 폴더 자체를 독립 Next.js 애플리케이션으로 사용한다. 아직 백엔드가 필요하지 않으므로 모노레포의 `apps/web`, `apps/api`, `packages` 구조는 만들지 않는다.

## 3. 기술 선택

- Next.js `16.2.11`
- App Router
- React와 TypeScript
- Fabric.js
- Zustand
- Zod
- Tailwind CSS `4.3.3`과 같은 버전의 PostCSS 플러그인
- CSS Modules
- IndexedDB
- Vitest와 React Testing Library
- Playwright

TanStack Query는 서버 상태가 생기는 시점에 도입한다. 이번 MVP에는 서버 상태가 없으므로 설치하지 않는다.

### 3.1 CSS 전략

일반 레이아웃, 간격, 반응형 UI는 Tailwind CSS를 사용한다. 소프트 스튜디오 브랜드 색상, 모서리, 그림자는 CSS 변수와 Tailwind 테마 토큰으로 관리한다. Fabric 캔버스 컨테이너처럼 복잡하고 컴포넌트에 강하게 결합된 스타일에만 CSS Modules를 사용한다.

CSS-in-JS와 Bootstrap, MUI 같은 완성형 UI 프레임워크는 사용하지 않는다.

## 4. 구현 접근법

속도만을 위해 Fabric 캔버스를 Domain으로 사용하는 시연판을 만들지 않는다. 다음 계층 경계를 유지하는 균형 잡힌 Editor Core를 구현한다.

```text
React UI
   ↓
Editor API / Command
   ↓
Design Domain
   ↓
Renderer Port
   ↓
Fabric Adapter
```

영구 저장 가능한 Design 문서가 제품의 원본이다. Fabric은 화면 표시와 실시간 포인터 상호작용을 담당하는 런타임 엔진이다.

## 5. 디렉터리 구조

```text
src/
├─ app/
│  ├─ editor/
│  │  └─ [cardId]/
│  │     └─ page.tsx
│  ├─ layout.tsx
│  └─ globals.css
│
├─ entities/
│  └─ design/
│     ├─ model/
│     │  ├─ design.ts
│     │  ├─ element.ts
│     │  └─ design-schema.ts
│     └─ index.ts
│
├─ features/
│  └─ editor/
│     ├─ core/
│     │  ├─ ports/
│     │  ├─ editor.ts
│     │  ├─ editor-command.ts
│     │  └─ editor-history.ts
│     ├─ actions/
│     ├─ commands/
│     ├─ fabric/
│     ├─ model/
│     ├─ persistence/
│     │  └─ browser/
│     ├─ hooks/
│     └─ index.ts
│
├─ widgets/
│  └─ editor/
│     ├─ editor-screen.tsx
│     ├─ toolbar/
│     ├─ sidebar/
│     └─ canvas/
│
└─ shared/
   ├─ ui/
   ├─ lib/
   └─ config/
```

`app`은 라우팅과 화면 조합만 담당한다. `entities/design`은 React, Next.js, Zustand, Fabric.js를 import하지 않는다. `widgets/editor`는 Editor API를 호출하지만 Fabric API는 알지 못한다.

## 6. 외부 경계 추상화

교체 가능성이 명확한 네 가지 외부 경계만 Port로 정의한다.

### 6.1 EditorRenderer

Fabric.js와 Editor Application 사이의 경계다.

```ts
interface EditorRenderer {
  mount(element: HTMLCanvasElement): void;
  render(design: Design): Promise<void>;
  select(elementIds: string[]): void;
  subscribe(listener: EditorEventListener): () => void;
  dispose(): void;
}
```

현재 구현은 `FabricEditorRenderer`다. 단위 테스트에서는 Canvas가 필요 없는 Fake 구현을 사용할 수 있다.

### 6.2 DesignRepository

Design 문서의 저장 경계다.

```ts
interface DesignRepository {
  load(cardId: string): Promise<Design | null>;
  save(cardId: string, design: Design): Promise<void>;
}
```

현재 구현은 `IndexedDbDesignRepository`다. 추후 `ApiDesignRepository`로 교체하더라도 Editor Core는 변경하지 않는다.

### 6.3 AssetGateway

업로드 이미지의 저장과 표시 URL 획득 경계다.

```ts
interface AssetGateway {
  upload(file: File): Promise<AssetReference>;
  resolveUrl(assetId: string): Promise<string>;
  remove(assetId: string): Promise<void>;
}
```

현재 `BrowserAssetGateway`는 사용자 업로드 Blob을 IndexedDB에 저장한다. `builtin:` 접두사의 기본 Asset ID는 정적 Asset Registry를 통해 애플리케이션에 포함된 파일로 해석한다. 추후 API 구현은 NestJS를 통해 업로드하고 R2 또는 S3 호환 URL을 반환할 수 있다. Design 문서에는 브라우저 세션에 종속된 Blob URL을 저장하지 않는다.

### 6.4 DesignExporter

내보내기 구현의 경계다.

```ts
interface DesignExporter {
  exportPng(
    design: Design,
    options: ExportOptions,
  ): Promise<Blob>;
}
```

현재 구현은 Fabric 기반 클라이언트 PNG 내보내기다. 추후 고해상도 서버 렌더링으로 교체할 수 있다.

Zustand Store, Zod 검증, ID 생성, 레이어 계산, Undo/Redo 스택, 브라우저 다운로드 함수는 별도 Port로 추상화하지 않는다. 이들은 외부 시스템 경계가 아니거나 단순한 도메인 로직이다.

## 7. Design 문서 모델

첫 버전의 저장 모델은 다음 형태다.

```ts
interface Design {
  version: 1;
  width: 1080;
  height: 1350;
  pages: DesignPage[];
}

interface DesignPage {
  id: string;
  background: string;
  elements: DesignElement[];
}
```

MVP UI는 한 페이지만 지원하지만 저장 형식은 `pages` 배열을 사용한다. 멀티 페이지 편집 기능은 구현하지 않는다.

```ts
interface BaseElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
}

type DesignElement =
  | TextElement
  | ImageElement
  | ShapeElement;
```

레이어 순서는 `elements` 배열 순서가 원본이다. `elements[0]`이 가장 뒤, 마지막 요소가 가장 앞이다. 중복 상태를 피하기 위해 별도의 `zIndex` 필드는 두지 않는다.

`ImageElement`는 `assetId`만 저장한다. URL은 렌더링 시 `AssetGateway.resolveUrl()`로 얻는다.

모든 저장 문서는 Zod 런타임 스키마로 검증한다. `version: 1`은 향후 문서 마이그레이션의 기준이다.

## 8. 상태 소유권

상태는 다음 세 Store와 Fabric 런타임으로 분리한다.

### 8.1 Design Store

저장 대상인 `pages`, `elements`, `background`를 소유한다.

### 8.2 Editor Runtime Store

선택된 요소 ID, zoom, 활성 페이지, 현재 조작 여부, 캔버스 준비 상태를 소유한다. 영구 저장하지 않는다.

### 8.3 Editor UI Store

열린 왼쪽 패널, 모바일 Bottom Sheet, 저장 상태와 오류 표시를 소유한다. 문서 데이터와 섞지 않는다.

### 8.4 Fabric Runtime

Fabric Canvas, Fabric Object, 선택 핸들, 실시간 transform을 소유한다. Zustand에 Fabric 객체를 넣지 않는다.

## 9. Command와 동기화

일반적인 사용자 동작은 다음 흐름을 따른다.

```text
사용자 조작
→ React UI
→ Editor API
→ Command 실행
→ Design Store 변경
→ Fabric Renderer 반영
→ History 저장
→ 자동 저장 예약
```

Undo 가능한 의미 있는 변경은 Command로 표현한다.

```ts
interface EditorCommand {
  execute(): void;
  undo(): void;
}
```

새 명령을 실행하면 Redo 스택을 비운다.

이동, 크기 조절, 회전은 조작 시작 시 before 상태를 캡처한다. 조작 중에는 Fabric만 실시간으로 표시한다. 조작이 끝나면 after 상태와 함께 `TransformElementCommand` 한 개를 기록하고 Design Store를 갱신한다. 포인터 이동 프레임마다 Zustand나 History를 변경하지 않는다.

Renderer와 Store 동기화가 실패하면 Design Store를 원본으로 전체 캔버스를 다시 렌더링한다.

## 10. 화면과 반응형 동작

선택된 디자인 방향은 `B 집중형 레이아웃`과 `소프트 스튜디오` 스타일이다.

### 10.1 데스크톱

- 상단: 서비스 이름, 저장 상태, Undo/Redo, PNG 다운로드
- 왼쪽: 텍스트, 사진, 도형, 레이어 패널
- 중앙: 4:5 캔버스와 확대/축소
- 선택 요소의 속성은 캔버스 위 맥락 툴바에 표시
- 오른쪽 고정 속성 패널은 사용하지 않음

### 10.2 태블릿

- 도구 패널을 접을 수 있는 형태로 변경
- 선택 속성은 팝오버 또는 하단 패널에 표시

### 10.3 모바일

- 상단: 뒤로가기, 저장 상태, Undo/Redo, 다운로드
- 중앙: 가용 너비에 맞춘 4:5 캔버스
- 하단: 텍스트, 사진, 도형 도구
- 선택 속성은 Bottom Sheet로 표시
- 정밀 레이어 패널, 다중 선택, 키보드 단축키는 제공하지 않음

초기 반응형 기준은 768px 미만을 모바일, 768px 이상 1024px 미만을 태블릿, 1024px 이상을 데스크톱으로 본다. 실제 레이아웃은 가용 공간을 기준으로 자연스럽게 축소되도록 구현한다.

캔버스의 Design 좌표는 기기와 무관하게 `1080 × 1350`으로 유지한다. 화면에서만 가용 공간에 맞춰 확대 또는 축소한다. 모바일에서는 `100dvh`, Safe Area, 큰 터치 대상, 가로 화면 자동 맞춤을 적용한다.

## 11. 초기 샘플 카드

초기 경로는 `/editor/local-demo`다. 저장된 문서가 없으면 완성된 자기 생일 카드 샘플을 불러온다.

샘플에는 다음 내용이 포함된다.

- “오늘은 제 생일이에요!”
- 사용자 이름 예시
- 생일 날짜
- “저의 특별한 날을 함께 축하해 주세요”
- 교체 가능한 사진 자리
- 배경과 장식 도형

문구는 타인에게 보내는 축하 카드가 아니라 카드 주인이 자신의 생일을 알리고 함께 축하해 달라고 요청하는 관점으로 작성한다.

샘플 사진은 `builtin:` Asset ID로 참조하는 번들 이미지를 사용한다. 따라서 최초 실행에도 외부 네트워크나 IndexedDB seed가 필요하지 않다. 사용자가 사진을 교체하면 새 `assetId`를 가진 일반 업로드 이미지로 변경한다.

## 12. MVP 기능 범위

### 12.1 텍스트

- 추가와 직접 편집
- 글꼴, 크기, 굵기
- 색상과 정렬
- 이동, 크기 조절, 회전

### 12.2 사진

- PNG, JPEG, WebP 업로드
- 기존 사진 교체
- 이동, 크기 조절, 회전
- 이미지 자르기는 제외

### 12.3 도형

- 사각형과 원 추가
- 채우기 색상 변경
- 이동, 크기 조절, 회전

### 12.4 공통

- 단일 요소 선택과 삭제
- 앞으로 또는 뒤로 한 단계 레이어 이동
- 카드 배경색 변경
- Undo/Redo
- 확대/축소
- 자동 브라우저 저장
- 새로고침 후 복원
- `1080 × 1350` PNG 다운로드
- 데스크톱 삭제 및 Undo/Redo 키보드 단축키

모바일은 텍스트 수정, 사진 추가와 교체, 요소 이동과 크기 조절, Undo/Redo, 저장, PNG 다운로드를 지원한다. PC와 동일한 정밀 기능을 강제로 제공하지 않는다.

## 13. 저장과 복원

디자인과 업로드 Asset 모두 IndexedDB에 저장하되 Editor는 IndexedDB API를 직접 호출하지 않는다.

```text
Design Store 변경
→ transform 종료 확인
→ 짧은 debounce
→ Zod 검증
→ DesignRepository.save()
```

저장 상태는 `저장 중`, `저장됨`, `저장 실패 · 다시 시도`로 표시한다. 저장 실패가 편집을 중단시키지 않는다.

정상 문서를 저장할 때 직전 정상 Design을 백업 슬롯에 유지한다. 손상된 현재 문서를 불러오면 자동으로 덮어쓰지 않고 복구 안내를 표시한다.

삭제한 ImageElement의 Asset은 Undo를 위해 즉시 물리 삭제하지 않는다. 사용하지 않는 Asset 정리는 MVP 범위에서 제외한다.

## 14. 오류 처리

- IndexedDB 초기화 또는 저장 실패: 메모리의 편집 내용은 유지하고 다시 시도 UI를 제공한다.
- 손상된 Design: 원본을 덮어쓰지 않고 직전 정상 문서 또는 샘플 카드 복구를 안내한다.
- 지원하지 않는 문서 버전: 저장을 차단하고 명확한 오류를 표시한다.
- 이미지 형식, 용량 또는 디코딩 오류: Asset과 ImageElement를 모두 생성하지 않는다.
- 기본 또는 업로드 Asset URL 해석 실패: 해당 요소 자리에 오류 placeholder를 표시하고 나머지 문서는 계속 편집할 수 있게 한다.
- PNG 내보내기 실패: 편집 상태를 변경하지 않고 오류를 표시한다.
- Fabric 초기화 실패: 빈 화면 대신 다시 시도할 수 있는 오류 화면을 표시한다.
- Renderer 동기화 실패: Design Store를 기준으로 전체 렌더링을 다시 수행한다.

## 15. 테스트 전략

### 15.1 단위 테스트

- Zod Design 스키마
- 요소 생성과 레이어 순서
- Command execute/undo
- History Undo/Redo와 Redo 초기화
- 저장소 Port 계약
- 문서 버전과 복구 처리
- Fabric과 Design mapper

### 15.2 컴포넌트 테스트

- UI가 Fabric을 직접 호출하지 않고 Editor API만 호출하는지 검증
- 저장 중, 저장 성공, 저장 실패 UI
- 데스크톱 패널과 모바일 Bottom Sheet
- 선택 요소에 맞는 맥락 툴바

### 15.3 E2E 테스트

다음 흐름을 데스크톱과 모바일 뷰포트에서 검증한다.

```text
샘플 카드 불러오기
→ 텍스트 변경
→ 사진 업로드
→ 이동과 크기 변경
→ Undo/Redo
→ 새로고침 후 복원
→ PNG 다운로드
```

완료 전 lint, typecheck, 단위/컴포넌트 테스트, production build, 핵심 E2E를 실행한다.

## 16. Git 운영

저장소의 기본 브랜치는 `main`이다. 기능별로 작고 논리적인 커밋을 남긴다. 각 커밋은 한국어 제목과 본문으로 변경 이유, 주요 내용, 검증 방법을 설명한다.

예상 커밋 흐름은 다음과 같다.

1. 아키텍처와 승인된 MVP 설계 기록
2. Next.js와 품질 도구 초기 구성
3. Design Domain과 Port 정의
4. IndexedDB 저장 Adapter 구현
5. Fabric Renderer와 Command/History 구현
6. 데스크톱 및 모바일 반응형 UI 구현
7. PNG 내보내기와 오류 처리 구현
8. E2E와 최종 품질 검증 보강

커밋은 관련 테스트가 통과하는 일관된 변경 단위에서만 생성한다.

## 17. 제외 범위

- NestJS API와 PostgreSQL
- 사용자 인증과 권한
- 카드 게시와 공유 URL
- 댓글과 좋아요
- 템플릿 갤러리
- 다중 페이지
- 다중 선택과 그룹
- 이미지 자르기
- PDF 내보내기
- 실시간 공동 편집
- 사용하지 않는 Asset 자동 정리

## 18. 완료 기준

- `/editor/local-demo`에서 샘플 자기 생일 카드가 열린다.
- 텍스트, 이미지, 사각형, 원을 추가하고 편집할 수 있다.
- 단일 요소를 선택, 이동, 크기 조절, 회전, 삭제할 수 있다.
- 레이어를 앞이나 뒤로 이동할 수 있다.
- 의미 있는 모든 변경을 Undo/Redo할 수 있다.
- 브라우저 저장 후 새로고침해도 Design과 이미지가 동일하게 복원된다.
- Design JSON에 Fabric 객체나 Blob URL이 포함되지 않는다.
- React UI가 Fabric API를 직접 호출하지 않는다.
- PC, 태블릿, 모바일 레이아웃이 정의된 방식으로 동작한다.
- `1080 × 1350` PNG를 내려받을 수 있다.
- 오류가 편집 내용을 조용히 유실시키지 않는다.
- lint, typecheck, 테스트, production build, 핵심 E2E가 통과한다.
