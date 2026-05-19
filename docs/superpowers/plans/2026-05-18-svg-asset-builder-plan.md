# AI SVG Asset Builder - Implementation Plan

**Goal:** Build the complete AI SVG Asset Builder MVP monorepo: backend pipeline, frontend studio, shared packages, and all services.

**Architecture:** TypeScript monorepo (pnpm workspaces) with Fastify backend, React+Vite frontend, shared Zod schemas, svg-core utilities, and ai-core provider abstractions.

**Tech Stack:** TypeScript, Fastify, React, Vite, Tailwind CSS, shadcn/ui primitives, TanStack Query, Zustand, Monaco Editor, Prisma, SQLite, SVGO, resvg, Zod, pnpm, Turbo.

---

## Phase 1: Monorepo Foundation

### Task 1.1: Root Monorepo Configuration

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `turbo.json`
- Create: `.env.example`
- Create: `tsconfig.base.json`

**Steps:**
1. Create root `package.json` with workspace scripts, turbo, prettier, typescript
2. Create `pnpm-workspace.yaml` pointing to apps/* and packages/*
3. Create `turbo.json` with build, dev, typecheck, lint pipeline
4. Create `.env.example` with OPENAI_API_KEY, DATABASE_URL, STORAGE_DRIVER, API_PORT, VITE_API_BASE_URL
5. Create `tsconfig.base.json` with ES2022, NodeNext, strict, composite

---

### Task 1.2: Prisma Schema

**Files:**
- Create: `prisma/schema.prisma`

**Steps:**
1. Create Prisma schema with:
   - `Asset` model: id, packId, name, prompt, assetType, mode, style, status, width, height, referenceImageUrl, finalSvgPath, finalPngPath, finalDebugPngPath, currentIteration, finalScores JSON, createdAt, updatedAt
   - `AssetPack` model: id, prompt, assetType, quantity, style, status, styleSystem JSON, consistencyScores JSON, zipPath, createdAt, updatedAt
   - `AssetIteration` model: id, assetId, iterationNumber, brief JSON, styleSystem JSON, referenceAnalysis JSON, layout JSON, svgDraftPath, pngPreviewPath, debugPreviewPath, scores JSON, issues JSON, actionTaken JSON, createdAt
   - Relations: Asset.pack -> AssetPack, Asset.iterations -> AssetIteration, AssetIteration.asset -> Asset

---

### Task 1.3: packages/shared

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/index.ts`
- Create: `packages/shared/src/constants/assetTypes.ts`
- Create: `packages/shared/src/constants/pipelineStages.ts`
- Create: `packages/shared/src/constants/qualityThresholds.ts`
- Create: `packages/shared/src/schemas/assetType.schema.ts`
- Create: `packages/shared/src/schemas/brief.schema.ts`
- Create: `packages/shared/src/schemas/styleSystem.schema.ts`
- Create: `packages/shared/src/schemas/layout.schema.ts`
- Create: `packages/shared/src/schemas/evaluation.schema.ts`
- Create: `packages/shared/src/schemas/revision.schema.ts`
- Create: `packages/shared/src/schemas/asset.schema.ts`
- Create: `packages/shared/src/schemas/pack.schema.ts`

**Steps:**
1. Create package.json with zod dependency, type: module, build scripts
2. Create tsconfig.json extending base
3. Create `assetTypes.ts` with ASSET_TYPES array and AssetType union
4. Create `pipelineStages.ts` with PIPELINE_STAGES array
5. Create `qualityThresholds.ts` with thresholds for icon, icon_pack, logo, illustration, pattern
6. Create Zod schemas:
   - `AssetTypeClassificationSchema`: assetType, quantity, useCase, requiresConsistency, requiresSmallSizeReadability, requiresTileability, requiresBrandOriginality, requiresReferenceMatching
   - `CreativeBriefSchema`: assetType, style (category, texture, lineQuality, palette, mood), composition (canvas, subject, negativeSpace, mainFocus), constraints
   - `StyleSystemSchema`: name, palette (background, primary, secondary, accent, muted), stroke (enabled, width, cap, join), shapeLanguage (cornerRadius, geometry, asymmetry, detailLevel), effects (shadow, texture, gradient), constraints
   - `LayoutBlueprintSchema`: canvas (width, height, viewBox), assetType, normalizedCoordinateSystem, composition, layers array (id, type, bounds, pixelBounds, anchor)
   - `EvaluationIssueSchema`: severity, type, target, problem, suggestedFix
   - `EvaluationResultSchema`: scores, issues, continueIteration
   - `RevisionPlanSchema`: strategy (layout_update, layer_transform, layer_regenerate, full_regenerate), updatedLayout, layerTransforms, layersToRegenerate, notes
   - `BuildSvgAssetRequestSchema`: prompt, assetType, mode, style, output (formats, width, height), referenceImageUrl, maxIterations
   - `BuildSvgPackRequestSchema`: prompt, assetType, quantity, style, output (width, height, formats), items, maxIterations
   - `IterateSvgAssetRequestSchema`: assetId, instruction
   - `RenderSvgRequestSchema`: svg, width, height
   - `OptimizeSvgRequestSchema`: svg
7. Create barrel export `index.ts`
8. Install deps and build

---

### Task 1.4: packages/svg-core

**Files:**
- Create: `packages/svg-core/package.json`
- Create: `packages/svg-core/tsconfig.json`
- Create: `packages/svg-core/src/index.ts`
- Create: `packages/svg-core/src/validateSvg.ts`
- Create: `packages/svg-core/src/sanitizeSvg.ts`
- Create: `packages/svg-core/src/optimizeSvg.ts`
- Create: `packages/svg-core/src/renderSvg.ts`
- Create: `packages/svg-core/src/coordinateTransform.ts`
- Create: `packages/svg-core/src/svgLayerTransform.ts`
- Create: `packages/svg-core/src/debugOverlay.ts`

**Steps:**
1. Create package.json with svgo and resvg-js dependencies
2. Create tsconfig.json
3. Create `validateSvg.ts`: Parse XML, check root is svg, check viewBox exists, check allowed elements only (svg, g, path, rect, circle, ellipse, line, polyline, polygon, defs, linearGradient, radialGradient, stop, clipPath, mask, filter, feTurbulence, feColorMatrix, feBlend, feGaussianBlur, feOffset), block disallowed elements (script, foreignObject, iframe, image, style, link, object, embed), block event handlers (onload, onclick, etc.), block external URLs, return valid/sanitizedSvg/errors/warnings
4. Create `sanitizeSvg.ts`: Strip disallowed elements/attributes, ensure safe SVG only
5. Create `optimizeSvg.ts`: SVGO wrapper with multipass, preset-default, preserve group IDs, removeDimensions if viewBox exists, return optimizedSvg/sizeBefore/sizeAfter
6. Create `renderSvg.ts`: Use resvg-js to render SVG string to PNG buffer, accept width/height
7. Create `coordinateTransform.ts`: Convert normalized 0-100 bounds to pixel bounds, support anchor-based positioning
8. Create `svgLayerTransform.ts`: Apply transform to specific g id, combine with existing transforms carefully
9. Create `debugOverlay.ts`: Generate debug SVG overlay with bounding boxes, layer IDs, landmarks, safe area lines, grid lines
10. Create barrel export

---

### Task 1.5: packages/ai-core

**Files:**
- Create: `packages/ai-core/package.json`
- Create: `packages/ai-core/tsconfig.json`
- Create: `packages/ai-core/src/index.ts`
- Create: `packages/ai-core/src/providers/LlmProvider.ts`
- Create: `packages/ai-core/src/providers/OpenAiProvider.ts`
- Create: `packages/ai-core/src/providers/VisionProvider.ts`
- Create: `packages/ai-core/src/providers/ExternalVectorGeneratorProvider.ts`
- Create: `packages/ai-core/src/prompts/assetTypeClassifier.prompt.ts`
- Create: `packages/ai-core/src/prompts/creativeBrief.prompt.ts`
- Create: `packages/ai-core/src/prompts/styleSystem.prompt.ts`
- Create: `packages/ai-core/src/prompts/layoutPlanner.prompt.ts`
- Create: `packages/ai-core/src/prompts/svgCoder.prompt.ts`
- Create: `packages/ai-core/src/prompts/evaluator.prompt.ts`
- Create: `packages/ai-core/src/prompts/revisionPlanner.prompt.ts`
- Create: `packages/ai-core/src/prompts/packPlanner.prompt.ts`
- Create: `packages/ai-core/src/utils/jsonRepair.ts`
- Create: `packages/ai-core/src/utils/structuredOutput.ts`

**Steps:**
1. Create package.json with openai dependency
2. Create tsconfig.json
3. Create `LlmProvider.ts` interface: generateText(systemPrompt, userPrompt, options?) -> string; generateJson(systemPrompt, userPrompt, schema, options?) -> object
4. Create `OpenAiProvider.ts`: Implement LlmProvider using openai package, support gpt-4o
5. Create `VisionProvider.ts` interface: evaluateImage(imageBase64, prompt) -> string
6. Create `ExternalVectorGeneratorProvider.ts` interface: generateVectorAsset(prompt, styleSystem, assetType, outputSize) -> string (future placeholder)
7. Create all prompt template files with exact system and user prompts as specified in design
8. Create `jsonRepair.ts`: Attempt to fix common JSON errors from LLM (missing quotes, trailing commas, etc.)
9. Create `structuredOutput.ts`: Wrapper around LlmProvider that validates output against Zod schema, retries once on failure
10. Create barrel export

---

### Task 1.6: apps/api Foundation

**Files:**
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/app.ts`
- Create: `apps/api/src/server.ts`
- Create: `apps/api/src/utils/id.ts`
- Create: `apps/api/src/utils/logger.ts`

**Steps:**
1. Create package.json with fastify, @fastify/cors, prisma, @svg-builder/shared, @svg-builder/svg-core, @svg-builder/ai-core dependencies
2. Create tsconfig.json with path aliases to packages
3. Create `app.ts`: Fastify instance, register CORS, healthcheck route, error handler
4. Create `server.ts`: Read PORT from env, start Fastify, connect Prisma
5. Create `id.ts`: Generate IDs using cuid or nanoid
6. Create `logger.ts`: Simple pino-based logger

---

### Task 1.7: apps/web Foundation

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/tsconfig.node.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/styles/globals.css`
- Create: `apps/web/src/styles/tokens.css`

**Steps:**
1. Create package.json with react, react-dom, react-router-dom, @tanstack/react-query, zustand, tailwindcss, monaco-editor, framer-motion, axios, @svg-builder/shared
2. Create tsconfig.json and tsconfig.node.json
3. Create `vite.config.ts` with path aliases and @svg-builder/shared resolve
4. Create `index.html` with Google Fonts (Sora, IBM Plex Sans, IBM Plex Mono)
5. Create `tokens.css` with CSS custom properties (bg, surface, ink, muted, line, blueprint, cyan, green, amber, red, fonts, shadows, radii)
6. Create `globals.css` importing tokens, Tailwind directives, base styles
7. Create `main.tsx`: React 18 createRoot, QueryClientProvider, RouterProvider
8. Create `App.tsx`: Router setup with routes

---

## Phase 2: Backend Core Services

### Task 2.1: Storage Service
**Files:** `apps/api/src/services/StorageService.ts`
**Steps:**
1. Implement StorageService with local filesystem driver
2. Methods: saveAssetFile(assetId, filename, data), savePackFile(packId, filename, data), getAssetFilePath(assetId, filename), getPackFilePath(packId, filename), ensureDir(path)
3. Abstract interface for future S3/R2 swap

### Task 2.2: SVG Validation Service
**Files:** `apps/api/src/services/SvgValidationService.ts`
**Steps:**
1. Implement using @svg-builder/svg-core validateSvg
2. Parse XML, check root svg, check viewBox, check allowed elements, block scripts/foreignObject/event handlers/external URLs
3. Return validation result with errors/warnings

### Task 2.3: SVG Render Service
**Files:** `apps/api/src/services/SvgRenderService.ts`
**Steps:**
1. Implement using @svg-builder/svg-core renderSvg
2. Accept SVG string + width/height, return PNG buffer
3. Save to storage, return public URL path

### Task 2.4: SVG Optimizer Service
**Files:** `apps/api/src/services/SvgOptimizerService.ts`
**Steps:**
1. Implement using @svg-builder/svg-core optimizeSvg
2. SVGO with multipass, preserve group IDs, remove dimensions if viewBox exists
3. Return optimizedSvg, sizeBeforeBytes, sizeAfterBytes

### Task 2.5: Debug Overlay Service
**Files:** `apps/api/src/services/DebugOverlayService.ts`
**Steps:**
1. Generate debug overlay SVG with layer bounding boxes, IDs, landmarks, safe areas, grids
2. Composite with rendered preview
3. Return debug PNG path

---

## Phase 3: Single Asset Pipeline

### Task 3.1: Asset Type Classifier Service
**Files:** `apps/api/src/services/AssetTypeClassifierService.ts`
**Steps:**
1. Input: prompt, explicit assetType, quantity, output size, use case, reference exists
2. Use LLM with assetTypeClassifier prompt template
3. Validate output against AssetTypeClassificationSchema
4. Return classification JSON

### Task 3.2: Creative Brief Builder Service
**Files:** `apps/api/src/services/CreativeBriefBuilderService.ts`
**Steps:**
1. Input: prompt, classification, style, output size, reference analysis
2. Use LLM with creativeBrief prompt template
3. Validate against CreativeBriefSchema
4. Return brief JSON

### Task 3.3: Style System Builder Service
**Files:** `apps/api/src/services/StyleSystemBuilderService.ts`
**Steps:**
1. Input: brief, classification, pack plan
2. Use LLM with styleSystem prompt template
3. Validate against StyleSystemSchema
4. For packs, ensure style system is shared across all assets
5. Return style system JSON

### Task 3.4: Reference Analyzer Service
**Files:** `apps/api/src/services/ReferenceAnalyzerService.ts`
**Steps:**
1. Input: reference image (URL or base64)
2. Use VisionProvider to analyze composition, crop, bounds, landmarks, palette, style
3. Validate against ReferenceAnalysisSchema
4. Return analysis JSON

### Task 3.5: Asset Planning Service
**Files:** `apps/api/src/services/AssetPlanningService.ts`
**Steps:**
1. Route to asset-type-specific planner
2. Icon planner: prioritize grid, padding, metaphor clarity, small-size readability
3. Logo planner: prioritize balance, negative space, uniqueness, monochrome readability
4. Illustration planner: prioritize composition, hierarchy, mood, proportion
5. Pattern planner: prioritize tileability, seamless edges, density, motif rhythm
6. Return planning strategy JSON

### Task 3.6: Layout Planner Service
**Files:** `apps/api/src/services/LayoutPlannerService.ts`
**Steps:**
1. Input: brief, style system, reference analysis, output width/height, asset type
2. Use LLM with layoutPlanner prompt template
3. Generate layout with normalized 0-100 coordinates and pixel bounds
4. Define layer order, stable layer IDs, anchors, composition rules
5. Validate against LayoutBlueprintSchema
6. Return layout blueprint JSON

### Task 3.7: SVG Coder Service
**Files:** `apps/api/src/services/SvgCoderService.ts`
**Steps:**
1. Input: brief, style system, layout blueprint, previous SVG, revision instruction
2. Use LLM with svgCoder prompt template
3. Output SVG markup only, no markdown fences
4. Must use exact viewBox, respect layer bounds, stable group IDs
5. Allowed elements only, no scripts/foreignObject/external assets
6. Return raw SVG string

### Task 3.8: Asset Type Evaluator Service
**Files:** `apps/api/src/services/AssetTypeEvaluatorService.ts`
**Steps:**
1. Input: asset type, brief, style system, layout, PNG preview, reference image
2. Use VisionProvider with evaluator prompt template
3. Asset-type-specific scoring (icon: readability, grid, metaphor, style, technical; logo: brandFit, balance, uniqueness, monochrome, smallSize; illustration: composition, styleMatch, hierarchy, proportion; pattern: seamlessness, motifBalance, density, style)
4. Validate against EvaluationResultSchema
5. Return scores, issues, continueIteration

### Task 3.9: Revision Planner Service
**Files:** `apps/api/src/services/RevisionPlannerService.ts`
**Steps:**
1. Input: layout, SVG, evaluation issues, current iteration, asset type
2. Use LLM with revisionPlanner prompt template
3. Decide strategy: layout_update, layer_transform, layer_regenerate, full_regenerate
4. Provide updatedLayout, layerTransforms, layersToRegenerate, notes
5. Validate against RevisionPlanSchema
6. Return revision plan

### Task 3.10: SVG Build Orchestrator
**Files:** `apps/api/src/orchestrators/SvgBuildOrchestrator.ts`
**Steps:**
1. Orchestrate full single-asset flow:
   - classify -> analyze reference -> build brief -> build style -> plan layout -> code SVG -> validate -> render -> evaluate -> revise (loop) -> sanitize -> optimize -> store
2. Manage iteration loop with quality thresholds
3. Stop conditions: quality thresholds pass, technicalValidity == 100, iteration >= maxIterations
4. Save each iteration metadata to database
5. Return final asset with URLs, scores, iterations

### Task 3.11: Asset API Routes & Controllers
**Files:**
- `apps/api/src/routes/svgAssets.routes.ts`
- `apps/api/src/controllers/svgAssets.controller.ts`
**Steps:**
1. Create controller with methods: build, iterate, render, optimize, getById
2. Create routes:
   - POST /api/assets/svg/build -> build controller
   - POST /api/assets/svg/iterate -> iterate controller
   - POST /api/assets/svg/render -> render controller
   - POST /api/assets/svg/optimize -> optimize controller
   - GET /api/assets/:assetId -> getById controller
3. Register routes in app.ts
4. Validate requests with Zod schemas from @svg-builder/shared

---

## Phase 4: Pack Pipeline

### Task 4.1: Pack Planner Service
**Files:** `apps/api/src/services/PackPlannerService.ts`
**Steps:**
1. Input: prompt, asset type, quantity, items, style
2. Use LLM with packPlanner prompt template
3. Create pack plan with asset names, prompts, metaphors, required/avoid elements, layout hints
4. Validate against PackPlanSchema
5. Return pack plan JSON

### Task 4.2: Pack Consistency Evaluator Service
**Files:** `apps/api/src/services/PackConsistencyEvaluatorService.ts`
**Steps:**
1. Input: pack plan, style system, generated assets, individual scores
2. Check stroke consistency, palette consistency, grid consistency, detail consistency, metaphor diversity
3. Identify outliers with problems and suggested fixes
4. Return consistency scores and outlier list

### Task 4.3: Zip Export Service
**Files:** `apps/api/src/services/ZipExportService.ts`
**Steps:**
1. Collect all final SVGs and PNGs for a pack
2. Generate ZIP archive with folder structure
3. Save to storage, return zip path

### Task 4.4: SVG Pack Build Orchestrator
**Files:** `apps/api/src/orchestrators/SvgPackBuildOrchestrator.ts`
**Steps:**
1. Orchestrate pack flow:
   - classify -> plan pack -> build shared style -> generate each asset (using shared style) -> evaluate each -> evaluate consistency -> revise outliers -> optimize all -> export ZIP
2. Generate assets in parallel where possible
3. Save pack metadata and individual asset records
4. Return pack with assets, consistency scores, zip URL

### Task 4.5: Pack API Routes & Controllers
**Files:**
- `apps/api/src/routes/svgPacks.routes.ts`
- `apps/api/src/controllers/svgPacks.controller.ts`
**Steps:**
1. Create controller with methods: build, getById
2. Create routes:
   - POST /api/assets/svg-pack/build -> build controller
   - GET /api/packs/:packId -> getById controller
3. Register routes in app.ts

---

## Phase 5: Frontend Studio

### Task 5.1: App Shell & Layout
**Files:**
- `apps/web/src/components/layout/AppShell.tsx`
- `apps/web/src/components/layout/TopBar.tsx`
- `apps/web/src/components/layout/StudioFrame.tsx`
**Steps:**
1. Create AppShell with 3-column desktop layout (left command panel, center preview, right inspector)
2. Create TopBar with "VectorLab" branding, navigation links (Asset Builder, Pack Builder, Assets, Packs), provider status badge
3. Create StudioFrame wrapper with responsive breakpoints
4. Setup React Router routes in App.tsx

### Task 5.2: API Client & State
**Files:**
- `apps/web/src/lib/api.ts`
- `apps/web/src/lib/queryClient.ts`
- `apps/web/src/lib/formatters.ts`
- `apps/web/src/lib/download.ts`
**Steps:**
1. Create axios-based api client with VITE_API_BASE_URL
2. Create queryClient with default options
3. Create formatters for scores, dates, file sizes
4. Create download helper for SVG/PNG/ZIP files

### Task 5.3: Asset Builder Form
**Files:** `apps/web/src/components/builder/AssetBuilderForm.tsx`
**Steps:**
1. Create form with: prompt textarea, asset type select (auto + all types), mode select (direct/reference/premium), style input, width/height inputs, max iterations input, reference image upload
2. Style as technical command panel with fine borders
3. Hook up to TanStack Query mutation for POST /api/assets/svg/build

### Task 5.4: Preview Workspace
**Files:**
- `apps/web/src/components/builder/PreviewWorkspace.tsx`
- `apps/web/src/components/builder/PreviewCanvas.tsx`
- `apps/web/src/components/builder/PreviewToolbar.tsx`
**Steps:**
1. Create PreviewWorkspace container
2. Create PreviewCanvas: display SVG/PNG, coordinate ticks, viewBox label, floating score badge
3. Create PreviewToolbar: toggle final/debug/raw SVG, zoom controls, background toggle (transparent/white/dark/blueprint), size preview buttons (16px/24px/48px/128px/full)
4. For patterns: show tile repeat preview
5. For reference mode: show split view

### Task 5.5: Pipeline Rail & Status
**Files:**
- `apps/web/src/components/builder/PipelineRail.tsx`
- `apps/web/src/components/builder/PipelineStatus.tsx`
**Steps:**
1. Create PipelineRail: vertical rail with pipeline stages (classify, brief, style, layout, svg, render, evaluate, revise, optimize, export)
2. Animate current stage highlight during generation
3. Completed stages get checkmark, failed get red indicator
4. Create PipelineStatus: show current stage name with spinner

### Task 5.6: Inspector Panels
**Files:**
- `apps/web/src/components/builder/ScoresCard.tsx`
- `apps/web/src/components/builder/QualityGates.tsx`
- `apps/web/src/components/builder/JsonInspector.tsx`
- `apps/web/src/components/builder/SvgCodeEditor.tsx`
- `apps/web/src/components/builder/IterationTimeline.tsx`
- `apps/web/src/components/builder/IssuesPanel.tsx`
- `apps/web/src/components/builder/ExportButtons.tsx`
**Steps:**
1. ScoresCard: asset-type-specific score meters, threshold indicators
2. QualityGates: checklist (valid XML, safe elements, layer IDs, PNG render, thresholds)
3. JsonInspector: collapsible panels for brief, styleSystem, layout, with copy button
4. SvgCodeEditor: Monaco Editor in read-only mode, copy/optimize buttons
5. IterationTimeline: list iterations with preview thumbnails, scores, issues
6. IssuesPanel: list evaluation issues with severity badges and suggested fixes
7. ExportButtons: download SVG, download PNG, copy SVG

### Task 5.7: Asset Builder Page
**Files:** `apps/web/src/routes/AssetBuilderPage.tsx`
**Steps:**
1. Compose AssetBuilderForm (left), PreviewWorkspace (center), Inspector tabs (right)
2. Manage generation state: idle/loading/completed/error
3. Pass pipeline stage updates to PipelineRail
4. Handle iteration refinement via POST /api/assets/svg/iterate

### Task 5.8: Asset Detail Page
**Files:** `apps/web/src/routes/AssetDetailPage.tsx`
**Steps:**
1. Fetch asset by ID using TanStack Query
2. Show final preview, metadata, scores
3. Show full iteration timeline with per-iteration previews
4. Show per-iteration issues and actions taken
5. Download buttons

---

## Phase 6: Pack Builder UI + Polish

### Task 6.1: Pack Builder Form
**Files:** `apps/web/src/components/builder/PackBuilderForm.tsx`
**Steps:**
1. Create form with: prompt textarea, asset type (icon_pack/sticker_pack/illustration_set), quantity input, items editor (textarea for comma-separated or one-per-line), style input, width/height, max iterations
2. Generate pack button

### Task 6.2: Pack Grid & Cards
**Files:**
- `apps/web/src/components/builder/AssetGrid.tsx`
- `apps/web/src/components/builder/AssetCard.tsx`
**Steps:**
1. Create AssetGrid: responsive grid of asset cards
2. Create AssetCard: preview, name, individual score, status badge, download SVG/PNG buttons, refine button
3. Outliers get amber border and "outlier" badge
4. Staggered reveal animation

### Task 6.3: Pack Consistency Panel
**Files:** `apps/web/src/components/builder/PackConsistencyPanel.tsx`
**Steps:**
1. Show consistency strip: style consistency, stroke consistency, palette consistency, grid consistency
2. Show outlier assets list with problems and suggested fixes
3. Show shared style system in collapsible JSON panel

### Task 6.4: Pack Pages
**Files:**
- `apps/web/src/routes/PackBuilderPage.tsx`
- `apps/web/src/routes/PackDetailPage.tsx`
**Steps:**
1. PackBuilderPage: compose PackBuilderForm (left), AssetGrid (center), PackConsistencyPanel (right)
2. PackDetailPage: show pack overview, style system, asset grid, consistency scores, outlier report, download ZIP button

### Task 6.5: Polish & Hardening
**Files:** Various
**Steps:**
1. Add loading states with pipeline stage messages
2. Add error states with failed stage, retry button, partial results
3. Add empty states with CSS/SVG illustration
4. Add responsive refinements for mobile/tablet
5. Add keyboard accessibility
6. Add debug overlay toggle and rendering
7. Review and ensure all API contracts match shared schemas
8. Final security review of SVG serving

---

## Execution Order

Execute tasks in strict phase order. Within each phase, tasks can sometimes run in parallel if they have no dependencies. Key dependencies:
- Task 1.3 (shared) must complete before 1.4 (svg-core) and 1.5 (ai-core)
- Task 1.4 and 1.5 must complete before 1.6 (api)
- Phase 2 services must complete before Phase 3 services
- Phase 3 orchestrator depends on all Phase 2 and 3 services
- Phase 4 orchestrator depends on Phase 3 single-asset pipeline
- Phase 5 frontend depends on shared package and API being ready
- Phase 6 depends on Phase 5

**Estimated total steps:** 80-100 individual steps across all tasks.
