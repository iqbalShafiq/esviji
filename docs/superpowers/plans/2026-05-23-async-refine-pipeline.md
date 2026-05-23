# Async Refine Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make manual refine run as a streamed background pipeline that reuses the existing generate job UI and carries complete previous-generation context into a one-iteration refine flow.

**Architecture:** The API refine endpoint will mirror build job creation: reserve one token, create a `JobService` job, run `SvgBuildOrchestrator.iterate` in the background with the same callback shape used by generate, attach the asset, and complete/fail the job. The orchestrator will expose a focused one-iteration LangGraph refine path seeded from the latest persisted `AssetIteration` context instead of rerunning classify/brief/style/layout. The web app will treat refine as another active job, removing the separate local refine loading path so the canvas, pipeline rail, and inspector sidebar all use the same job state as generation.

**Tech Stack:** TypeScript, Fastify, Prisma, LangGraph (`@langchain/langgraph`), React, TanStack Query, SSE/EventSource, Node test runner.

---

## File Structure

- Modify: `apps/api/src/orchestrators/SvgBuildOrchestrator.ts`
  - Add reusable callback option types for build/refine.
  - Extend `iterate` to accept generation callbacks.
  - Replace the synchronous refine body with a one-iteration LangGraph refine flow that uses latest DB iteration context.
  - Preserve existing ownership/status checks and token charging expectations.
- Modify: `apps/api/src/controllers/svgAssets.controller.ts`
  - Change `/api/assets/svg/iterate` to create a job and run refine in the background, matching build controller callback wiring.
  - Return `{ jobId, status, progress }` with HTTP 202 instead of returning the asset snapshot directly.
- Modify: `apps/web/src/lib/api.ts`
  - Change `iterateSvgAsset` return type to `{ jobId: string }` and stop fetching the asset synchronously from this helper.
- Modify: `apps/web/src/routes/AssetBuilderPage.tsx`
  - Reuse `jobId/job/isLoading` for refine, remove separate `isRefining`, and show `PipelineFlowLogs` during refine just like generate.
- Modify: `apps/web/src/routes/AssetDetailPage.tsx`
  - Add job subscription for detail-page refine and reuse generate-style loading props.
  - Replace static inspector content with pipeline logs while refine job is running.
- Modify: `apps/web/src/routes/PackDetailPage.tsx`
  - Update refine handler to consume `{ jobId }`, subscribe existing job stream, and avoid a second refine loading state.
- Modify: `apps/web/src/types/index.ts`
  - Keep existing `JobResponse` unchanged unless TypeScript needs a narrower refine response type.
- Test: `apps/api/test/svg-build-orchestrator-langgraph.test.ts`
  - Add source-level regression checks that refine has a one-iteration LangGraph path and carries previous context fields.
- Test: `apps/api/test/jobs.e2e.test.ts` or `apps/api/test/job-service.test.ts`
  - Add controller/job behavior coverage only if the existing e2e harness can mock/refine quickly; otherwise keep focused unit/source tests to avoid LLM-dependent tests.

## Task 1: Backend Refine Callback Contract

**Files:**
- Modify: `apps/api/src/orchestrators/SvgBuildOrchestrator.ts`
- Test: `apps/api/test/svg-build-orchestrator-langgraph.test.ts`

- [ ] **Step 1: Write failing source tests for refine callback support and context fields**

Add these tests to `apps/api/test/svg-build-orchestrator-langgraph.test.ts`:

```ts
test('SvgBuildOrchestrator manual refine accepts streaming pipeline callbacks', async () => {
  const source = await readFile(new URL('../src/orchestrators/SvgBuildOrchestrator.ts', import.meta.url), 'utf8');

  assert.match(source, /type SvgPipelineCallbacks = \{/);
  assert.match(source, /async iterate\(\s*request: IterateSvgAssetRequest,\s*options\?: SvgIterateOptions/);
  assert.match(source, /onStage\?: \(stage: PipelineStage, message: string, progress: number\) => void/);
  assert.match(source, /onIterationRendered\?: \(iteration: number, previewUrl: string\) => void/);
  assert.match(source, /onToolEvent\?: \(/);
});

test('SvgBuildOrchestrator manual refine builds previous final context from persisted iteration data', async () => {
  const source = await readFile(new URL('../src/orchestrators/SvgBuildOrchestrator.ts', import.meta.url), 'utf8');

  assert.match(source, /buildManualRefineInstruction/);
  assert.match(source, /previousSvg/);
  assert.match(source, /previousPngPreviewPath/);
  assert.match(source, /previousScores/);
  assert.match(source, /previousIssues/);
  assert.match(source, /previousActionTaken/);
  assert.match(source, /finalScores/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=api test -- svg-build-orchestrator-langgraph.test.ts`

Expected: FAIL because `SvgPipelineCallbacks`, `SvgIterateOptions`, and `buildManualRefineInstruction` do not exist yet.

- [ ] **Step 3: Add reusable callback option types**

In `apps/api/src/orchestrators/SvgBuildOrchestrator.ts`, add these types after `calculateBuildGraphRecursionLimit`:

```ts
type SvgPipelineCallbacks = {
  onStage?: (stage: PipelineStage, message: string, progress: number) => void;
  onIterationRendered?: (iteration: number, previewUrl: string) => void;
  onLlmToken?: (stage: PipelineStage, token: string) => void;
  onReasoning?: (stage: PipelineStage, message: string) => void;
  onToolEvent?: (
    stage: PipelineStage,
    event: { name: string; status: 'requested' | 'running' | 'completed' | 'failed'; message: string }
  ) => void;
};

type SvgBuildOptions = SvgPipelineCallbacks & {
  sharedStyleSystem?: StyleSystem;
  packConsistencyContext?: string;
  packId?: string;
  name?: string;
  ownerId?: string;
  visibility?: string;
};

type SvgIterateOptions = SvgPipelineCallbacks & {
  ownerId?: string;
  isAdmin?: boolean;
};
```

Then update method signatures:

```ts
async build(request: BuildSvgAssetRequest, options?: SvgBuildOptions): Promise<Asset> {
```

```ts
async iterate(request: IterateSvgAssetRequest, options?: SvgIterateOptions): Promise<Asset> {
```

Update `runBuildGraph` to use `SvgBuildOptions | undefined` instead of the inline option type.

- [ ] **Step 4: Run test to verify partial progress**

Run: `pnpm --filter=api test -- svg-build-orchestrator-langgraph.test.ts`

Expected: still FAIL on `buildManualRefineInstruction` and previous context fields.

## Task 2: One-Iteration LangGraph Refine Flow

**Files:**
- Modify: `apps/api/src/orchestrators/SvgBuildOrchestrator.ts`
- Test: `apps/api/test/svg-build-orchestrator-langgraph.test.ts`

- [ ] **Step 1: Write failing source test for one-iteration refine graph shape**

Add this test to `apps/api/test/svg-build-orchestrator-langgraph.test.ts`:

```ts
test('SvgBuildOrchestrator manual refine graph runs one generate/render/evaluate/export pass', async () => {
  const source = await readFile(new URL('../src/orchestrators/SvgBuildOrchestrator.ts', import.meta.url), 'utf8');

  assert.match(source, /private async runManualRefineGraph/);
  assert.match(source, /runName: 'svg_asset_refine_pipeline'/);
  assert.match(source, /\.addEdge\(START, 'generate_svg'\)/);
  assert.match(source, /\.addEdge\('generate_svg', 'render_preview'\)/);
  assert.match(source, /\.addEdge\('render_preview', 'evaluate'\)/);
  assert.match(source, /\.addEdge\('evaluate', 'optimize_export'\)/);
  assert.doesNotMatch(source, /svg_asset_refine_pipeline[\s\S]*\.addEdge\('evaluate', 'revise'\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=api test -- svg-build-orchestrator-langgraph.test.ts`

Expected: FAIL because `runManualRefineGraph` does not exist yet.

- [ ] **Step 3: Replace the body of successful manual refine with `runManualRefineGraph`**

In `iterate`, after loading and validating `latestIteration`, keep the ownership/status checks, then replace the current generation/render/evaluate/save block with:

```ts
const updatedAsset = await this.runManualRefineGraph(asset, latestIteration, request, options);

logger.info({ assetId: asset.id }, 'Manual iteration completed');
return updatedAsset;
```

Keep the existing `try/catch` and status update to `processing` before calling `runManualRefineGraph`.

- [ ] **Step 4: Add the helper types inside `iterate` support area**

Add this type near the other private helper types in `SvgBuildOrchestrator.ts`:

```ts
type PersistedIterationContext = {
  iterationNumber: number;
  brief: Prisma.JsonValue;
  styleSystem: Prisma.JsonValue;
  referenceAnalysis: Prisma.JsonValue | null;
  layout: Prisma.JsonValue;
  svgDraftPath: string | null;
  pngPreviewPath: string | null;
  debugPreviewPath: string | null;
  scores: Prisma.JsonValue | null;
  issues: Prisma.JsonValue | null;
  actionTaken: Prisma.JsonValue | null;
};
```

If TypeScript rejects top-level `Prisma.JsonValue` for included model fields, narrow later to `Asset['iterations'][number]` is not available; use the explicit type above and cast the `latestIteration` argument at call-site.

- [ ] **Step 5: Add `buildManualRefineInstruction`**

Add this helper near `appendPackContext`/other private helpers at the bottom of `SvgBuildOrchestrator.ts`:

```ts
function buildManualRefineInstruction(input: {
  instruction: string;
  previousSvg: string;
  previousPngPreviewPath?: string | null;
  previousDebugPreviewPath?: string | null;
  previousScores?: unknown;
  previousIssues?: unknown;
  previousActionTaken?: unknown;
  finalSvgPath?: string | null;
  finalPngPath?: string | null;
  finalScores?: unknown;
}): string {
  return [
    'Manual refine request. Run exactly one high-quality refine pass using the previous final asset context.',
    `User instruction: ${input.instruction}`,
    'Previous final context:',
    `- Previous SVG source length: ${input.previousSvg.length} characters`,
    `- Previous PNG preview: ${input.previousPngPreviewPath ?? input.finalPngPath ?? 'not available'}`,
    `- Previous debug preview: ${input.previousDebugPreviewPath ?? 'not available'}`,
    `- Previous scores: ${safeJsonForPrompt(input.previousScores ?? input.finalScores ?? null)}`,
    `- Previous unresolved issues: ${safeJsonForPrompt(input.previousIssues ?? [])}`,
    `- Previous action/revision plan: ${safeJsonForPrompt(input.previousActionTaken ?? null)}`,
    `- Final SVG path: ${input.finalSvgPath ?? 'not available'}`,
    'If the user instruction is broad, infer the requested changes from the previous unresolved issues, scores, visual context, and SVG source. Preserve working parts unless the issues require replacing them.',
  ].join('\n');
}

function safeJsonForPrompt(value: unknown): string {
  try {
    return JSON.stringify(value ?? null).slice(0, 4000);
  } catch {
    return 'null';
  }
}
```

- [ ] **Step 6: Add `runManualRefineGraph` with one-pass nodes**

Add this private method before `retryProgressForStage`:

```ts
private async runManualRefineGraph(
  asset: Asset,
  latestIteration: PersistedIterationContext,
  request: IterateSvgAssetRequest,
  options?: SvgIterateOptions
): Promise<Asset> {
  type ValidationSummary = { valid: boolean; errors: string[]; warnings: string[] };
  const newIterationNumber = asset.currentIteration + 1;
  const brief = latestIteration.brief as unknown as CreativeBrief;
  const styleSystem = latestIteration.styleSystem as unknown as StyleSystem;
  const layout = latestIteration.layout as unknown as LayoutBlueprint;
  const previousSvg = latestIteration.svgDraftPath ?? '';
  const referenceAnalysis = latestIteration.referenceAnalysis ?? undefined;

  const RefineState = Annotation.Root({
    currentSvg: Annotation<string>(),
    lastValidationSummary: Annotation<ValidationSummary | undefined>(),
    pngPath: Annotation<string | undefined>(),
    pngUrl: Annotation<string | undefined>(),
    debugPngPath: Annotation<string | undefined>(),
    evaluation: Annotation<EvaluationResult | undefined>(),
    finalAsset: Annotation<Asset | undefined>(),
  });

  type RefineStateValue = typeof RefineState.State;
  const requireState = <T>(value: T | undefined, name: string): T => {
    if (value === undefined || value === null) {
      throw new Error(`LangGraph refine state missing required field: ${name}`);
    }
    return value;
  };

  const classification: AssetTypeClassification = {
    assetType: asset.assetType,
    quantity: 1,
    useCase: 'general',
    requiresConsistency: Boolean(asset.packId),
    requiresSmallSizeReadability: false,
    requiresTileability: false,
    requiresBrandOriginality: false,
    requiresReferenceMatching: Boolean(asset.referenceImageUrl),
  };

  const refineInstruction = buildManualRefineInstruction({
    instruction: request.instruction,
    previousSvg,
    previousPngPreviewPath: latestIteration.pngPreviewPath,
    previousDebugPreviewPath: latestIteration.debugPreviewPath,
    previousScores: latestIteration.scores,
    previousIssues: latestIteration.issues,
    previousActionTaken: latestIteration.actionTaken,
    finalSvgPath: asset.finalSvgPath,
    finalPngPath: asset.finalPngPath,
    finalScores: asset.finalScores,
  });

  const graph = new StateGraph(RefineState)
    .addNode('generate_svg', async () => {
      options?.onStage?.('svg', `Refining SVG iteration ${newIterationNumber}`, 50);
      const initialSvg = await this.svgCoder.code(brief, styleSystem, layout, {
        previousSvg,
        revisionInstruction: refineInstruction,
        onToken: (token) => options?.onLlmToken?.('svg', token),
        onReasoning: (token) => options?.onReasoning?.('svg', token),
      });
      const generated = await this.svgGenerationWorkflow.run({
        brief,
        styleSystem,
        layout,
        width: asset.width,
        height: asset.height,
        initialSvg,
        revisionInstruction: refineInstruction,
        onToken: (token) => options?.onLlmToken?.('svg', token),
        onReasoning: (token) => options?.onReasoning?.('svg', token),
        onToolEvent: (message) => {
          const toolEvent = parseRepairToolEvent(message);
          if (toolEvent) options?.onToolEvent?.('svg', toolEvent);
          options?.onStage?.('svg', message, 52);
        },
      });
      options?.onStage?.('svg', `Refined SVG ready (${Math.round(generated.svg.length / 1024)} KB)`, 56);
      return { currentSvg: generated.svg, lastValidationSummary: generated.validationSummary };
    })
    .addNode('render_preview', async (state: RefineStateValue) => {
      options?.onStage?.('render', `Rendering refined preview iteration ${newIterationNumber}`, 60);
      const { pngPath, pngUrl } = await this.svgRender.render(state.currentSvg, asset.id, newIterationNumber, asset.width, asset.height);
      options?.onIterationRendered?.(newIterationNumber, pngUrl);
      const { debugPngPath } = await this.debugOverlay.generate(layout, state.currentSvg, asset.id, newIterationNumber);
      return { pngPath, pngUrl, debugPngPath };
    })
    .addNode('evaluate', async (state: RefineStateValue) => {
      const pngPath = requireState(state.pngPath, 'pngPath');
      options?.onStage?.('evaluate', `Evaluating refined iteration ${newIterationNumber}`, 70);
      const evaluation = await this.evaluator.evaluate(classification, brief, styleSystem, layout, pngPath, referenceAnalysis, {
        onToken: (token) => options?.onLlmToken?.('evaluate', token),
        onReasoning: (token) => options?.onReasoning?.('evaluate', token),
        svgSource: state.currentSvg,
        validationSummary: state.lastValidationSummary,
        previousEvaluationContext: {
          iteration: latestIteration.iterationNumber,
          scores: latestIteration.scores,
          issues: latestIteration.issues,
          revisionPlan: latestIteration.actionTaken,
        },
      });
      options?.onStage?.('evaluate', `Evaluation: ${Object.entries(evaluation.scores).slice(0, 3).map(([k, v]) => `${k}=${v}`).join(', ')}`, 74);
      await prisma.assetIteration.create({
        data: {
          assetId: asset.id,
          iterationNumber: newIterationNumber,
          brief: brief as unknown as Prisma.JsonValue,
          styleSystem: styleSystem as unknown as Prisma.JsonValue,
          referenceAnalysis: latestIteration.referenceAnalysis ?? Prisma.JsonNull,
          layout: layout as unknown as Prisma.JsonValue,
          svgDraftPath: state.currentSvg,
          pngPreviewPath: requireState(state.pngUrl, 'pngUrl'),
          debugPreviewPath: requireState(state.debugPngPath, 'debugPngPath'),
          scores: evaluation.scores as unknown as Prisma.JsonValue,
          issues: evaluation.issues as unknown as Prisma.JsonValue,
          actionTaken: { instruction: request.instruction, context: 'manual_refine' } as unknown as Prisma.JsonValue,
        },
      });
      await prisma.asset.update({ where: { id: asset.id }, data: { currentIteration: newIterationNumber } });
      return { evaluation };
    })
    .addNode('optimize_export', async (state: RefineStateValue) => {
      const evaluation = requireState(state.evaluation, 'evaluation');
      options?.onStage?.('optimize', 'Sanitizing and optimizing refined SVG', 90);
      const sanitizedSvg = sanitizeSvg(state.currentSvg);
      const optimizationResult = await this.svgOptimizer.optimize(sanitizedSvg);
      options?.onStage?.('export', 'Saving refined outputs', 98);
      const finalSvgPath = await this.storage.saveAssetFile(asset.id, 'final.svg', optimizationResult.optimizedSvg);
      const finalSvgUrl = `/${finalSvgPath}`;
      const finalPngUrl = (await this.svgRender.render(optimizationResult.optimizedSvg, asset.id, 999, asset.width, asset.height)).pngUrl;
      const updatedAsset = await prisma.asset.update({
        where: { id: asset.id },
        data: {
          status: 'completed',
          currentIteration: newIterationNumber,
          finalSvgPath: finalSvgUrl,
          finalPngPath: finalPngUrl,
          finalScores: evaluation.scores as unknown as Prisma.JsonValue,
        },
      });
      options?.onStage?.('export', 'Refined outputs saved', 100);
      return { finalAsset: updatedAsset };
    })
    .addEdge(START, 'generate_svg')
    .addEdge('generate_svg', 'render_preview')
    .addEdge('render_preview', 'evaluate')
    .addEdge('evaluate', 'optimize_export')
    .addEdge('optimize_export', END)
    .compile();

  const result = await graph.invoke(
    {
      currentSvg: previousSvg,
      lastValidationSummary: undefined,
      pngPath: undefined,
      pngUrl: undefined,
      debugPngPath: undefined,
      evaluation: undefined,
      finalAsset: undefined,
    },
    {
      configurable: { thread_id: `${asset.id}:refine:${newIterationNumber}` },
      runName: 'svg_asset_refine_pipeline',
      recursionLimit: 8,
    }
  );

  return requireState(result.finalAsset, 'finalAsset');
}
```

- [ ] **Step 7: Run tests and typecheck API**

Run: `pnpm --filter=api test -- svg-build-orchestrator-langgraph.test.ts`

Expected: PASS.

Run: `pnpm --filter=api typecheck`

Expected: PASS. If TypeScript reports Prisma JSON type mismatches, fix by casting only at the boundary where persisted Prisma JSON is passed to typed service methods.

## Task 3: Async Refine Controller Job

**Files:**
- Modify: `apps/api/src/controllers/svgAssets.controller.ts`
- Test: `apps/api/test/svg-build-orchestrator-langgraph.test.ts`

- [ ] **Step 1: Write failing source test for async iterate endpoint behavior**

Add this test to `apps/api/test/svg-build-orchestrator-langgraph.test.ts`:

```ts
test('SvgAssetsController iterate creates a streamed background job like build', async () => {
  const source = await readFile(new URL('../src/controllers/svgAssets.controller.ts', import.meta.url), 'utf8');

  assert.match(source, /const jobId = generateId\('job'\)/);
  assert.match(source, /await this\.jobService\.create\(\{ jobId, assetId: parseResult\.data\.assetId \}\)/);
  assert.match(source, /void \(async \(\) => \{/);
  assert.match(source, /await this\.jobService\.start\(jobId\)/);
  assert.match(source, /await this\.orchestrator\.iterate\(parseResult\.data, \{/);
  assert.match(source, /onIterationRendered: \(iteration, previewUrl\) => void this\.jobService\.setLatestPreview\(jobId, previewUrl, iteration\)/);
  assert.match(source, /reply\.status\(202\)\.send\(\{ success: true, data: \{ jobId: job\.jobId, status: job\.status, progress: job\.progress \} \}\)/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter=api test -- svg-build-orchestrator-langgraph.test.ts`

Expected: FAIL because `iterate` is still synchronous.

- [ ] **Step 3: Change `SvgAssetsController.iterate` to background job**

Replace the `try` block in `iterate` with:

```ts
try {
  const jobId = generateId('job');
  const job = await this.jobService.create({ jobId, assetId: parseResult.data.assetId });

  void (async () => {
    try {
      await this.jobService.start(jobId);
      const asset = await this.orchestrator.iterate(parseResult.data, {
        ownerId: user.id,
        isAdmin: user.role === 'admin',
        onStage: (stage, message, progress) => {
          if (shouldClearStageOutput(message)) void this.jobService.clearStageOutput(jobId, stage);
          void this.jobService.stage(jobId, stage, progress, message);
        },
        onLlmToken: (stage, token) => void this.jobService.appendStageStream(jobId, stage, token),
        onReasoning: (stage, message) => void this.jobService.appendStageReasoning(jobId, stage, message),
        onToolEvent: (stage, event) => void this.jobService.appendToolEvent(jobId, stage, event),
        onIterationRendered: (iteration, previewUrl) => void this.jobService.setLatestPreview(jobId, previewUrl, iteration),
      });
      await this.jobService.attachAsset(jobId, asset.id);
      await this.jobService.complete(jobId);
    } catch (error) {
      await this.tokenService.refund(user.id, reservedTokens);
      await this.jobService.fail(jobId, error instanceof Error ? error.message : 'Refine failed');
      logger.error({ error, body: parseResult.data }, 'Background refine failed');
    }
  })();

  reply.status(202).send({ success: true, data: { jobId: job.jobId, status: job.status, progress: job.progress } });
} catch (error) {
  await this.tokenService.refund(user.id, reservedTokens);
  logger.error({ error, body: parseResult.data }, 'Failed to start SVG asset refine');
  sendServerError(reply, error, 'Failed to start asset refine');
}
```

Important behavior: do not refund on success. Refine reserves exactly one token and consumes it when the background run completes.

- [ ] **Step 4: Run API tests and typecheck**

Run: `pnpm --filter=api test -- svg-build-orchestrator-langgraph.test.ts`

Expected: PASS.

Run: `pnpm --filter=api typecheck`

Expected: PASS.

## Task 4: Web API Contract for Refine Jobs

**Files:**
- Modify: `apps/web/src/lib/api.ts`

- [ ] **Step 1: Update `iterateSvgAsset` return type and body**

In `apps/web/src/lib/api.ts`, replace `iterateSvgAsset` with:

```ts
export async function iterateSvgAsset(
  data: IterateSvgAssetRequest
): Promise<{ jobId: string }> {
  const res = await api.post<ApiEnvelope<{ jobId: string }>>(
    '/api/assets/svg/iterate',
    data
  );
  const payload = unwrapEnvelope(res.data);
  return { jobId: payload.jobId };
}
```

- [ ] **Step 2: Run web typecheck to reveal call-site errors**

Run: `pnpm --filter=web typecheck`

Expected: FAIL in pages that still expect `iterateSvgAsset` to return `AssetResponse`.

## Task 5: Asset Builder Page Unified Loading

**Files:**
- Modify: `apps/web/src/routes/AssetBuilderPage.tsx`

- [ ] **Step 1: Remove separate refine loading state**

Delete this state:

```ts
const [isRefining, setIsRefining] = useState(false);
```

Remove `setIsRefining(false);` from `handleNewAsset`.

- [ ] **Step 2: Change refine submit to create and subscribe to a job**

Replace `handleManualRefine` with:

```ts
const handleManualRefine = async (instruction: string) => {
  if (!asset) return;
  setIsLoading(true);
  setJob(undefined);
  try {
    const result = await iterateSvgAsset({
      assetId: asset.id,
      instruction,
    });
    setJobId(result.jobId);
  } catch (error) {
    setIsLoading(false);
    throw error;
  }
};
```

- [ ] **Step 3: Use only generate-style loading props in canvas and prompt**

In `PreviewCanvas`, replace:

```tsx
isRefining={isRefining}
```

with no prop. Keep:

```tsx
isLoading={isLoading}
currentStage={job?.currentStage}
loadingPreviewUrl={job?.latestPreviewUrl}
loadingIteration={job?.latestIteration}
loadingProgress={job?.progress}
```

In `ManualRefinementPrompt`, replace:

```tsx
disabled={!asset || isLoading || isRefining}
isLoading={isRefining}
```

with:

```tsx
disabled={!asset || isLoading}
isLoading={isLoading && Boolean(jobId)}
```

- [ ] **Step 4: Run web typecheck for this page**

Run: `pnpm --filter=web typecheck`

Expected: remaining failures only in `AssetDetailPage.tsx` and `PackDetailPage.tsx`.

## Task 6: Asset Detail Page Unified Refine Job

**Files:**
- Modify: `apps/web/src/routes/AssetDetailPage.tsx`

- [ ] **Step 1: Add job state and import job helpers**

Change the import from `../lib/api.js` to include `subscribeJobStream`:

```ts
import { cloneAsset, deleteAsset, getAsset, iterateSvgAsset, subscribeJobStream, updateAssetVisibility } from '../lib/api.js';
```

Change the type import to include `JobResponse`:

```ts
import type { AssetResponse, JobResponse } from '../types/index.js';
```

Replace `isRefining` state with:

```ts
const [jobId, setJobId] = useState<string | undefined>();
const [job, setJob] = useState<JobResponse | undefined>();
const [isProcessing, setIsProcessing] = useState(false);
```

- [ ] **Step 2: Add job stream subscription effect**

Add this effect after the preview reset effect:

```ts
useEffect(() => {
  if (!jobId) return;

  const unsubscribe = subscribeJobStream(jobId, {
    onJob: async (incomingJob) => {
      setJob(incomingJob);

      if (incomingJob.status === 'completed' && incomingJob.assetId) {
        await refetch();
        await refreshUser({ silent: true });
        setIsProcessing(false);
      }

      if (incomingJob.status === 'failed') {
        setIsProcessing(false);
      }
    },
    onError: () => {
      setIsProcessing(false);
    },
    onModelToken: ({ stage, content }) => {
      setJob((current) => appendJobStream(current, 'stageStreams', stage, content));
    },
    onReasoning: ({ stage, content }) => {
      setJob((current) => appendJobStream(current, 'stageReasoningStreams', stage, content));
    },
    onTool: (event) => {
      setJob((current) => appendJobToolEvent(current, event));
    },
    onClearStream: ({ stage }) => {
      setJob((current) => clearJobStream(current, stage));
    },
  });

  return () => unsubscribe();
}, [jobId, refetch, refreshUser]);
```

- [ ] **Step 3: Add local job helper functions**

Copy the existing helper functions from the bottom of `AssetBuilderPage.tsx` into `AssetDetailPage.tsx` if they are not already shared:

```ts
function appendJobStream(
  current: JobResponse | undefined,
  key: 'stageStreams' | 'stageReasoningStreams',
  stage: string,
  content: string,
): JobResponse | undefined {
  if (!current) return current;
  return {
    ...current,
    [key]: {
      ...(current[key] ?? {}),
      [stage]: `${current[key]?.[stage] ?? ''}${content}`.slice(-5000),
    },
  };
}

function appendJobToolEvent(
  current: JobResponse | undefined,
  event: {
    stage: string;
    content: string;
    at: string;
    sequence: number;
    toolName?: string;
    toolStatus?: 'requested' | 'running' | 'completed' | 'failed';
  },
): JobResponse | undefined {
  if (!current) return current;
  return {
    ...current,
    streamEvents: [
      ...(current.streamEvents ?? []),
      {
        sequence: event.sequence,
        type: 'tool',
        stage: event.stage,
        content: event.content,
        at: event.at,
        toolName: event.toolName,
        toolStatus: event.toolStatus,
      },
    ],
  };
}

function clearJobStream(
  current: JobResponse | undefined,
  stage: string,
): JobResponse | undefined {
  if (!current) return current;
  return {
    ...current,
    stageStreams: { ...(current.stageStreams ?? {}), [stage]: '' },
    stageReasoningStreams: { ...(current.stageReasoningStreams ?? {}), [stage]: '' },
  };
}

function hasPipelineData(job: JobResponse | undefined): job is JobResponse {
  return Boolean(job && (job.logs.length > 0 || job.currentStage || job.status === 'running' || job.status === 'failed'));
}
```

- [ ] **Step 4: Change refine submit to create a job**

Replace `handleManualRefine` with:

```ts
const handleManualRefine = async (instruction: string) => {
  if (!asset) return;
  setIsProcessing(true);
  setJob(undefined);
  try {
    const result = await iterateSvgAsset({ assetId: asset.id, instruction });
    setJobId(result.jobId);
  } catch (error) {
    setIsProcessing(false);
    throw error;
  }
};
```

- [ ] **Step 5: Wire loading UI to job state**

Change `PipelineRail`:

```tsx
pipelineRail={<PipelineRail asset={asset} currentStage={job?.currentStage} failed={job?.status === 'failed'} />}
```

Change `PreviewCanvas` props:

```tsx
isLoading={isLoading || isProcessing}
currentStage={job?.currentStage}
loadingPreviewUrl={job?.latestPreviewUrl}
loadingIteration={job?.latestIteration}
loadingProgress={job?.progress}
```

Change `ManualRefinementPrompt`:

```tsx
disabled={isLoading || isProcessing}
isLoading={isProcessing}
```

In the right panel, render pipeline logs before static inspector details while a refine job is active:

```tsx
{hasPipelineData(job) && (
  <PipelineFlowLogs
    logs={job.logs}
    currentStage={job.currentStage}
    failed={job.status === 'failed'}
    stageStreams={job.stageStreams}
    stageReasoningStreams={job.stageReasoningStreams}
    streamEvents={job.streamEvents}
    error={job.error}
  />
)}
```

Import `PipelineFlowLogs` at the top:

```ts
import { PipelineFlowLogs } from '../components/builder/PipelineFlowLogs.js';
```

- [ ] **Step 6: Run web typecheck**

Run: `pnpm --filter=web typecheck`

Expected: remaining failures only in `PackDetailPage.tsx` if it still expects refine to return an asset.

## Task 7: Pack Detail Page Refine Job Compatibility

**Files:**
- Modify: `apps/web/src/routes/PackDetailPage.tsx`

- [ ] **Step 1: Update refine handler to use returned job id**

Find `handleManualRefine`. Replace the call path that expects an `AssetResponse` with:

```ts
const result = await iterateSvgAsset({ assetId: activeAsset.id, instruction });
setJobId(result.jobId);
setJob(undefined);
setIsLoading(true);
```

If the page has a separate `isRefining` state, remove it and use `isLoading` plus `job` like `AssetBuilderPage`.

- [ ] **Step 2: Ensure pipeline and canvas use job state**

Make sure `PipelineRail` remains:

```tsx
<PipelineRail asset={activeAsset} currentStage={job?.currentStage} failed={job?.status === 'failed'} />
```

Make sure `PreviewCanvas` receives:

```tsx
isLoading={isLoading}
currentStage={job?.currentStage}
loadingPreviewUrl={job?.latestPreviewUrl}
loadingIteration={job?.latestIteration}
loadingProgress={job?.progress}
```

Make sure `ManualRefinementPrompt` receives only one loading source:

```tsx
disabled={!activeAsset || isLoading}
isLoading={isLoading && Boolean(jobId)}
```

- [ ] **Step 3: Ensure job completion refreshes the active asset**

In the existing job subscription, make sure completion fetches `incomingJob.assetId` and updates both active asset and any pack asset list state used by the page:

```ts
if (incomingJob.status === 'completed' && incomingJob.assetId) {
  const result = await getAsset(incomingJob.assetId);
  setActiveAsset({ ...result, currentStage: incomingJob.currentStage });
  setAssets((current) => current.map((item) => (item.id === result.id ? result : item)));
  await refreshUser({ silent: true });
  setIsLoading(false);
}
```

If the page uses a different pack state variable name, update only that existing variable. Do not introduce duplicate pack state.

- [ ] **Step 4: Run web typecheck**

Run: `pnpm --filter=web typecheck`

Expected: PASS.

## Task 8: Final Verification

**Files:**
- All modified files from prior tasks.

- [ ] **Step 1: Run focused API tests**

Run: `pnpm --filter=api test -- svg-build-orchestrator-langgraph.test.ts`

Expected: PASS.

- [ ] **Step 2: Run API typecheck**

Run: `pnpm --filter=api typecheck`

Expected: PASS.

- [ ] **Step 3: Run web typecheck**

Run: `pnpm --filter=web typecheck`

Expected: PASS.

- [ ] **Step 4: Run full test suite if focused checks pass**

Run: `pnpm test`

Expected: PASS. If this fails in unrelated existing tests, capture the failing test names and errors before deciding whether to fix or report them.

- [ ] **Step 5: Manual smoke test refine streaming**

Run API and web dev servers using the project’s normal dev setup. In the browser, open an existing completed asset, submit refine text `Selesaikan issues yang masih ada`, and verify:

- `/api/assets/svg/iterate` responds `202` with `jobId`.
- The pipeline rail moves through `svg`, `render`, `evaluate`, `optimize`, `export`.
- The right inspector shows `PipelineFlowLogs` while the refine job is running.
- Only one loading state is visible on the canvas; there is no duplicate refine overlay plus generate overlay.
- On completion, the asset preview, scores, issues, and iteration timeline refresh to the new iteration.

## Self-Review

- Spec coverage: The plan covers async refine jobs, reuse of `JobService`/SSE callbacks, one-iteration LangGraph refine, previous-context prompt enrichment from DB/final asset fields, and frontend single loading state.
- Placeholder scan: No task uses unresolved placeholder language. The only conditional instruction is limited to matching existing `PackDetailPage` state names to avoid inventing duplicate state.
- Type consistency: `iterateSvgAsset` returns `{ jobId: string }`, controller returns `{ jobId, status, progress }`, `SvgIterateOptions` extends shared callback signatures, and UI pages consume `JobResponse` via the existing `subscribeJobStream` helper.
