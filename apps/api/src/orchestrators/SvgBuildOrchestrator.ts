import type {
  AssetTypeClassification,
  CreativeBrief,
  StyleSystem,
  LayoutBlueprint,
  EvaluationResult,
  RevisionPlan,
  BuildSvgAssetRequest,
  IterateSvgAssetRequest,
} from '@svg-builder/shared';
import type { Asset, AssetIteration } from '@prisma/client';
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
import { SvgGenerationWorkflowService } from '../agents/SvgGenerationWorkflowService.js';

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
      packId?: string;
      name?: string;
      onStage?: (stage: import('@svg-builder/shared').PipelineStage, message: string, progress: number) => void;
      onIterationRendered?: (iteration: number, previewUrl: string) => void;
      onLlmToken?: (stage: import('@svg-builder/shared').PipelineStage, token: string) => void;
      onReasoning?: (stage: import('@svg-builder/shared').PipelineStage, message: string) => void;
    }
  ): Promise<Asset> {
    const asset = await prisma.asset.create({
      data: {
        packId: options?.packId,
        name: options?.name,
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

      options?.onStage?.('classify', 'Classifying asset type', 10);
      options?.onReasoning?.('classify', 'Reading prompt, output size, requested style, and reference availability to choose the right asset pipeline.');
      // Step 2: Classify asset type
      const classification = await this.classifier.classify(request.prompt, {
        explicitAssetType: request.assetType,
        width: request.output.width,
        height: request.output.height,
        useCase: request.style,
        hasReference: !!request.referenceImageUrl,
        onToken: (token) => options?.onLlmToken?.('classify', token),
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
      options?.onReasoning?.(
        'classify',
        `Decision: use ${classification.assetType} pipeline; consistency requirement is ${classification.requiresConsistency ? 'enabled' : 'not required'}.`
      );

      // Step 3: Analyze reference if provided
      let referenceAnalysis: unknown | undefined;
      if (request.referenceImageUrl) {
        options?.onStage?.('brief', 'Analyzing reference image', 15);
        options?.onReasoning?.('brief', 'Reference image detected; extracting visual constraints before writing the creative brief.');
        referenceAnalysis = await this.referenceAnalyzer.analyze(request.referenceImageUrl, {
          onToken: (token) => options?.onLlmToken?.('brief', token),
          onRetry: (attempt, maxRetries, error) => reportRetry('brief', attempt, maxRetries, error),
        });
        logger.info({ assetId: asset.id }, 'Reference analysis completed');
      }

      options?.onStage?.('brief', 'Building creative brief', 20);
      options?.onReasoning?.('brief', 'Converting the prompt into concrete subject, mood, composition, and must-have visual constraints.');
      // Step 4: Build creative brief
      const brief = await this.briefBuilder.build(request.prompt, classification, {
        style: request.style,
        width: request.output.width,
        height: request.output.height,
        referenceAnalysis,
        onToken: (token) => options?.onLlmToken?.('brief', token),
        onRetry: (attempt, maxRetries, error) => reportRetry('brief', attempt, maxRetries, error),
      });
      options?.onStage?.(
        'brief',
        `Brief ready: subject="${brief.composition.mainFocus}" mood="${brief.style.mood}"`,
        24
      );
      options?.onReasoning?.(
        'brief',
        `Decision: focus on "${brief.composition.mainFocus}" with "${brief.style.mood}" mood so later flows have a stable target.`
      );

      options?.onStage?.('style', 'Building style system', 30);
      options?.onReasoning?.('style', 'Deriving palette, stroke/fill behavior, typography/icon rules, and reusable style constraints from the brief.');
      // Step 5: Build style system (use shared if provided)
      const styleSystem = options?.sharedStyleSystem ?? await this.styleBuilder.build(brief, classification, undefined, {
        onToken: (token) => options?.onLlmToken?.('style', token),
        onRetry: (attempt, maxRetries, error) => reportRetry('style', attempt, maxRetries, error),
      });
      options?.onStage?.(
        'style',
        `Style system: ${styleSystem.name} with ${Object.keys(styleSystem.palette).length} palette roles`,
        34
      );
      options?.onReasoning?.(
        'style',
        `Decision: use "${styleSystem.name}" style system with ${Object.keys(styleSystem.palette).length} palette roles.`
      );

      options?.onStage?.('layout', 'Planning asset strategy and layout', 40);
      options?.onReasoning?.('layout', 'Planning layer hierarchy, anchors, sizing, and viewBox-safe composition before generating SVG code.');
      // Step 6: Plan asset
      const assetPlan = await this.assetPlanner.plan(classification, brief, styleSystem, referenceAnalysis);

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
          onRetry: (attempt, maxRetries, error) => reportRetry('layout', attempt, maxRetries, error),
        }
      );
      options?.onStage?.(
        'layout',
        `Layout planned: ${layout.layers.length} layers on ${layout.canvas.width}x${layout.canvas.height}`,
        44
      );
      options?.onReasoning?.(
        'layout',
        `Decision: use ${layout.layers.length} planned layer(s) on a ${layout.canvas.width}x${layout.canvas.height} canvas.`
      );

      // Steps 8-13: Iteration loop
      let currentSvg = '';
      let currentLayout: LayoutBlueprint = layout;
      let evaluation: EvaluationResult | undefined;
      let lastRevisionPlan: RevisionPlan | undefined;
      let lastValidationSummary: { valid: boolean; errors: string[]; warnings: string[] } | undefined;

      for (let iteration = 1; iteration <= request.maxIterations; iteration++) {
        logger.info({ assetId: asset.id, iteration }, `Starting iteration ${iteration}`);

        options?.onStage?.('svg', `Generating SVG iteration ${iteration}`, 50);
        options?.onReasoning?.(
          'svg',
          `Generating iteration ${iteration}: converting layout layers and style rules into safe inline SVG markup.`
        );
        // Steps 8-9: Generate, validate, and preflight-render SVG with retry context.
        const initialSvg = await this.generateSvgDraft({
          iteration,
          brief,
          styleSystem,
          layout: currentLayout,
          currentSvg,
          lastRevisionPlan,
          onToken: (token) => options?.onLlmToken?.('svg', token),
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
          onToolEvent: (message) => {
            options?.onStage?.('svg', message, 52);
            options?.onReasoning?.('svg', `Tool event: ${message}`);
          },
          onRetry: (attempt, maxRetries, error) =>
            reportRetry('svg', attempt, maxRetries, error),
        });

        currentSvg = generated.svg;
        lastValidationSummary = generated.validationSummary;
        options?.onStage?.('svg', `SVG draft ready (${Math.round(currentSvg.length / 1024)} KB)`, 56);
        options?.onReasoning?.(
          'svg',
          `Decision: SVG passed validation and render preflight with ${generated.validationSummary.warnings.length} warning(s).`
        );

        options?.onStage?.('render', `Rendering preview iteration ${iteration}`, 60);
        options?.onReasoning?.('render', `Rendering iteration ${iteration} to PNG preview to verify the SVG is visually inspectable.`);
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
        options?.onReasoning?.(
          'evaluate',
          `Evaluating iteration ${iteration}: checking visual quality, technical correctness, and fit against the latest brief.`
        );
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
            svgSource: currentSvg,
            validationSummary: lastValidationSummary,
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
        options?.onReasoning?.(
          'evaluate',
          `Decision: evaluator found ${evaluation.issues.length} issue(s); continueIteration=${evaluation.continueIteration ? 'yes' : 'no'}.`
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

        logger.info(
          { assetId: asset.id, iteration, continueIteration: evaluation.continueIteration },
          'Iteration completed'
        );

        // Step 13: Check if we should continue
        if (!evaluation.continueIteration) {
          logger.info({ assetId: asset.id }, 'No more issues, stopping iteration loop');
          break;
        }

        if (iteration < request.maxIterations) {
          options?.onStage?.('revise', `Planning revision from iteration ${iteration}`, 80);
          options?.onReasoning?.(
            'revise',
            `Planning targeted fixes for ${evaluation.issues.length} evaluator issue(s) before the next SVG iteration.`
          );
          lastRevisionPlan = await this.revisionPlanner.plan(
            currentLayout,
            currentSvg,
            evaluation.issues,
            iteration,
            classification,
            {
              onToken: (token) => options?.onLlmToken?.('revise', token),
              onRetry: (attempt, maxRetries, error) => reportRetry('revise', attempt, maxRetries, error),
            }
          );

          // Apply layout updates if revision plan includes them
          if (lastRevisionPlan.updatedLayout && Object.keys(lastRevisionPlan.updatedLayout).length > 0) {
            currentLayout = {
              ...currentLayout,
              ...(lastRevisionPlan.updatedLayout as Record<string, unknown>),
            } as LayoutBlueprint;
            options?.onReasoning?.('revise', 'Decision: revision plan includes layout updates, so the next iteration will use the adjusted layout.');
          } else {
            options?.onReasoning?.('revise', 'Decision: revision plan keeps the layout stable and focuses on SVG/code-level fixes.');
          }
        }
      }

      options?.onStage?.('optimize', 'Sanitizing and optimizing final SVG', 90);
      options?.onReasoning?.('optimize', 'Sanitizing and optimizing final SVG before export to remove unsafe or redundant markup.');
      // Step 14: Sanitize final SVG
      const sanitizedSvg = sanitizeSvg(currentSvg);

      // Step 15: Optimize SVG
      const optimizationResult = await this.svgOptimizer.optimize(sanitizedSvg);

      options?.onStage?.('export', 'Saving final outputs', 98);
      options?.onReasoning?.('export', 'Saving final SVG and PNG outputs after the optimized SVG is accepted.');
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
          finalScores: evaluation
            ? (evaluation.scores as unknown as Prisma.JsonValue)
            : Prisma.JsonNull,
        },
      });

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

  async iterate(request: IterateSvgAssetRequest): Promise<Asset> {
    const asset = await prisma.asset.findUnique({
      where: { id: request.assetId },
      include: { iterations: { orderBy: { iterationNumber: 'desc' }, take: 1 } },
    });

    if (!asset) {
      throw new Error(`Asset not found: ${request.assetId}`);
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
  }): Promise<string> {
    if (input.iteration === 1) {
      return this.svgCoder.code(input.brief, input.styleSystem, input.layout, {
        onToken: input.onToken,
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
              String(transform.transform)
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
            input.lastRevisionPlan.notes
          }\nThe previous layer_transform plan failed, so regenerate the SVG instead. Transform errors:\n${transformErrors.join('\n')}`,
          onToken: input.onToken,
        });
      }

      return this.svgCoder.code(input.brief, input.styleSystem, input.layout, {
        previousSvg: input.currentSvg,
        revisionInstruction: input.lastRevisionPlan.notes,
        onToken: input.onToken,
      });
    }

    return this.svgCoder.code(input.brief, input.styleSystem, input.layout, {
      previousSvg: input.currentSvg,
      revisionInstruction: 'Improve based on previous evaluation.',
      onToken: input.onToken,
    });
  }
}
