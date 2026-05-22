import type {
  AssetTypeClassification,
  CreativeBrief,
  StyleSystem,
  LayoutBlueprint,
  EvaluationResult,
  EvaluationIssue,
  RevisionPlan,
  BuildSvgAssetRequest,
  IterateSvgAssetRequest,
  PipelineStage,
} from '@svg-builder/shared';
import type { Asset } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { logger } from '../utils/logger.js';
import { sanitizeSvg, applyTransformToLayer } from '@svg-builder/svg-core';

import { AssetTypeClassifierService } from '../services/AssetTypeClassifierService.js';
import { CreativeBriefBuilderService } from '../services/CreativeBriefBuilderService.js';
import { StyleSystemBuilderService } from '../services/StyleSystemBuilderService.js';
import { ReferenceAnalyzerService } from '../services/ReferenceAnalyzerService.js';
import { AssetPlanningService } from '../services/AssetPlanningService.js';
import { LayoutPlannerService } from '../services/LayoutPlannerService.js';
import { SvgCoderService } from '../services/SvgCoderService.js';
import { SvgValidationService } from '../services/SvgValidationService.js';
import { SvgRenderService } from '../services/SvgRenderService.js';
import { SvgOptimizerService } from '../services/SvgOptimizerService.js';
import { AssetTypeEvaluatorService } from '../services/AssetTypeEvaluatorService.js';
import { RevisionPlannerService } from '../services/RevisionPlannerService.js';
import { StorageService } from '../services/StorageService.js';
import { DebugOverlayService } from '../services/DebugOverlayService.js';
import { IssueTracker } from '../services/IssueTracker.js';
import { SvgGenerationWorkflowService } from '../agents/SvgGenerationWorkflowService.js';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

const BUILD_GRAPH_SETUP_STEPS = 5;
const BUILD_GRAPH_STEPS_PER_ITERATION = 3;
const BUILD_GRAPH_REVISION_STEPS_PER_EXTRA_ITERATION = 1;
const BUILD_GRAPH_EXPORT_STEPS = 1;
const BUILD_GRAPH_RECURSION_BUFFER = 4;

export function calculateBuildGraphRecursionLimit(maxIterations: number): number {
  const normalizedMaxIterations = Math.max(1, Math.ceil(maxIterations));
  return (
    BUILD_GRAPH_SETUP_STEPS +
    normalizedMaxIterations * BUILD_GRAPH_STEPS_PER_ITERATION +
    (normalizedMaxIterations - 1) * BUILD_GRAPH_REVISION_STEPS_PER_EXTRA_ITERATION +
    BUILD_GRAPH_EXPORT_STEPS +
    BUILD_GRAPH_RECURSION_BUFFER
  );
}

export class SvgBuildOrchestrator {
  constructor(
    private classifier: AssetTypeClassifierService,
    private briefBuilder: CreativeBriefBuilderService,
    private styleBuilder: StyleSystemBuilderService,
    private referenceAnalyzer: ReferenceAnalyzerService,
    private assetPlanner: AssetPlanningService,
    private layoutPlanner: LayoutPlannerService,
    private svgCoder: SvgCoderService,
    private svgValidation: SvgValidationService,
    private svgRender: SvgRenderService,
    private svgOptimizer: SvgOptimizerService,
    private evaluator: AssetTypeEvaluatorService,
    private revisionPlanner: RevisionPlannerService,
    private storage: StorageService,
    private debugOverlay: DebugOverlayService,
    private svgGenerationWorkflow: SvgGenerationWorkflowService
  ) {}

  async build(
    request: BuildSvgAssetRequest,
    options?: {
      sharedStyleSystem?: StyleSystem;
      packConsistencyContext?: string;
      packId?: string;
      name?: string;
      ownerId?: string;
      visibility?: string;
      onStage?: (stage: import('@svg-builder/shared').PipelineStage, message: string, progress: number) => void;
      onIterationRendered?: (iteration: number, previewUrl: string) => void;
      onLlmToken?: (stage: import('@svg-builder/shared').PipelineStage, token: string) => void;
      onReasoning?: (stage: import('@svg-builder/shared').PipelineStage, message: string) => void;
      onToolEvent?: (
        stage: import('@svg-builder/shared').PipelineStage,
        event: { name: string; status: 'requested' | 'running' | 'completed' | 'failed'; message: string }
      ) => void;
    }
  ): Promise<Asset> {
    const asset = await prisma.asset.create({
      data: {
        packId: options?.packId,
        ownerId: options?.ownerId,
        name: options?.name,
        visibility: options?.visibility ?? 'private',
        prompt: request.prompt,
        assetType: request.assetType ?? 'icon',
        mode: request.mode,
        style: request.style,
        status: 'processing',
        width: request.output.width,
        height: request.output.height,
        referenceImageUrl: request.referenceImageUrl,
        currentIteration: 0,
      },
    });

    logger.info({ assetId: asset.id }, 'Asset created, starting pipeline');

    try {
      const reportRetry = (
        stage: import('@svg-builder/shared').PipelineStage,
        attempt: number,
        maxRetries: number,
        error: Error
      ) => {
        options?.onReasoning?.(
          stage,
          `Retry ${attempt}/${maxRetries}: previous error was "${error.message}". The next attempt receives this error context to avoid repeating it.`
        );
        options?.onStage?.(
          stage,
          `Retrying ${stage} flow ${attempt}/${maxRetries} after error: ${error.message}`,
          this.retryProgressForStage(stage)
        );
      };

      if (process.env.USE_LANGGRAPH_PIPELINE !== 'false') {
        return await this.runBuildGraph(asset, request, options, reportRetry);
      }

      options?.onStage?.('classify', 'Classifying asset type', 10);
      // Step 2: Classify asset type
      const requestPrompt = appendPackContext(request.prompt, options?.packConsistencyContext);
      const classification = await this.classifier.classify(requestPrompt, {
        explicitAssetType: request.assetType,
        width: request.output.width,
        height: request.output.height,
        useCase: request.style,
        hasReference: !!request.referenceImageUrl,
        onToken: (token) => options?.onLlmToken?.('classify', token),
        onReasoning: (token) => options?.onReasoning?.('classify', token),
        onRetry: (attempt, maxRetries, error) => reportRetry('classify', attempt, maxRetries, error),
      });

      await prisma.asset.update({
        where: { id: asset.id },
        data: { assetType: classification.assetType },
      });
      options?.onStage?.(
        'classify',
        `Detected asset type: ${classification.assetType} (consistency=${classification.requiresConsistency ? 'yes' : 'no'})`,
        12
      );

      // Step 3: Analyze reference if provided
      let referenceAnalysis: unknown | undefined;
      if (request.referenceImageUrl) {
        options?.onStage?.('brief', 'Analyzing reference image', 15);
        referenceAnalysis = await this.referenceAnalyzer.analyze(request.referenceImageUrl, {
          onToken: (token) => options?.onLlmToken?.('brief', token),
          onReasoning: (token) => options?.onReasoning?.('brief', token),
          onRetry: (attempt, maxRetries, error) => reportRetry('brief', attempt, maxRetries, error),
        });
        logger.info({ assetId: asset.id }, 'Reference analysis completed');
      }

      options?.onStage?.('brief', 'Building creative brief', 20);
      // Step 4: Build creative brief
      const brief = await this.briefBuilder.build(requestPrompt, classification, {
        style: request.style,
        width: request.output.width,
        height: request.output.height,
        referenceAnalysis,
        onToken: (token) => options?.onLlmToken?.('brief', token),
        onReasoning: (token) => options?.onReasoning?.('brief', token),
        onRetry: (attempt, maxRetries, error) => reportRetry('brief', attempt, maxRetries, error),
      });
      options?.onStage?.(
        'brief',
        `Brief ready: subject="${brief.composition.mainFocus}" mood="${brief.style.mood}"`,
        24
      );

      options?.onStage?.('style', 'Building style system', 30);
      // Step 5: Build style system (use shared if provided)
      const styleSystem = options?.sharedStyleSystem ?? await this.styleBuilder.build(brief, classification, undefined, {
        onToken: (token) => options?.onLlmToken?.('style', token),
        onReasoning: (token) => options?.onReasoning?.('style', token),
        onRetry: (attempt, maxRetries, error) => reportRetry('style', attempt, maxRetries, error),
      });
      options?.onStage?.(
        'style',
        describeStyleSystem(styleSystem),
        34
      );

      options?.onStage?.('layout', 'Planning asset strategy and layout', 40);
      // Step 6: Plan asset
      await this.assetPlanner.plan(classification, brief, styleSystem, referenceAnalysis);

      // Step 7: Plan layout
      const layout = await this.layoutPlanner.plan(
        brief,
        styleSystem,
        classification,
        request.output.width,
        request.output.height,
        referenceAnalysis,
        {
          onToken: (token) => options?.onLlmToken?.('layout', token),
          onReasoning: (token) => options?.onReasoning?.('layout', token),
          onRetry: (attempt, maxRetries, error) => reportRetry('layout', attempt, maxRetries, error),
        }
      );
      options?.onStage?.(
        'layout',
        `Layout planned: ${layout.layers.length} layers on ${layout.canvas.width}x${layout.canvas.height}`,
        44
      );

      // Steps 8-13: Iteration loop
      let currentSvg = '';
      let currentLayout: LayoutBlueprint = layout;
      let evaluation: EvaluationResult | undefined;
      let lastRevisionPlan: RevisionPlan | undefined;
      let lastValidationSummary: { valid: boolean; errors: string[]; warnings: string[] } | undefined;
      
      // Track issues across iterations to detect stale patterns
      const issueTracker = new IssueTracker();
      
      // Track best iteration for fallback
      let bestIteration = {
        iteration: 1,
        svg: '',
        scores: {} as EvaluationResult['scores'],
        issues: [] as EvaluationIssue[],
        pngUrl: '',
      };

      // Soft limit: use request maxIterations or default to 15
      const MAX_ITERATIONS = request.maxIterations ?? 15;

      for (let iteration = 1; iteration <= MAX_ITERATIONS; iteration++) {
        logger.info({ assetId: asset.id, iteration }, `Starting iteration ${iteration}`);

        options?.onStage?.('svg', `Generating SVG iteration ${iteration}`, 50);
        // Steps 8-9: Generate, validate, and preflight-render SVG with retry context.
        const initialSvg = await this.generateSvgDraft({
          iteration,
          brief,
          styleSystem,
          layout: currentLayout,
          currentSvg,
          lastRevisionPlan,
          onToken: (token) => options?.onLlmToken?.('svg', token),
          onReasoning: (token) => options?.onReasoning?.('svg', token),
        });

        const generated = await this.svgGenerationWorkflow.run({
          brief,
          styleSystem,
          layout: currentLayout,
          width: request.output.width,
          height: request.output.height,
          initialSvg,
          revisionInstruction: lastRevisionPlan?.notes,
          onToken: (token) => options?.onLlmToken?.('svg', token),
          onReasoning: (token) => options?.onReasoning?.('svg', token),
          onToolEvent: (message) => {
            const toolEvent = parseRepairToolEvent(message);
            if (toolEvent) {
              options?.onToolEvent?.('svg', toolEvent);
            }
            options?.onStage?.('svg', message, 52);
          },
          onRetry: (attempt, maxRetries, error) =>
            reportRetry('svg', attempt, maxRetries, error),
        });

        currentSvg = generated.svg;
        lastValidationSummary = generated.validationSummary;
        options?.onStage?.('svg', `SVG draft ready (${Math.round(currentSvg.length / 1024)} KB)`, 56);

        options?.onStage?.('render', `Rendering preview iteration ${iteration}`, 60);
        // Step 10: Render PNG
        const { pngPath, pngUrl } = await this.svgRender.render(
          currentSvg,
          asset.id,
          iteration,
          request.output.width,
          request.output.height
        );
        options?.onIterationRendered?.(iteration, pngUrl);

        // Step 11: Generate debug overlay
        const { debugPngPath } = await this.debugOverlay.generate(
          currentLayout,
          currentSvg,
          asset.id,
          iteration
        );

        options?.onStage?.('evaluate', `Evaluating iteration ${iteration}`, 70);
        // Step 12: Evaluate
        evaluation = await this.evaluator.evaluate(
          classification,
          brief,
          styleSystem,
          currentLayout,
          pngPath,
          referenceAnalysis,
          {
            onToken: (token) => options?.onLlmToken?.('evaluate', token),
            onReasoning: (token) => options?.onReasoning?.('evaluate', token),
            svgSource: currentSvg,
            validationSummary: lastValidationSummary,
            previousEvaluationContext: evaluation
              ? {
                  iteration: iteration - 1,
                  scores: evaluation.scores,
                  issues: evaluation.issues,
                  revisionPlan: lastRevisionPlan,
                }
              : undefined,
            onRetry: (attempt, maxRetries, error) => reportRetry('evaluate', attempt, maxRetries, error),
          }
        );
        options?.onStage?.(
          'evaluate',
          `Evaluation: ${Object.entries(evaluation.scores)
            .slice(0, 3)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}`,
          74
        );

        // Save iteration record
        await prisma.assetIteration.create({
          data: {
            assetId: asset.id,
            iterationNumber: iteration,
            brief: brief as unknown as Prisma.JsonValue,
            styleSystem: styleSystem as unknown as Prisma.JsonValue,
            referenceAnalysis: referenceAnalysis
              ? (referenceAnalysis as unknown as Prisma.JsonValue)
              : Prisma.JsonNull,
            layout: currentLayout as unknown as Prisma.JsonValue,
            svgDraftPath: currentSvg,
            pngPreviewPath: pngUrl,
            debugPreviewPath: debugPngPath,
            scores: evaluation.scores as unknown as Prisma.JsonValue,
            issues: evaluation.issues as unknown as Prisma.JsonValue,
            actionTaken: lastRevisionPlan
              ? (lastRevisionPlan as unknown as Prisma.JsonValue)
              : Prisma.JsonNull,
          },
        });

        await prisma.asset.update({
          where: { id: asset.id },
          data: { currentIteration: iteration },
        });

        // Track issues and detect stale patterns
        const issueAnalysis = issueTracker.trackIssues(evaluation.issues, iteration);
        
        // Update best iteration tracker
        const currentScore = evaluation.scores.overall ?? 0;
        const bestScore = bestIteration.scores.overall ?? 0;
        const currentIssueCount = evaluation.issues.length;
        const bestIssueCount = bestIteration.issues.length;
        
        // Update best if: higher score, OR same score with fewer issues
        if (currentScore > bestScore || (currentScore === bestScore && currentIssueCount < bestIssueCount)) {
          bestIteration = {
            iteration,
            svg: currentSvg,
            scores: evaluation.scores,
            issues: evaluation.issues,
            pngUrl,
          };
        }

        logger.info(
          { 
            assetId: asset.id, 
            iteration, 
            continueIteration: evaluation.continueIteration,
            newIssues: issueAnalysis.newIssues.length,
            staleIssues: issueAnalysis.staleIssues.length,
            resolvedIssues: issueAnalysis.resolvedIssues.length,
          },
          'Iteration completed'
        );

        // Step 13: Check if we should continue
        if (!evaluation.continueIteration) {
          logger.info({ assetId: asset.id }, 'No more issues, stopping iteration loop');
          break;
        }

        // Check for forced stop conditions
        const forceStop = issueTracker.shouldForceStop(iteration);
        if (forceStop.shouldStop) {
          logger.info({ assetId: asset.id, reason: forceStop.reason }, 'Forced stop detected');
          options?.onStage?.('evaluate', `Stopping: ${forceStop.reason}. Using best iteration (#${bestIteration.iteration})`, 74);
          
          // Restore best iteration
          currentSvg = bestIteration.svg;
          evaluation = {
            ...evaluation,
            scores: bestIteration.scores,
            issues: bestIteration.issues,
            continueIteration: false,
          };
          break;
        }

        options?.onStage?.('revise', `Planning revision from iteration ${iteration}`, 80);
        lastRevisionPlan = await this.revisionPlanner.plan(
          currentLayout,
          currentSvg,
          evaluation.issues,
          iteration,
          classification,
          {
            onToken: (token) => options?.onLlmToken?.('revise', token),
            onReasoning: (token) => options?.onReasoning?.('revise', token),
            issueHistorySummary: issueTracker.getHistorySummary(),
            onRetry: (attempt, maxRetries, error) => reportRetry('revise', attempt, maxRetries, error),
          }
        );

        // Apply layout updates if revision plan includes them
        if (lastRevisionPlan.updatedLayout && Object.keys(lastRevisionPlan.updatedLayout).length > 0) {
          currentLayout = deepMerge(currentLayout, lastRevisionPlan.updatedLayout) as LayoutBlueprint;
        }
      }

      options?.onStage?.('optimize', 'Sanitizing and optimizing final SVG', 90);
      // Step 14: Sanitize final SVG
      const sanitizedSvg = sanitizeSvg(currentSvg);

      // Step 15: Optimize SVG
      const optimizationResult = await this.svgOptimizer.optimize(sanitizedSvg);

      options?.onStage?.('export', 'Saving final outputs', 98);
      // Step 16: Save final files
      const finalSvgPath = await this.storage.saveAssetFile(asset.id, 'final.svg', optimizationResult.optimizedSvg);
      const finalSvgUrl = `/${finalSvgPath}`;

      // Step 17: Update Asset record
      const finalPngUrl = evaluation
        ? (await this.svgRender.render(optimizationResult.optimizedSvg, asset.id, 999, request.output.width, request.output.height)).pngUrl
        : undefined;

      const updatedAsset = await prisma.asset.update({
        where: { id: asset.id },
        data: {
          status: 'completed',
          finalSvgPath: finalSvgUrl,
          finalPngPath: finalPngUrl,
          finalDebugPngPath: undefined,
          bestIterationNumber: bestIteration.iteration,
          finalScores: evaluation
            ? (evaluation.scores as unknown as Prisma.JsonValue)
            : Prisma.JsonNull,
        },
      });

      options?.onStage?.('export', 'Final outputs saved', 100);
      logger.info({ assetId: asset.id }, 'Pipeline completed successfully');
      return updatedAsset;
    } catch (error) {
      logger.error({ assetId: asset.id, error }, 'Pipeline failed');

      await prisma.asset.update({
        where: { id: asset.id },
        data: { status: 'failed' },
      });

      throw error;
    }
  }

  async iterate(request: IterateSvgAssetRequest, options?: { ownerId?: string; isAdmin?: boolean }): Promise<Asset> {
    const asset = await prisma.asset.findUnique({
      where: { id: request.assetId },
      include: { iterations: { orderBy: { iterationNumber: 'desc' }, take: 1 } },
    });

    if (!asset) {
      throw new Error(`Asset not found: ${request.assetId}`);
    }

    if (asset.ownerId && options?.ownerId && asset.ownerId !== options.ownerId && !options?.isAdmin) {
      throw new Error('You can only refine assets you own');
    }

    if (asset.status === 'processing') {
      throw new Error(`Asset ${request.assetId} is currently being processed`);
    }

    const latestIteration = asset.iterations[0];
    if (!latestIteration) {
      throw new Error(`No iterations found for asset: ${request.assetId}`);
    }

    const brief = latestIteration.brief as unknown as CreativeBrief;
    const styleSystem = latestIteration.styleSystem as unknown as StyleSystem;
    const layout = latestIteration.layout as unknown as LayoutBlueprint;
    const previousSvg = latestIteration.svgDraftPath ?? '';

    const newIterationNumber = asset.currentIteration + 1;

    logger.info({ assetId: asset.id, iteration: newIterationNumber }, 'Starting manual iteration');

    try {
      await prisma.asset.update({
        where: { id: asset.id },
        data: { status: 'processing' },
      });

      // Generate new SVG with user instruction
      const initialSvg = await this.svgCoder.code(brief, styleSystem, layout, {
        previousSvg,
        revisionInstruction: request.instruction,
      });
      const generated = await this.svgGenerationWorkflow.run({
        brief,
        styleSystem,
        layout,
        width: asset.width,
        height: asset.height,
        initialSvg,
        revisionInstruction: request.instruction,
      });
      const currentSvg = generated.svg;

      // Render
      const { pngPath, pngUrl } = await this.svgRender.render(
        currentSvg,
        asset.id,
        newIterationNumber,
        asset.width,
        asset.height
      );

      // Debug overlay
      const { debugPngPath } = await this.debugOverlay.generate(layout, currentSvg, asset.id, newIterationNumber);

      // Evaluate
      const classification: AssetTypeClassification = {
        assetType: asset.assetType,
        quantity: 1,
        useCase: 'general',
        requiresConsistency: false,
        requiresSmallSizeReadability: false,
        requiresTileability: false,
        requiresBrandOriginality: false,
        requiresReferenceMatching: false,
      };

      const evaluation = await this.evaluator.evaluate(
        classification,
        brief,
        styleSystem,
        layout,
        pngPath,
        latestIteration.referenceAnalysis ?? undefined,
        {
          svgSource: currentSvg,
          validationSummary: generated.validationSummary,
          previousEvaluationContext: {
            iteration: latestIteration.iterationNumber,
            scores: latestIteration.scores,
            issues: latestIteration.issues,
            revisionPlan: latestIteration.actionTaken,
          },
        }
      );

      // Save iteration
      await prisma.assetIteration.create({
        data: {
          assetId: asset.id,
          iterationNumber: newIterationNumber,
          brief: brief as unknown as Prisma.JsonValue,
          styleSystem: styleSystem as unknown as Prisma.JsonValue,
          referenceAnalysis: latestIteration.referenceAnalysis,
          layout: layout as unknown as Prisma.JsonValue,
          svgDraftPath: currentSvg,
          pngPreviewPath: pngUrl,
          debugPreviewPath: debugPngPath,
          scores: evaluation.scores as unknown as Prisma.JsonValue,
          issues: evaluation.issues as unknown as Prisma.JsonValue,
          actionTaken: { instruction: request.instruction } as unknown as Prisma.JsonValue,
        },
      });

      // Save final
      const sanitizedSvg = sanitizeSvg(currentSvg);
      const optimizationResult = await this.svgOptimizer.optimize(sanitizedSvg);
      const finalSvgPath = await this.storage.saveAssetFile(asset.id, 'final.svg', optimizationResult.optimizedSvg);
      const finalSvgUrl = `/${finalSvgPath}`;

      const updatedAsset = await prisma.asset.update({
        where: { id: asset.id },
        data: {
          status: 'completed',
          currentIteration: newIterationNumber,
          finalSvgPath: finalSvgUrl,
          finalPngPath: pngUrl,
          finalScores: evaluation.scores as unknown as Prisma.JsonValue,
        },
      });

      logger.info({ assetId: asset.id }, 'Manual iteration completed');
      return updatedAsset;
    } catch (error) {
      logger.error({ assetId: asset.id, error }, 'Manual iteration failed');

      await prisma.asset.update({
        where: { id: asset.id },
        data: { status: 'failed' },
      });

      throw error;
    }
  }

  private async runBuildGraph(
    asset: Asset,
    request: BuildSvgAssetRequest,
    options: {
      sharedStyleSystem?: StyleSystem;
      packConsistencyContext?: string;
      packId?: string;
      name?: string;
      ownerId?: string;
      visibility?: string;
      onStage?: (stage: PipelineStage, message: string, progress: number) => void;
      onIterationRendered?: (iteration: number, previewUrl: string) => void;
      onLlmToken?: (stage: PipelineStage, token: string) => void;
      onReasoning?: (stage: PipelineStage, message: string) => void;
      onToolEvent?: (
        stage: PipelineStage,
        event: { name: string; status: 'requested' | 'running' | 'completed' | 'failed'; message: string }
      ) => void;
    } | undefined,
    reportRetry: (stage: PipelineStage, attempt: number, maxRetries: number, error: Error) => void
  ): Promise<Asset> {
    const issueTracker = new IssueTracker();
    const maxIterations = request.maxIterations ?? 15;

    type ValidationSummary = { valid: boolean; errors: string[]; warnings: string[] };
    type BestIteration = {
      iteration: number;
      svg: string;
      scores: EvaluationResult['scores'];
      issues: EvaluationIssue[];
      pngUrl: string;
    };

    const BuildState = Annotation.Root({
      classification: Annotation<AssetTypeClassification | undefined>(),
      referenceAnalysis: Annotation<unknown | undefined>(),
      brief: Annotation<CreativeBrief | undefined>(),
      styleSystem: Annotation<StyleSystem | undefined>(),
      layout: Annotation<LayoutBlueprint | undefined>(),
      currentLayout: Annotation<LayoutBlueprint | undefined>(),
      currentSvg: Annotation<string>(),
      evaluation: Annotation<EvaluationResult | undefined>(),
      lastRevisionPlan: Annotation<RevisionPlan | undefined>(),
      lastValidationSummary: Annotation<ValidationSummary | undefined>(),
      pngPath: Annotation<string | undefined>(),
      pngUrl: Annotation<string | undefined>(),
      debugPngPath: Annotation<string | undefined>(),
      packContextPrompt: Annotation<string | undefined>(),
      iteration: Annotation<number>(),
      bestIteration: Annotation<BestIteration>(),
      stopReason: Annotation<string | undefined>(),
      finalAsset: Annotation<Asset | undefined>(),
    });

    type BuildStateValue = typeof BuildState.State;

    const requireState = <T>(value: T | undefined, name: string): T => {
      if (value === undefined || value === null) {
        throw new Error(`LangGraph build state missing required field: ${name}`);
      }
      return value;
    };

    const graph = new StateGraph(BuildState)
      .addNode('pack_context', async () => {
        if (!options?.packConsistencyContext) {
          return { packContextPrompt: undefined };
        }

        options.onStage?.('brief', 'Preparing pack consistency context', 18);
        return {
          packContextPrompt: options.packConsistencyContext,
        };
      })
      .addNode('classify', async () => {
        options?.onStage?.('classify', 'Classifying asset type', 10);
        const requestPrompt = appendPackContext(request.prompt, options?.packConsistencyContext);
        const classification = await this.classifier.classify(requestPrompt, {
          explicitAssetType: request.assetType,
          width: request.output.width,
          height: request.output.height,
          useCase: request.style,
          hasReference: !!request.referenceImageUrl,
          onToken: (token) => options?.onLlmToken?.('classify', token),
          onReasoning: (token) => options?.onReasoning?.('classify', token),
          onRetry: (attempt, retries, error) => reportRetry('classify', attempt, retries, error),
        });

        await prisma.asset.update({
          where: { id: asset.id },
          data: { assetType: classification.assetType },
        });
        options?.onStage?.(
          'classify',
          `Detected asset type: ${classification.assetType} (consistency=${classification.requiresConsistency ? 'yes' : 'no'})`,
          12
        );
        return { classification };
      })
      .addNode('reference_analyze', async () => {
        if (!request.referenceImageUrl) {
          return { referenceAnalysis: undefined };
        }

        options?.onStage?.('brief', 'Analyzing reference image', 15);
        const referenceAnalysis = await this.referenceAnalyzer.analyze(request.referenceImageUrl, {
          onToken: (token) => options?.onLlmToken?.('brief', token),
          onReasoning: (token) => options?.onReasoning?.('brief', token),
          onRetry: (attempt, retries, error) => reportRetry('brief', attempt, retries, error),
        });
        logger.info({ assetId: asset.id }, 'Reference analysis completed');
        return { referenceAnalysis };
      })
      .addNode('build_brief', async (state: BuildStateValue) => {
        const classification = requireState(state.classification, 'classification');
        const requestPrompt = appendPackContext(request.prompt, state.packContextPrompt);
        options?.onStage?.('brief', 'Building creative brief', 20);
        const brief = await this.briefBuilder.build(requestPrompt, classification, {
          style: request.style,
          width: request.output.width,
          height: request.output.height,
          referenceAnalysis: state.referenceAnalysis,
          onToken: (token) => options?.onLlmToken?.('brief', token),
          onReasoning: (token) => options?.onReasoning?.('brief', token),
          onRetry: (attempt, retries, error) => reportRetry('brief', attempt, retries, error),
        });
        options?.onStage?.(
          'brief',
          `Brief ready: subject="${brief.composition.mainFocus}" mood="${brief.style.mood}"`,
          24
        );
        return { brief };
      })
      .addNode('style', async (state: BuildStateValue) => {
        const classification = requireState(state.classification, 'classification');
        const brief = requireState(state.brief, 'brief');
        options?.onStage?.('style', 'Building style system', 30);
        const styleSystem = options?.sharedStyleSystem ?? await this.styleBuilder.build(brief, classification, undefined, {
          onToken: (token) => options?.onLlmToken?.('style', token),
          onReasoning: (token) => options?.onReasoning?.('style', token),
          onRetry: (attempt, retries, error) => reportRetry('style', attempt, retries, error),
        });
        options?.onStage?.(
          'style',
          describeStyleSystem(styleSystem),
          34
        );
        return { styleSystem };
      })
      .addNode('plan_layout', async (state: BuildStateValue) => {
        const classification = requireState(state.classification, 'classification');
        const brief = requireState(state.brief, 'brief');
        const styleSystem = requireState(state.styleSystem, 'styleSystem');
        options?.onStage?.('layout', 'Planning asset strategy and layout', 40);
        await this.assetPlanner.plan(classification, brief, styleSystem, state.referenceAnalysis);
        const layout = await this.layoutPlanner.plan(
          brief,
          styleSystem,
          classification,
          request.output.width,
          request.output.height,
          state.referenceAnalysis,
          {
            onToken: (token) => options?.onLlmToken?.('layout', token),
            onReasoning: (token) => options?.onReasoning?.('layout', token),
            onRetry: (attempt, retries, error) => reportRetry('layout', attempt, retries, error),
          }
        );
        options?.onStage?.(
          'layout',
          `Layout planned: ${layout.layers.length} layers on ${layout.canvas.width}x${layout.canvas.height}`,
          44
        );
        return { layout, currentLayout: layout };
      })
      .addNode('generate_svg', async (state: BuildStateValue) => {
        const brief = requireState(state.brief, 'brief');
        const styleSystem = requireState(state.styleSystem, 'styleSystem');
        const currentLayout = requireState(state.currentLayout, 'currentLayout');
        const iteration = state.iteration;

        logger.info({ assetId: asset.id, iteration }, `Starting iteration ${iteration}`);
        options?.onStage?.('svg', `Generating SVG iteration ${iteration}`, 50);
        const initialSvg = await this.generateSvgDraft({
          iteration,
          brief,
          styleSystem,
          layout: currentLayout,
          currentSvg: state.currentSvg,
          lastRevisionPlan: state.lastRevisionPlan,
          onToken: (token) => options?.onLlmToken?.('svg', token),
          onReasoning: (token) => options?.onReasoning?.('svg', token),
        });

        const generated = await this.svgGenerationWorkflow.run({
          brief,
          styleSystem,
          layout: currentLayout,
          width: request.output.width,
          height: request.output.height,
          initialSvg,
          revisionInstruction: state.lastRevisionPlan?.notes,
          onToken: (token) => options?.onLlmToken?.('svg', token),
          onReasoning: (token) => options?.onReasoning?.('svg', token),
          onToolEvent: (message) => {
            const toolEvent = parseRepairToolEvent(message);
            if (toolEvent) {
              options?.onToolEvent?.('svg', toolEvent);
            }
            options?.onStage?.('svg', message, 52);
          },
          onRetry: (attempt, retries, error) => reportRetry('svg', attempt, retries, error),
        });

        options?.onStage?.('svg', `SVG draft ready (${Math.round(generated.svg.length / 1024)} KB)`, 56);
        return {
          currentSvg: generated.svg,
          lastValidationSummary: generated.validationSummary,
        };
      })
      .addNode('render_preview', async (state: BuildStateValue) => {
        const currentLayout = requireState(state.currentLayout, 'currentLayout');
        const iteration = state.iteration;
        options?.onStage?.('render', `Rendering preview iteration ${iteration}`, 60);
        const { pngPath, pngUrl } = await this.svgRender.render(
          state.currentSvg,
          asset.id,
          iteration,
          request.output.width,
          request.output.height
        );
        options?.onIterationRendered?.(iteration, pngUrl);
        const { debugPngPath } = await this.debugOverlay.generate(currentLayout, state.currentSvg, asset.id, iteration);
        return { pngPath, pngUrl, debugPngPath } as Partial<BuildStateValue> & {
          pngPath: string;
          pngUrl: string;
          debugPngPath: string;
        };
      })
      .addNode('evaluate', async (state: BuildStateValue & { pngPath?: string; pngUrl?: string; debugPngPath?: string }) => {
        const classification = requireState(state.classification, 'classification');
        const brief = requireState(state.brief, 'brief');
        const styleSystem = requireState(state.styleSystem, 'styleSystem');
        const currentLayout = requireState(state.currentLayout, 'currentLayout');
        const pngPath = requireState(state.pngPath, 'pngPath');
        const pngUrl = requireState(state.pngUrl, 'pngUrl');
        const debugPngPath = requireState(state.debugPngPath, 'debugPngPath');
        const iteration = state.iteration;

        options?.onStage?.('evaluate', `Evaluating iteration ${iteration}`, 70);
        let evaluation = await this.evaluator.evaluate(
          classification,
          brief,
          styleSystem,
          currentLayout,
          pngPath,
          state.referenceAnalysis,
          {
            onToken: (token) => options?.onLlmToken?.('evaluate', token),
            onReasoning: (token) => options?.onReasoning?.('evaluate', token),
            svgSource: state.currentSvg,
            validationSummary: state.lastValidationSummary,
            previousEvaluationContext: state.evaluation
              ? {
                  iteration: iteration - 1,
                  scores: state.evaluation.scores,
                  issues: state.evaluation.issues,
                  revisionPlan: state.lastRevisionPlan,
                }
              : undefined,
            onRetry: (attempt, retries, error) => reportRetry('evaluate', attempt, retries, error),
          }
        );
        options?.onStage?.(
          'evaluate',
          `Evaluation: ${Object.entries(evaluation.scores)
            .slice(0, 3)
            .map(([k, v]) => `${k}=${v}`)
            .join(', ')}`,
          74
        );

        await prisma.assetIteration.create({
          data: {
            assetId: asset.id,
            iterationNumber: iteration,
            brief: brief as unknown as Prisma.JsonValue,
            styleSystem: styleSystem as unknown as Prisma.JsonValue,
            referenceAnalysis: state.referenceAnalysis
              ? (state.referenceAnalysis as unknown as Prisma.JsonValue)
              : Prisma.JsonNull,
            layout: currentLayout as unknown as Prisma.JsonValue,
            svgDraftPath: state.currentSvg,
            pngPreviewPath: pngUrl,
            debugPreviewPath: debugPngPath,
            scores: evaluation.scores as unknown as Prisma.JsonValue,
            issues: evaluation.issues as unknown as Prisma.JsonValue,
            actionTaken: state.lastRevisionPlan
              ? (state.lastRevisionPlan as unknown as Prisma.JsonValue)
              : Prisma.JsonNull,
          },
        });

        await prisma.asset.update({
          where: { id: asset.id },
          data: { currentIteration: iteration },
        });

        const issueAnalysis = issueTracker.trackIssues(evaluation.issues, iteration);
        let bestIteration = state.bestIteration;
        const currentScore = evaluation.scores.overall ?? 0;
        const bestScore = bestIteration.scores.overall ?? 0;
        if (
          currentScore > bestScore ||
          (currentScore === bestScore && evaluation.issues.length < bestIteration.issues.length)
        ) {
          bestIteration = {
            iteration,
            svg: state.currentSvg,
            scores: evaluation.scores,
            issues: evaluation.issues,
            pngUrl,
          };
        }

        logger.info(
          {
            assetId: asset.id,
            iteration,
            continueIteration: evaluation.continueIteration,
            newIssues: issueAnalysis.newIssues.length,
            staleIssues: issueAnalysis.staleIssues.length,
            resolvedIssues: issueAnalysis.resolvedIssues.length,
          },
          'Iteration completed'
        );

        let stopReason: string | undefined;
        if (!evaluation.continueIteration) {
          logger.info({ assetId: asset.id }, 'No more issues, stopping iteration loop');
        } else {
          const forceStop = issueTracker.shouldForceStop(iteration);
          if (forceStop.shouldStop) {
            logger.info({ assetId: asset.id, reason: forceStop.reason }, 'Forced stop detected');
            options?.onStage?.('evaluate', `Stopping: ${forceStop.reason}. Using best iteration (#${bestIteration.iteration})`, 74);
            evaluation = {
              ...evaluation,
              scores: bestIteration.scores,
              issues: bestIteration.issues,
              continueIteration: false,
            };
            stopReason = forceStop.reason;
          }
        }

        return {
          evaluation,
          bestIteration,
          currentSvg: stopReason ? bestIteration.svg : state.currentSvg,
          stopReason,
        };
      })
      .addNode('revise', async (state: BuildStateValue) => {
        const classification = requireState(state.classification, 'classification');
        const currentLayout = requireState(state.currentLayout, 'currentLayout');
        const evaluation = requireState(state.evaluation, 'evaluation');
        const iteration = state.iteration;

        options?.onStage?.('revise', `Planning revision from iteration ${iteration}`, 80);
        const lastRevisionPlan = await this.revisionPlanner.plan(
          currentLayout,
          state.currentSvg,
          evaluation.issues,
          iteration,
          classification,
          {
            onToken: (token) => options?.onLlmToken?.('revise', token),
            onReasoning: (token) => options?.onReasoning?.('revise', token),
            issueHistorySummary: issueTracker.getHistorySummary(),
            onRetry: (attempt, retries, error) => reportRetry('revise', attempt, retries, error),
          }
        );

        let nextLayout = currentLayout;
        if (lastRevisionPlan.updatedLayout && Object.keys(lastRevisionPlan.updatedLayout).length > 0) {
          nextLayout = deepMerge(currentLayout, lastRevisionPlan.updatedLayout) as LayoutBlueprint;
        }

        return {
          lastRevisionPlan,
          currentLayout: nextLayout,
          iteration: iteration + 1,
        };
      })
      .addNode('optimize_export', async (state: BuildStateValue) => {
        const evaluation = requireState(state.evaluation, 'evaluation');
        options?.onStage?.('optimize', 'Sanitizing and optimizing final SVG', 90);
        const sanitizedSvg = sanitizeSvg(state.currentSvg);
        const optimizationResult = await this.svgOptimizer.optimize(sanitizedSvg);

        options?.onStage?.('export', 'Saving final outputs', 98);
        const finalSvgPath = await this.storage.saveAssetFile(asset.id, 'final.svg', optimizationResult.optimizedSvg);
        const finalSvgUrl = `/${finalSvgPath}`;
        const finalPngUrl = (await this.svgRender.render(
          optimizationResult.optimizedSvg,
          asset.id,
          999,
          request.output.width,
          request.output.height
        )).pngUrl;

        const updatedAsset = await prisma.asset.update({
          where: { id: asset.id },
          data: {
            status: 'completed',
            finalSvgPath: finalSvgUrl,
            finalPngPath: finalPngUrl,
            finalDebugPngPath: undefined,
            bestIterationNumber: state.bestIteration.iteration,
            finalScores: evaluation.scores as unknown as Prisma.JsonValue,
          },
        });

        options?.onStage?.('export', 'Final outputs saved', 100);
        logger.info({ assetId: asset.id }, 'Pipeline completed successfully');
        return { finalAsset: updatedAsset };
      })
      .addEdge(START, 'classify')
      .addEdge('classify', 'pack_context')
      .addEdge('pack_context', 'reference_analyze')
      .addEdge('reference_analyze', 'build_brief')
      .addEdge('build_brief', 'style')
      .addEdge('style', 'plan_layout')
      .addEdge('plan_layout', 'generate_svg')
      .addEdge('generate_svg', 'render_preview')
      .addEdge('render_preview', 'evaluate')
      .addConditionalEdges(
        'evaluate',
        (state: BuildStateValue) => {
          const shouldRevise =
            Boolean(state.evaluation?.continueIteration) &&
            !state.stopReason &&
            state.iteration < maxIterations;
          return shouldRevise ? 'revise' : 'optimize_export';
        },
        ['revise', 'optimize_export']
      )
      .addEdge('revise', 'generate_svg')
      .addEdge('optimize_export', END)
      .compile();

    const result = await graph.invoke(
      {
        classification: undefined,
        referenceAnalysis: undefined,
        brief: undefined,
        styleSystem: undefined,
        layout: undefined,
        currentLayout: undefined,
        currentSvg: '',
        evaluation: undefined,
        lastRevisionPlan: undefined,
        lastValidationSummary: undefined,
        pngPath: undefined,
        pngUrl: undefined,
        debugPngPath: undefined,
        packContextPrompt: undefined,
        iteration: 1,
        bestIteration: {
          iteration: 1,
          svg: '',
          scores: {} as EvaluationResult['scores'],
          issues: [],
          pngUrl: '',
        },
        stopReason: undefined,
        finalAsset: undefined,
      },
      {
        configurable: {
          thread_id: asset.id,
        },
        runName: 'svg_asset_build_pipeline',
        recursionLimit: calculateBuildGraphRecursionLimit(maxIterations),
      }
    );

    return requireState(result.finalAsset, 'finalAsset');
  }

  private retryProgressForStage(stage: import('@svg-builder/shared').PipelineStage): number {
    const progressByStage: Record<import('@svg-builder/shared').PipelineStage, number> = {
      classify: 11,
      brief: 21,
      style: 31,
      layout: 41,
      svg: 52,
      render: 61,
      evaluate: 71,
      revise: 81,
      optimize: 91,
      export: 98,
    };
    return progressByStage[stage];
  }

  private async generateSvgDraft(input: {
    iteration: number;
    brief: CreativeBrief;
    styleSystem: StyleSystem;
    layout: LayoutBlueprint;
    currentSvg: string;
    lastRevisionPlan?: RevisionPlan;
    onToken?: (token: string) => void;
    onReasoning?: (token: string) => void;
  }): Promise<string> {
    if (input.iteration === 1) {
      return this.svgCoder.code(input.brief, input.styleSystem, input.layout, {
        onToken: input.onToken,
        onReasoning: input.onReasoning,
      });
    }

    if (input.lastRevisionPlan) {
      if (input.lastRevisionPlan.strategy === 'layer_transform' && input.lastRevisionPlan.layerTransforms?.length) {
        const transformErrors: string[] = [];
        let transformedSvg = input.currentSvg;

        for (const transform of input.lastRevisionPlan.layerTransforms) {
          try {
            transformedSvg = applyTransformToLayer(
              transformedSvg,
              String(transform.layerId),
              serializeLayerTransform(transform.transform)
            );
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            transformErrors.push(`Layer ${String(transform.layerId)}: ${message}`);
          }
        }

        if (transformErrors.length === 0) {
          return transformedSvg;
        }

        return this.svgCoder.code(input.brief, input.styleSystem, input.layout, {
          previousSvg: input.currentSvg,
          revisionInstruction: `${
            buildRevisionInstruction(input.lastRevisionPlan)
          }\nThe previous layer_transform plan failed, so regenerate the SVG instead. Transform errors:\n${transformErrors.join('\n')}`,
          onToken: input.onToken,
          onReasoning: input.onReasoning,
        });
      }

      if (input.lastRevisionPlan.strategy === 'full_regenerate') {
        return this.svgCoder.code(input.brief, input.styleSystem, input.layout, {
          revisionInstruction: buildRevisionInstruction(input.lastRevisionPlan),
          previousErrorContext: buildPreviousSvgFailureContext(input.currentSvg),
          onToken: input.onToken,
          onReasoning: input.onReasoning,
        });
      }

      return this.svgCoder.code(input.brief, input.styleSystem, input.layout, {
        previousSvg: input.currentSvg,
        revisionInstruction: buildRevisionInstruction(input.lastRevisionPlan),
        onToken: input.onToken,
        onReasoning: input.onReasoning,
      });
    }

    return this.svgCoder.code(input.brief, input.styleSystem, input.layout, {
      previousSvg: input.currentSvg,
      revisionInstruction: 'Improve based on previous evaluation.',
      onToken: input.onToken,
      onReasoning: input.onReasoning,
    });
  }
}

function buildRevisionInstruction(plan: RevisionPlan): string {
  const contract = {
    strategy: plan.strategy,
    executionMode: plan.strategy === 'full_regenerate'
      ? 'blank_slate_rebuild_do_not_copy_previous_svg'
      : 'targeted_revision',
    updatedLayout: plan.updatedLayout,
    layerTransforms: plan.layerTransforms,
    layersToRegenerate: plan.layersToRegenerate,
    mustChange: plan.mustChange,
    avoidRepeating: plan.avoidRepeating,
    successCriteria: plan.successCriteria,
    notes: plan.notes,
    generatorRules: plan.strategy === 'full_regenerate'
      ? [
          'Do not reuse the previous SVG as a template.',
          'Create a materially different layer hierarchy and geometry that directly addresses the evaluator issues.',
          'Preserve only the brief, style system, canvas, and layout intent, not the failed implementation.',
          'Before returning, verify that the SVG satisfies every successCriteria item and avoids every avoidRepeating item.',
        ]
      : [
          'Make the smallest safe change that resolves the target issues.',
          'Keep resolved layers stable, but do not preserve unresolved failure patterns.',
        ],
  };

  return JSON.stringify(
    contract,
    null,
    2
  );
}

function buildPreviousSvgFailureContext(svg: string): string {
  const maxChars = 3500;
  const truncatedSvg = svg.length > maxChars ? `${svg.slice(0, maxChars)}\n<!-- truncated failure reference -->` : svg;
  return [
    'The previous SVG is provided only as a failure reference for what NOT to repeat.',
    'Do not copy its layer structure, geometry, defs, ids, or decorative details unless the revision contract explicitly says to keep them.',
    'Previous failed SVG excerpt:',
    truncatedSvg,
  ].join('\n');
}

function serializeLayerTransform(transform: NonNullable<RevisionPlan['layerTransforms']>[number]['transform']): string {
  if (typeof transform === 'string') {
    return transform;
  }

  const parts: string[] = [];
  const translate = readRecord(transform.translate);
  if (translate) {
    const x = readNumber(translate.x, 0);
    const y = readNumber(translate.y, 0);
    parts.push(`translate(${x} ${y})`);
  }

  const scale = typeof transform.scale === 'number' || typeof transform.scale === 'string'
    ? Number(transform.scale)
    : undefined;
  if (typeof scale === 'number' && Number.isFinite(scale)) {
    parts.push(`scale(${scale})`);
  }

  const rotate = typeof transform.rotate === 'number' || typeof transform.rotate === 'string'
    ? Number(transform.rotate)
    : undefined;
  if (typeof rotate === 'number' && Number.isFinite(rotate)) {
    parts.push(`rotate(${rotate})`);
  }

  if (parts.length === 0) {
    throw new Error(`Unsupported layer transform object: ${JSON.stringify(transform)}`);
  }

  return parts.join(' ');
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' || typeof value === 'string' ? Number(value) : fallback;
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseRepairToolEvent(
  message: string
): { name: string; status: 'requested' | 'running' | 'completed' | 'failed'; message: string } | undefined {
  const match = /Repair tool (requested|completed|failed): ([\w-]+)|Calling repair tool: ([\w-]+)/i.exec(message);
  if (!match) {
    return undefined;
  }

  if (match[3]) {
    return { name: match[3], status: 'running', message };
  }

  const statusByVerb = {
    requested: 'requested',
    completed: 'completed',
    failed: 'failed',
  } as const;
  const verb = match[1]?.toLowerCase() as keyof typeof statusByVerb;
  const name = match[2];
  if (!name || !statusByVerb[verb]) {
    return undefined;
  }
  return { name, status: statusByVerb[verb], message };
}

function appendPackContext(prompt: string, packConsistencyContext?: string): string {
  if (!packConsistencyContext?.trim()) {
    return prompt;
  }

  return `${prompt.trim()}

Pack consistency context:
${packConsistencyContext.trim()}

Use this context as a hard visual system. Keep the new SVG consistent with the pack while making this asset's metaphor distinct and readable.`;
}

function describeStyleSystem(styleSystem: StyleSystem): string {
  const palette = readRecord(styleSystem.palette);
  const paletteCount = palette ? Object.keys(palette).length : 0;
  const name = typeof styleSystem.name === 'string' && styleSystem.name.trim()
    ? styleSystem.name
    : 'Shared pack style';
  return `Style system: ${name} with ${paletteCount} palette roles`;
}

function deepMerge(base: unknown, patch: unknown): unknown {
  const baseRecord = readRecord(base);
  const patchRecord = readRecord(patch);
  if (!baseRecord || !patchRecord) {
    return patch;
  }

  const merged: Record<string, unknown> = { ...baseRecord };
  for (const [key, value] of Object.entries(patchRecord)) {
    merged[key] = deepMerge(baseRecord[key], value);
  }
  return merged;
}
