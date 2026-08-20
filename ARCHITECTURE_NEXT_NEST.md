# Code Architecture Guide

> **Project Type:** Birthday / invitation / celebration card editor & sharing service  
> **Frontend:** Next.js (App Router) + React + TypeScript  
> **Editor Engine:** Fabric.js  
> **Client State:** Zustand  
> **Server State:** TanStack Query  
> **API Server:** NestJS  
> **Database:** PostgreSQL + JSONB  
> **Object Storage:** R2 or S3-compatible storage  
>
> This document defines the default architecture and code ownership rules for the project.
> The goal is to keep the card editor extensible without turning Next.js into a second backend or coupling the product domain to Fabric.js.

---

## 1. Architecture Goals

This product is not a general-purpose Canva clone.

The product is centered on:

- birthday cards
- birthday invitations
- celebration / congratulation cards
- reusable templates
- image and text editing
- publishing and link sharing
- comments / likes and other social interactions

The editor should provide meaningful customization while keeping the implementation much smaller than a full design suite.

The architecture must therefore optimize for:

1. **Editor complexity isolation**
2. **Clear Next.js / NestJS ownership**
3. **No Fabric.js persistence coupling**
4. **Separate server, design, editor, and UI state**
5. **Selective SSR / static rendering only where it creates product value**
6. **Fast client-side interaction inside the editor**
7. **Easy evolution of templates and design JSON**
8. **A codebase that remains understandable for a small team**

---

## 2. System Architecture

```text
┌──────────────────────────────────────────────┐
│                  Next.js                     │
│                                              │
│  Public Web                                  │
│  - Home                                      │
│  - Template discovery                        │
│  - Published card / share page               │
│  - Profile / social UI                       │
│                                              │
│  Editor                                      │
│  - React Client Components                   │
│  - Fabric.js                                 │
│  - Zustand                                   │
│  - TanStack Query                            │
└──────────────────────┬───────────────────────┘
                       │
                    HTTP API
                       │
                       ▼
┌──────────────────────────────────────────────┐
│                  NestJS                      │
│                                              │
│  Auth / User                                 │
│  Card / Project                              │
│  Template                                    │
│  Asset                                       │
│  Publish / Share                             │
│  Comment / Like                              │
│  Billing                                     │
└───────────────┬───────────────────┬──────────┘
                │                   │
                ▼                   ▼
       PostgreSQL + JSONB        R2 / S3

       relational data          uploaded images
       design document          generated preview
       social data              published assets
```

### Core rule

> **Next.js owns the web application. NestJS owns the business API.**

Next.js must not gradually become a second domain backend.

---

# 3. Rendering Strategy

Next.js is used primarily as the frontend framework.

Do **not** force SSR onto every page just because Next.js supports it.

Choose rendering per route.

---

## 3.1 Editor — Client-side application

The editor is an interactive application and should behave essentially like an SPA.

```text
/editor/[cardId]

Next.js route
      ↓
Editor Client Boundary
      ↓
React + Zustand
      ↓
Editor Application
      ↓
Fabric Adapter
      ↓
Fabric.js
```

The Fabric.js editor must run in a Client Component.

Example:

```tsx
// app/(editor)/editor/[cardId]/page.tsx

import { EditorScreen } from '@/widgets/editor';

export default function EditorPage() {
  return <EditorScreen />;
}
```

```tsx
// widgets/editor/editor-screen.tsx
'use client';

export function EditorScreen() {
  // editor runtime
}
```

Do not attempt to SSR the actual canvas editor.

---

## 3.2 Published card / share page — SSR or static rendering

Example:

```text
/card/[slug]
```

This page may be shared through:

- KakaoTalk
- Messenger
- Discord
- X
- community sites
- search engines

It therefore needs server-renderable metadata such as:

```text
title
description
thumbnail
Open Graph metadata
canonical URL
```

### Default recommendation

Use **dynamic server rendering (SSR)** when the published card information can change and the share preview should reflect the latest state.

```text
Request
   ↓
Next.js server
   ↓
NestJS API
   ↓
render HTML + metadata
```

This is particularly useful when:

- title can change
- visibility can change
- the card can be republished
- preview image can change
- request-time access control is needed

### Static rendering / revalidation

Static rendering is suitable when a published result is effectively immutable or changes rarely.

Examples:

- public template landing pages
- category pages with controlled revalidation
- immutable published card snapshots

Use static rendering because it actually improves caching / load characteristics, **not merely because it exists**.

---

## 3.3 Rendering decision table

| Route | Default rendering | Reason |
|---|---|---|
| `/` | Static or server | marketing / discovery |
| `/templates` | Static + revalidation or server | discoverability |
| `/templates/[slug]` | Static + revalidation | SEO-friendly template detail |
| `/editor/[id]` | **Client-side** | highly interactive Fabric editor |
| `/cards` | Client/server depending UX | user-specific list |
| `/card/[slug]` | **SSR by default** | sharing / OG / current published state |
| `/profile/[id]` | Server or hybrid | public/social content |
| `/settings` | Client/server | authenticated application UI |

The route should select the simplest rendering strategy that satisfies the product requirement.

---

# 4. Next.js / NestJS Responsibility Boundary

This boundary is mandatory.

## Next.js owns

```text
routing
page composition
React UI
server/client component composition
SEO metadata
Open Graph metadata
web-specific redirects
Fabric editor
browser interactions
frontend state
```

## NestJS owns

```text
authentication domain
authorization
users
cards / projects
templates
assets
publishing
comments
likes
payments
business validation
database transaction
persistent design data
```

---

## 4.1 Do not duplicate domain APIs in Next.js

Avoid:

```text
Next.js /api/cards
NestJS /cards
```

with business logic split between both.

This eventually creates ambiguity:

> "Should this logic live in Next or Nest?"

All domain logic goes to NestJS.

If a Next.js Route Handler or Server Action is introduced, keep it web-specific and thin.

Acceptable examples:

```text
OAuth web callback glue
web-only cookie bridge
metadata helper
proxy needed for a specific browser constraint
```

Not acceptable:

```text
create card business logic
publish card business rules
comment permission checks
subscription state transitions
```

Those belong to NestJS.

---

# 5. Recommended Monorepo Layout

```text
root/
├─ apps/
│  ├─ web/                     # Next.js
│  └─ api/                     # NestJS
│
├─ packages/
│  ├─ design-schema/           # shared Design JSON schema/types
│  ├─ api-contract/            # optional request/response contracts
│  └─ shared-config/           # lint/tsconfig etc.
│
├─ package.json
└─ ARCHITECTURE.md
```

The most important shared package is `design-schema`.

```text
packages/design-schema
├─ src/
│  ├─ design.ts
│  ├─ page.ts
│  ├─ element.ts
│  ├─ text-element.ts
│  ├─ image-element.ts
│  ├─ shape-element.ts
│  └─ schema.ts
└─ index.ts
```

Use a runtime schema library such as Zod when API input validation needs to share the same document contract.

---

# 6. Frontend Directory Structure

Inside `apps/web/src`:

```text
src/
├─ app/
│  ├─ (public)/
│  │  ├─ page.tsx
│  │  ├─ templates/
│  │  │  ├─ page.tsx
│  │  │  └─ [slug]/
│  │  │     └─ page.tsx
│  │  ├─ card/
│  │  │  └─ [slug]/
│  │  │     └─ page.tsx
│  │  └─ profile/
│  │     └─ [id]/
│  │        └─ page.tsx
│  │
│  ├─ (app)/
│  │  ├─ cards/
│  │  └─ settings/
│  │
│  ├─ (editor)/
│  │  └─ editor/
│  │     └─ [cardId]/
│  │        └─ page.tsx
│  │
│  ├─ layout.tsx
│  └─ globals.css
│
├─ entities/
│  ├─ design/
│  ├─ card/
│  ├─ template/
│  ├─ user/
│  └─ comment/
│
├─ features/
│  ├─ editor/
│  ├─ publish-card/
│  ├─ comment/
│  ├─ like-card/
│  └─ upload-asset/
│
├─ widgets/
│  ├─ editor/
│  ├─ card-feed/
│  ├─ card-detail/
│  └─ template-gallery/
│
└─ shared/
   ├─ api/
   ├─ ui/
   ├─ lib/
   ├─ hooks/
   └─ config/
```

This is **FSD-inspired**, not strict FSD.

Do not fragment every editor action into its own top-level feature folder.

The editor is treated as one large bounded context.

---

# 7. Editor Internal Architecture

```text
features/editor/
├─ core/
│  ├─ editor.ts
│  ├─ editor-command.ts
│  ├─ editor-history.ts
│  ├─ editor-selection.ts
│  ├─ editor-clipboard.ts
│  └─ editor-viewport.ts
│
├─ fabric/
│  ├─ fabric-editor-renderer.ts
│  ├─ fabric-element-mapper.ts
│  ├─ fabric-event-adapter.ts
│  ├─ fabric-canvas-controller.ts
│  └─ fabric-exporter.ts
│
├─ model/
│  ├─ design-store.ts
│  ├─ editor-store.ts
│  └─ editor-ui-store.ts
│
├─ actions/
│  ├─ add-text.ts
│  ├─ add-image.ts
│  ├─ delete-element.ts
│  ├─ duplicate-element.ts
│  ├─ update-text.ts
│  ├─ change-layer.ts
│  └─ align-elements.ts
│
├─ commands/
│  ├─ add-element-command.ts
│  ├─ delete-element-command.ts
│  ├─ transform-element-command.ts
│  └─ update-element-command.ts
│
├─ hooks/
│  ├─ use-editor.ts
│  ├─ use-selection.ts
│  └─ use-keyboard-shortcuts.ts
│
└─ index.ts
```

---

# 8. Core Rule — Fabric.js is not the Domain Model

Never make Fabric objects the persistent product model.

## Forbidden

```ts
interface CardProject {
  objects: FabricObject[];
}
```

Also avoid using raw `canvas.toJSON()` as the permanent database contract.

Fabric is an implementation detail.

---

## Recommended Design Model

```ts
export interface Design {
  version: number;
  width: number;
  height: number;
  pages: DesignPage[];
}
```

```ts
export interface DesignPage {
  id: string;
  elements: DesignElement[];
}
```

```ts
export type DesignElement =
  | TextElement
  | ImageElement
  | ShapeElement;
```

```ts
export interface BaseElement {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
}
```

```ts
export interface TextElement extends BaseElement {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  textAlign: 'left' | 'center' | 'right';
}
```

```ts
export interface ImageElement extends BaseElement {
  type: 'image';
  assetId: string;
  src: string;

  crop?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}
```

Persist this product-owned model.

```text
PostgreSQL JSONB
      ↓
Design Schema
      ↓
Editor Domain
      ↓
Fabric Mapper
      ↓
Fabric Objects
```

---

# 9. Fabric Adapter Boundary

Components must not manipulate Fabric directly.

## Forbidden

```tsx
<Button
  onClick={() => {
    canvas.add(new FabricText('Happy Birthday'));
  }}
>
  Add text
</Button>
```

## Recommended

```tsx
const editor = useEditor();

<Button onClick={() => editor.addText()}>
  Add text
</Button>
```

Internally:

```text
React UI
   ↓
Editor API
   ↓
Design change
   ↓
Command / History
   ↓
Fabric Adapter
   ↓
Fabric.js
```

The UI should not need to know which rendering library is being used.

---

# 10. State Ownership

Do not create one giant editor Zustand store.

Separate state by responsibility.

---

## 10.1 Server state — TanStack Query

Examples:

```text
card metadata
template list
comments
likes
profile
asset metadata
publish state
```

Use TanStack Query.

```ts
useQuery({
  queryKey: ['card', cardId],
  queryFn: () => cardApi.get(cardId),
});
```

---

## 10.2 Design state — Zustand

Persistent document state.

```text
pages
elements
background
document size
```

Example store:

```text
useDesignStore
```

---

## 10.3 Editor runtime state — Zustand

Non-persistent editing state.

```text
selected element ids
zoom
viewport
dragging
editing mode
active page
```

Example:

```text
useEditorStore
```

---

## 10.4 UI state — Zustand or local state

```text
active sidebar
layer panel open
modal
toolbar mode
drawer
```

Example:

```text
useEditorUiStore
```

---

## 10.5 Fabric runtime state

Fabric owns only its runtime rendering objects.

```text
Fabric Canvas
Fabric Objects
selection handles
internal transforms
```

Do not use Fabric as the source of truth for the product document.

---

# 11. Source of Truth

The canonical persisted source is:

```text
Design JSON
```

Not:

```text
Fabric Canvas
```

Normal flow:

```text
NestJS Design JSON
      ↓
Design Store
      ↓
Fabric Mapper
      ↓
Canvas
```

User interaction:

```text
Canvas interaction
      ↓
Fabric event adapter
      ↓
Editor action / command
      ↓
Design Store update
      ↓
Canvas synchronization
```

---

# 12. Fabric Events

Fabric events must not leak through the entire UI.

```text
Fabric Event
    ↓
FabricEventAdapter
    ↓
Editor Event
```

Example:

```ts
type EditorEvent =
  | {
      type: 'element:moved';
      elementId: string;
      x: number;
      y: number;
    }
  | {
      type: 'selection:changed';
      elementIds: string[];
    };
```

This protects the application layer from Fabric-specific event semantics.

---

# 13. Undo / Redo

Use a Command-oriented architecture for meaningful editor changes.

```ts
export interface EditorCommand {
  execute(): void;
  undo(): void;
}
```

Examples:

```text
AddElementCommand
DeleteElementCommand
TransformElementCommand
UpdateTextCommand
ChangeColorCommand
ChangeLayerCommand
```

Flow:

```text
User action
   ↓
Command
   ↓
execute
   ↓
history stack
```

Undo:

```text
history.pop()
   ↓
command.undo()
```

Do not record every `mousemove` / transform frame as a history entry.

For drag / resize / rotate:

```text
interaction start
    ↓
capture before state
    ↓
continuous visual transform
    ↓
interaction end
    ↓
capture after state
    ↓
one history command
```

---

# 14. Card Persistence

A card should contain normal relational metadata plus the Design JSON document.

Example conceptual table:

```text
cards
────────────────────────────
id
owner_id
title
slug
status
visibility
design_data JSONB
thumbnail_url
published_asset_url
published_at
created_at
updated_at
```

`design_data` is the editable source.

Actual uploaded images are stored in R2 / S3, not PostgreSQL.

---

# 15. Draft vs Published Card

Keep edit state and published presentation conceptually separate.

```text
Card
 ├─ designData
 ├─ status
 │   ├─ DRAFT
 │   └─ PUBLISHED
 ├─ thumbnailUrl
 └─ publishedAssetUrl
```

When editing:

```text
Fabric Editor
    ↓
Design JSON
    ↓
NestJS
    ↓
PostgreSQL JSONB
```

When publishing:

```text
Design
   ↓
render / export
   ↓
PNG / WebP
   ↓
R2
   ↓
publishedAssetUrl
```

Feed and share pages should normally render the generated asset instead of booting Fabric.js.

```text
Editor page
→ Fabric.js

Public card page
→ regular web UI + generated card image
```

---

# 16. Templates

Templates should use the same Design Schema as user cards where possible.

```text
Template
 ├─ metadata
 ├─ preview image
 └─ designData
```

Flow:

```text
Template Design
      ↓
duplicate / instantiate
      ↓
User Card Design
      ↓
Editor
```

Avoid creating a completely separate template rendering model unless product requirements actually require one.

---

# 17. Asset Architecture

Store actual binary content in R2 / S3-compatible object storage.

```text
PostgreSQL
  ↓
asset id
URL
metadata
ownership
dimensions

R2 / S3
  ↓
original images
generated thumbnails
published card images
```

An `ImageElement` should preferably reference an asset identity, not only an arbitrary external URL.

---

# 18. API Layer

Frontend API code should be centralized.

```text
shared/api/
├─ http-client.ts
├─ card-api.ts
├─ template-api.ts
├─ asset-api.ts
├─ comment-api.ts
└─ auth-api.ts
```

Components should not contain ad-hoc `fetch()` calls.

Prefer:

```ts
cardApi.get(cardId)
cardApi.save(cardId, design)
cardApi.publish(cardId)
```

---

# 19. Server Components and Client Components

Do not mark large route trees with `'use client'` by default.

Use Server Components for web composition where useful.

Push the client boundary down to interaction-heavy regions.

Example:

```text
card/[slug]/page.tsx        Server
 ├─ CardHeader              Server-compatible
 ├─ PublishedCard           Server-compatible
 ├─ CommentSectionShell
 │    └─ CommentComposer    Client
 └─ LikeButton              Client
```

Editor:

```text
editor/[id]/page.tsx
    ↓
EditorScreen                Client boundary
       ├─ Toolbar
       ├─ Sidebar
       ├─ Canvas
       └─ Layers
```

The editor is intentionally client-heavy.

The rest of the site does not need to be.

---

# 20. Shared Card Metadata

For public card routes, metadata should be generated from server-visible card information.

Conceptually:

```ts
export async function generateMetadata({ params }) {
  const card = await getPublishedCard(params.slug);

  return {
    title: card.title,
    description: card.description,
    openGraph: {
      images: [card.thumbnailUrl],
    },
  };
}
```

The server-side request should query the NestJS API.

Do not initialize Fabric.js merely to build social preview metadata.

---

# 21. Social Features

Social features are regular NestJS domains.

```text
Card
 ├─ Comments
 ├─ Likes
 └─ Share metadata
```

Examples:

```text
POST /cards/:id/comments
DELETE /comments/:id

POST /cards/:id/likes
DELETE /cards/:id/likes
```

The editor domain should not own comments or likes.

This separation matters because:

```text
Editor = design application

Published Card = social content
```

They are related product concepts but different responsibilities.

---

# 22. Initial Editor Feature Scope

Recommended first scope:

```text
Template selection

Text
- add
- edit
- font
- size
- color
- alignment

Image
- upload
- replace
- move
- resize
- rotate
- crop

Shapes / stickers
- add
- move
- resize
- rotate

Canvas
- background
- layer ordering
- selection
- undo / redo
- export
```

Avoid implementing full Canva-level functionality initially.

Not required for the first architecture:

```text
advanced vector editing
blend modes
complex masks
video editing
animation timeline
realtime collaborative editing
advanced grouping
plugin ecosystem
```

---

# 23. Anti-patterns

## Do not

### 1. Persist raw Fabric JSON as the permanent product model

```text
Fabric internals ≠ product domain
```

### 2. Call Fabric directly from arbitrary components

```text
UI → Fabric
```

should instead be:

```text
UI → Editor API → Fabric Adapter
```

### 3. Put every state into one Zustand store

Keep:

```text
server
design
editor runtime
UI
```

separate.

### 4. Turn Next.js into another domain backend

```text
Next business API + Nest business API
```

is forbidden unless there is a deliberate architectural decision to change the backend topology.

### 5. SSR the Fabric editor

The editor is a client application.

### 6. Store uploaded binary images inside PostgreSQL

Use object storage.

### 7. Render Fabric for public feed cards

Use generated image assets.

---

# 24. Testing Strategy

Prioritize tests around stable product-owned logic.

## High-value unit tests

```text
Design schema validation
Element transformations
Command execute / undo
History behavior
Layer ordering
Template instantiation
Fabric ↔ Design mapper
```

## Integration tests

```text
load card → initialize editor
edit → serialize → save
save → reload → identical design
publish → generated asset
```

## E2E

Critical user flows:

```text
choose template
    ↓
edit text / photo
    ↓
save
    ↓
publish
    ↓
open share URL
    ↓
comment / like
```

---

# 25. Dependency Direction

The desired dependency direction is:

```text
UI
 ↓
Feature / Application
 ↓
Domain
 ↑
Adapter
 ↓
External Library
```

In practical terms:

```text
React UI
   ↓
Editor API
   ↓
Design Domain
   ↓
Fabric Adapter
   ↓
Fabric.js
```

Never let `entities/design` import Fabric.

Never let `packages/design-schema` import Next.js, React, Fabric, or NestJS.

The Design Schema package should be framework-independent.

---

# 26. Architecture Decision Summary

The project defaults are:

```text
Frontend
→ Next.js App Router

Business API
→ NestJS

Editor
→ React Client Components + Fabric.js

Client state
→ Zustand

Server state
→ TanStack Query

Design persistence
→ product-owned JSON schema

Database
→ PostgreSQL + JSONB

Asset storage
→ R2 / S3

Public card rendering
→ SSR by default when freshness matters

Static rendering
→ templates / immutable or cache-friendly public content

Editor rendering
→ client-side only
```

---

# 27. Definition of Done for New Features

Before merging an editor-related feature, check:

- [ ] Does the feature use the product Design Model instead of storing Fabric-specific data?
- [ ] Is Fabric access isolated behind the editor / Fabric adapter boundary?
- [ ] Does the React component avoid owning domain logic?
- [ ] Is the state stored in the correct layer?
- [ ] Is a server-side concern handled by NestJS rather than duplicated in Next.js?
- [ ] If the change affects undoable user actions, is history behavior defined?
- [ ] Does the Design Schema need a version/schema change?
- [ ] Can the card be saved and reloaded without losing the new state?
- [ ] Does published-card rendering work without loading Fabric.js?
- [ ] Is SSR/static rendering being used because the route benefits from it, rather than by default?
- [ ] Are share metadata / thumbnail changes reflected correctly?
- [ ] Is the feature covered by an appropriate mapper/domain/integration test?

---

# 28. Three Non-Negotiable Rules

If only three rules are remembered, remember these:

> **1. Fabric.js objects are never the permanent domain / database model.**

> **2. React UI does not directly manipulate Fabric.js; it goes through the Editor boundary.**

> **3. Next.js owns the web layer, while NestJS owns business logic and persistent APIs.**

Everything else can evolve around these constraints.
