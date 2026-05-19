# AI SVG Asset Builder — Design Spec

> **Date:** 2026-05-18  
> **Status:** Approved  
> **Goal:** Build a production-ready MVP for a general-purpose AI SVG Asset Builder with an agentic, layout-first, render-review-revise pipeline and a distinctive "Precision Vector Lab" frontend studio.

---

## 1. Architecture Overview

TypeScript monorepo with pnpm workspaces. Three shared packages (`shared`, `svg-core`, `ai-core`) consumed by two applications (`api`, `web`).

**Backend:** Fastify + TypeScript, service-oriented orchestration designed for future LangGraph migration.  
**Frontend:** React + Vite + TypeScript, Tailwind CSS, TanStack Query, Zustand, Monaco Editor.  
**Database:** PostgreSQL via Prisma (SQLite acceptable for MVP).  
**Storage:** Local filesystem with abstraction layer for future S3/R2.  
**AI:** OpenAI GPT-4o/4.5 for LLM tasks, vision-capable model for evaluation. Abstracted provider interfaces for swapability.

---

## 2. Monorepo Structure

```
├── apps/
│   ├── api/          → Fastify backend
│   └── web/          → React frontend
├── packages/
│   ├── shared/       → Types, Zod schemas, constants, API contracts
│   ├── svg-core/     → SVG validation, sanitization, optimization, rendering, transforms
│   └── ai-core/      → LLM/Vision provider interfaces, prompt templates, JSON repair
├── prisma/
│   └── schema.prisma
├── storage/
│   ├── assets/
│   └── packs/
├── package.json
├── pnpm-workspace.yaml
├── turbo.json
└── .env.example
```

**Path aliases:**
- `@svg-builder/shared`
- `@svg-builder/svg-core`
- `@svg-builder/ai-core`

---

## 3. Backend Pipeline

### 3.1 Single Asset Pipeline

```
User prompt
→ AssetTypeClassifierService
→ ReferenceAnalyzerService (if reference image)
→ CreativeBriefBuilderService
→ StyleSystemBuilderService
→ AssetPlanningService
→ LayoutPlannerService
→ SvgCoderService
→ SvgValidationService
→ SvgRenderService
→ AssetTypeEvaluatorService
→ RevisionPlannerService
→ [Layout/Transform/Layer/Full correction]
→ (loop until quality threshold or max iterations)
→ SvgSanitizerService
→ SvgOptimizerService
→ StorageService
→ Export SVG + PNG preview + metadata
```

### 3.2 Pack Pipeline

```
User prompt
→ AssetTypeClassifierService
→ PackPlannerService
→ Shared StyleSystemBuilderService
→ Generate each asset via single-asset pipeline (shared style system)
→ Evaluate each individually
→ PackConsistencyEvaluatorService
→ Revise outliers
→ Optimize all
→ ZIP export
```

### 3.3 Iteration Strategy

- **Positioning issue:** `layer_transform` (apply SVG transform to existing group)
- **Composition/crop issue:** `layout_update` (update layout blueprint, regenerate affected layers)
- **Shape issue:** `layer_regenerate` (regenerate only affected layer group)
- **Severe failure:** `full_regenerate` (restart from updated layout)

Default `maxIterations`: 4. User configurable 1–8.

---

## 4. Data Models

### 4.1 Prisma Schema

**Asset:**
- id, packId (nullable), name (nullable), prompt, assetType, mode, style, status
- width, height, referenceImageUrl (nullable)
- finalSvgPath, finalPngPath, finalDebugPngPath (nullable)
- currentIteration, finalScores (JSON)
- createdAt, updatedAt

**AssetPack:**
- id, prompt, assetType, quantity, style, status
- styleSystem (JSON), consistencyScores (JSON nullable)
- zipPath (nullable), createdAt, updatedAt

**AssetIteration:**
- id, assetId, iterationNumber
- brief (JSON), styleSystem (JSON), referenceAnalysis (JSON nullable)
- layout (JSON), svgDraftPath, pngPreviewPath, debugPreviewPath (nullable)
- scores (JSON), issues (JSON), actionTaken (JSON), createdAt

---

## 5. API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | /api/assets/svg/build | Generate single SVG asset |
| POST | /api/assets/svg-pack/build | Generate SVG pack |
| POST | /api/assets/svg/iterate | Manual refinement |
| POST | /api/assets/svg/render | Render SVG → PNG |
| POST | /api/assets/svg/optimize | Optimize SVG via SVGO |
| GET | /api/assets/:assetId | Get asset details |
| GET | /api/packs/:packId | Get pack details |

---

## 6. Frontend Design

### 6.1 Concept: "Precision Vector Lab"

A premium technical design instrument — part vector editor, part AI orchestration console, part engineering control room. The pipeline is visible and tangible, not hidden behind a chat interface.

### 6.2 Layout

**Desktop (3-column):**
- **Left:** Command panel (prompt, settings, controls)
- **Center:** Large preview workspace (canvas, toolbar, debug toggles)
- **Right:** Inspector (scores, JSON contracts, SVG code, iteration logs)

**Mobile:** Collapsible panels, stacked layout.

### 6.3 Typography

- **Display/Headings:** Sora (Google Fonts)
- **Body/UI:** IBM Plex Sans
- **Code/Metadata:** IBM Plex Mono

### 6.4 Color Tokens

```css
--bg: #f4f1ea;
--surface: #fffdf7;
--surface-2: #eef3f8;
--ink: #07111f;
--muted: #647083;
--line: #cbd5e1;
--blueprint: #1457d9;
--cyan: #00a8c8;
--green: #2f9e44;
--amber: #d89400;
--red: #d64545;
--shadow-soft: 0 20px 60px rgba(7, 17, 31, 0.08);
--radius-panel: 24px;
--radius-control: 14px;
```

### 6.5 Pages

1. **Asset Builder** (`/`, `/assets/new`) — Single asset generation
2. **Pack Builder** (`/packs/new`) — Pack generation
3. **Asset Detail** (`/assets/:assetId`) — Full history and metadata
4. **Pack Detail** (`/packs/:packId`) — Pack overview and grid

### 6.6 Key UI Components

- `PipelineRail` — Animated pipeline stage progression
- `PreviewCanvas` — SVG/PNG preview with coordinate ticks, debug overlay
- `ScoresCard` — Asset-type-specific score meters
- `JsonInspector` — Collapsible JSON panels (brief, style, layout)
- `SvgCodeEditor` — Monaco Editor for SVG code
- `AssetGrid` — Pack asset cards with outlier badges
- `PackConsistencyPanel` — Consistency inspection report

### 6.7 Motion

- Page load: staggered reveal
- Pipeline: animated progression along rail
- Preview changes: crossfade/scale
- Score changes: number transition
- Errors: controlled shake or red pulse
- Asset cards: staggered reveal

---

## 7. Services Reference

### 7.1 Core Services

| Service | Responsibility |
|---------|---------------|
| AssetTypeClassifierService | Classify prompt into asset type |
| CreativeBriefBuilderService | Generate creative brief JSON |
| StyleSystemBuilderService | Generate style system JSON |
| ReferenceAnalyzerService | Analyze reference image composition |
| AssetPlanningService | Route to asset-type-specific planner |
| PackPlannerService | Create pack plan with per-asset specs |
| LayoutPlannerService | Generate layout blueprint with normalized coords |
| SvgCoderService | Generate SVG markup from brief/style/layout |
| SvgValidationService | XML parse, safety check, sanitize |
| SvgRenderService | SVG → PNG via resvg/sharp |
| AssetTypeEvaluatorService | Score preview against asset-type criteria |
| PackConsistencyEvaluatorService | Check pack-wide consistency |
| RevisionPlannerService | Decide correction strategy |
| SvgOptimizerService | SVGO optimization |
| StorageService | Local filesystem (abstracted for S3) |
| DebugOverlayService | Generate debug overlay PNG/SVG |
| ZipExportService | ZIP pack export |

### 7.2 Providers

| Provider | Responsibility |
|----------|---------------|
| LlmProvider | Abstract LLM interface |
| OpenAiProvider | OpenAI GPT implementation |
| VisionProvider | Abstract vision evaluation |
| ExternalVectorGeneratorProvider | Future external generator interface |

---

## 8. Schemas & Contracts

All runtime validation uses Zod. Key schemas:

- `AssetTypeClassification`
- `CreativeBrief`
- `StyleSystem`
- `ReferenceAnalysis`
- `LayoutBlueprint`
- `PackPlan`
- `EvaluationScores`
- `EvaluationIssue`
- `RevisionPlan`

Full schema definitions reside in `packages/shared/src/schemas/`.

---

## 9. Security Requirements

- Never serve unsanitized SVG
- Block: `<script>`, `<foreignObject>`, `<iframe>`, event handlers, external URLs
- Allowlist-based element/attribute filtering
- Raw drafts stored separately; only sanitized SVG exposed publicly
- Correct `Content-Type` on SVG serving

---

## 10. Quality Thresholds

Asset-type-specific score thresholds for iteration stop:

- **icon:** readabilitySmallSize 88, gridAlignment 85, metaphorClarity 80, styleConsistency 85, technicalValidity 100
- **logo:** brandFit 80, geometricBalance 88, monochromeReadability 88, smallSizeReadability 85, technicalValidity 100
- **illustration:** composition 85, styleMatch 80, visualHierarchy 80, proportion 80, technicalValidity 100
- **pattern:** seamlessness 85, motifBalance 80, densityControl 80, styleConsistency 85, technicalValidity 100
- **pack:** styleConsistencyAcrossPack 85, strokeConsistency 90, paletteConsistency 90, gridConsistency 85, technicalValidity 100

---

## 11. Implementation Phases

1. **Phase 1:** Monorepo foundation, shared packages, Prisma, storage abstraction
2. **Phase 2:** Backend core services (validation, render, optimize, providers, prompts)
3. **Phase 3:** Single asset pipeline end-to-end (orchestrator, routes, controllers)
4. **Phase 4:** Pack pipeline end-to-end (planner, consistency, ZIP, routes)
5. **Phase 5:** Frontend studio foundation (shell, asset builder, preview, inspector)
6. **Phase 6:** Pack builder UI, detail pages, polish, responsive, debug overlays

---

## 12. Testing & Seeding

**Seed prompts:**
- Single icon: "Create a rounded duotone SVG icon for a boarding house payment feature..."
- Icon pack: "Create a 12-piece icon pack for a boarding house bookkeeping app..."
- Logo: "Create a modern SVG monogram logo for Ratmo.co using only the letter R..."
- Empty state: "Create a playful SVG empty state illustration for a dashboard..."
- Pattern: "Create a seamless SVG background pattern for a playful fintech app..."
- Portrait: "Create a half-cropped smiling woman portrait in playful flat editorial vector style..."

**Acceptance criteria:**
- End-to-end single asset generation works via API and UI
- End-to-end pack generation works via API and UI
- Pipeline stages are visible in UI
- Scores, JSON contracts, SVG code, and iterations are inspectable
- Downloads work for SVG, PNG, and ZIP
- UI has distinctive "Precision Vector Lab" aesthetic
