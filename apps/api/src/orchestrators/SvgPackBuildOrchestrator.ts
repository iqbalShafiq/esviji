import type { BuildSvgPackRequest, CreativeBrief, EvaluationResult } from '@svg-builder/shared';
import type { AssetPack, Asset, AssetIteration } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { readFile } from 'fs/promises';

import type { PackPlannerService } from '../services/PackPlannerService.js';
import type { AssetTypeClassifierService } from '../services/AssetTypeClassifierService.js';
import type { StyleSystemBuilderService } from '../services/StyleSystemBuilderService.js';
import type { SvgBuildOrchestrator } from '../orchestrators/SvgBuildOrchestrator.js';
import type { PackConsistencyEvaluatorService } from '../services/PackConsistencyEvaluatorService.js';
import type { ZipExportService } from '../services/ZipExportService.js';
import type { StorageService } from '../services/StorageService.js';
import type { SvgOptimizerService } from '../services/SvgOptimizerService.js';

export class SvgPackBuildOrchestrator {
  constructor(
    private packPlanner: PackPlannerService,
    private classifier: AssetTypeClassifierService,
    private styleBuilder: StyleSystemBuilderService,
    private svgBuildOrchestrator: SvgBuildOrchestrator,
    private consistencyEvaluator: PackConsistencyEvaluatorService,
    private zipExport: ZipExportService,
    private storage: StorageService,
    private svgOptimizer: SvgOptimizerService,
    private prisma: {
      assetPack: {
        create(args: { data: Partial<AssetPack> }): Promise<AssetPack>;
        findUnique(args: { where: { id: string }; include?: { assets?: boolean } }): Promise<(AssetPack & { assets: Asset[] }) | null>;
        update(args: { where: { id: string }; data: Partial<AssetPack> }): Promise<AssetPack>;
      };
      asset: {
        findMany(args?: { where?: { packId?: string } }): Promise<Asset[]>;
      };
      assetIteration: {
        findMany(args?: {
          where?: { assetId?: string };
          orderBy?: { iterationNumber?: 'desc' | 'asc' };
        }): Promise<AssetIteration[]>;
      };
    }
  ) {}

  async build(
    request: BuildSvgPackRequest,
    options?: {
      onStage?: (stage: import('@svg-builder/shared').PipelineStage, message: string, progress: number) => void;
      onLlmToken?: (stage: import('@svg-builder/shared').PipelineStage, token: string) => void;
      onReasoning?: (stage: import('@svg-builder/shared').PipelineStage, message: string) => void;
    }
  ): Promise<AssetPack> {
    // Step 1: Create AssetPack record in DB with status "processing"
    const pack = await this.prisma.assetPack.create({
      data: {
        prompt: request.prompt,
        assetType: request.assetType,
        quantity: request.quantity,
        style: request.style,
        status: 'processing',
        styleSystem: Prisma.JsonNull,
      },
    });

    logger.info({ packId: pack.id }, 'AssetPack created, starting pack pipeline');

    try {
      const reportRetry = (
        stage: import('@svg-builder/shared').PipelineStage,
        attempt: number,
        maxRetries: number,
        error: Error
      ) => {
        options?.onReasoning?.(
          stage,
          `Retry ${attempt}/${maxRetries}: previous error was "${error.message}". The next attempt receives this context to avoid repeating it.`
        );
        options?.onStage?.(
          stage,
          `Retrying ${stage} flow ${attempt}/${maxRetries} after error: ${error.message}`,
          this.retryProgressForStage(stage)
        );
      };

      // Step 2: Classify asset type using classifier
      options?.onStage?.('classify', 'Classifying pack type', 10);
      options?.onReasoning?.('classify', 'Reading pack prompt, quantity, output size, and style to classify the shared asset family.');
      const classification = await this.classifier.classify(request.prompt, {
        explicitAssetType: request.assetType,
        quantity: request.quantity,
        width: request.output.width,
        height: request.output.height,
        useCase: request.style,
        hasReference: false,
        onToken: (token) => options?.onLlmToken?.('classify', token),
        onRetry: (attempt, maxRetries, error) => reportRetry('classify', attempt, maxRetries, error),
      });
      options?.onReasoning?.('classify', `Decision: pack will use ${classification.assetType} assets.`);

      // Step 3: Create pack plan using packPlanner
      options?.onStage?.('brief', 'Planning pack items', 20);
      options?.onReasoning?.('brief', 'Expanding the pack prompt into individual item prompts while preserving set-level coherence.');
      const packPlan = await this.packPlanner.plan(request.prompt, classification, {
        quantity: request.quantity,
        style: request.style,
        items: request.items,
        onToken: (token) => options?.onLlmToken?.('brief', token),
        onRetry: (attempt, maxRetries, error) => reportRetry('brief', attempt, maxRetries, error),
      });
      options?.onReasoning?.('brief', `Decision: planned ${packPlan.items.length} pack item(s) under "${packPlan.packName}".`);

      // Step 4: Build shared style system using styleBuilder (pass packPlan)
      options?.onStage?.('style', 'Building shared style system', 30);
      options?.onReasoning?.('style', 'Building one shared visual language so generated pack assets look like a family.');
      const brief: CreativeBrief = {
        assetType: classification.assetType,
        style: {
          category: request.style ?? 'flat',
          texture: 'smooth',
          lineQuality: 'clean',
          palette: ['#000000'],
          mood: 'neutral',
        },
        composition: {
          canvas: 'square',
          subject: request.prompt,
          negativeSpace: 'balanced',
          mainFocus: 'center',
        },
        constraints: {
          mustBeSvg: true,
          noExternalImages: true,
          safeSvgOnly: true,
          editableLayers: true,
          smallSizeReadable: classification.requiresSmallSizeReadability ?? false,
        },
      };

      const styleSystem = await this.styleBuilder.build(brief, classification, packPlan, {
        onToken: (token) => options?.onLlmToken?.('style', token),
        onRetry: (attempt, maxRetries, error) => reportRetry('style', attempt, maxRetries, error),
      });
      options?.onReasoning?.('style', `Decision: use shared style system "${styleSystem.name}" for every pack item.`);

      await this.prisma.assetPack.update({
        where: { id: pack.id },
        data: { styleSystem: styleSystem as unknown as Prisma.JsonValue },
      });

      // Step 5: For each item in packPlan.items, call svgBuildOrchestrator.build
      options?.onStage?.('layout', 'Generating assets in pack', 40);
      options?.onReasoning?.('layout', 'Generating each pack item with the shared style system and item-specific prompt.');
      for (const item of packPlan.items) {
        const assetRequest = {
          prompt: item.prompt,
          assetType: packPlan.assetType,
          mode: 'direct' as const,
          style: request.style,
          output: request.output,
          maxIterations: request.maxIterations,
        };

        const asset = await this.svgBuildOrchestrator.build(assetRequest, {
          sharedStyleSystem: styleSystem,
          packId: pack.id,
          name: item.name,
          onStage: (stage, message, progress) => {
            const adjusted = Math.min(85, 40 + Math.floor(progress * 0.45));
            options?.onStage?.(stage, `[${item.name}] ${message}`, adjusted);
          },
          onLlmToken: (stage, token) => options?.onLlmToken?.(stage, token),
          onReasoning: (stage, message) => options?.onReasoning?.(stage, `[${item.name}] ${message}`),
        });

        logger.info({ packId: pack.id, assetId: asset.id }, 'Pack asset built');
      }

      // Step 6: Fetch all assets for pack
      let assets = await this.prisma.asset.findMany({
        where: { packId: pack.id },
      });

      // Step 7: Evaluate consistency using consistencyEvaluator
      options?.onStage?.('evaluate', 'Evaluating pack consistency', 88);
      options?.onReasoning?.('evaluate', 'Evaluating whether generated assets are visually consistent as a pack.');
      let evaluations = await this.buildEvaluations(assets);

      let consistencyEvaluation = await this.consistencyEvaluator.evaluate(
        packPlan,
        styleSystem,
        assets,
        evaluations,
        {
          onToken: (token) => options?.onLlmToken?.('evaluate', token),
          onRetry: (attempt, maxRetries, error) => reportRetry('evaluate', attempt, maxRetries, error),
        }
      );

      // Step 8: For outlier assets (if any), iterate with suggested fixes
      if (consistencyEvaluation.outliers.length > 0) {
        options?.onReasoning?.(
          'evaluate',
          `Decision: found ${consistencyEvaluation.outliers.length} outlier(s); applying suggested fixes and re-evaluating.`
        );
        logger.info(
          { packId: pack.id, outlierCount: consistencyEvaluation.outliers.length },
          'Outliers detected, iterating fixes'
        );

        for (const outlier of consistencyEvaluation.outliers) {
          try {
            await this.svgBuildOrchestrator.iterate({
              assetId: outlier.assetId,
              instruction: outlier.suggestedFixes.join('\n'),
            });
          } catch (error) {
            logger.error(
              { packId: pack.id, assetId: outlier.assetId, error },
              'Failed to iterate outlier fix'
            );
          }
        }

        // Re-fetch assets and re-evaluate after fixes
        assets = await this.prisma.asset.findMany({
          where: { packId: pack.id },
        });

        evaluations = await this.buildEvaluations(assets);

        consistencyEvaluation = await this.consistencyEvaluator.evaluate(
          packPlan,
          styleSystem,
          assets,
          evaluations,
          {
            onToken: (token) => options?.onLlmToken?.('evaluate', token),
            onRetry: (attempt, maxRetries, error) => reportRetry('evaluate', attempt, maxRetries, error),
          }
        );
      } else {
        options?.onReasoning?.('evaluate', 'Decision: no pack outliers detected after consistency evaluation.');
      }

      // Step 9: Optimize all SVGs
      options?.onReasoning?.('optimize', `Optimizing ${assets.length} SVG asset(s) before creating the ZIP export.`);
      for (const asset of assets) {
        if (asset.finalSvgPath) {
          try {
            const svgPath = this.storage.getAssetFilePath(asset.id, 'final.svg');
            const svgContent = await readFile(svgPath, 'utf-8');
            const optimizationResult = await this.svgOptimizer.optimize(svgContent);
            await this.storage.saveAssetFile(asset.id, 'final.svg', optimizationResult.optimizedSvg);
          } catch (error) {
            logger.error(
              { packId: pack.id, assetId: asset.id, error },
              'Failed to optimize asset SVG'
            );
          }
        }
      }

      // Step 10: Generate ZIP using zipExport
      options?.onStage?.('export', 'Exporting pack ZIP', 97);
      options?.onReasoning?.('export', 'Creating final ZIP bundle with generated assets and pack metadata.');
      const zipPath = await this.zipExport.createZip(
        pack.id,
        assets,
        {
          packName: packPlan.packName,
          prompt: request.prompt,
          assetType: classification.assetType,
          quantity: request.quantity,
          style: request.style,
        },
        styleSystem
      );

      // Step 11: Update AssetPack status to "completed", save zipPath and consistencyScores
      await this.prisma.assetPack.update({
        where: { id: pack.id },
        data: {
          status: 'completed',
          zipPath,
          consistencyScores: consistencyEvaluation.consistencyScores as unknown as Prisma.JsonValue,
        },
      });

      const updatedPack = await this.prisma.assetPack.findUnique({
        where: { id: pack.id },
        include: { assets: true },
      });

      if (!updatedPack) {
        throw new Error(`Failed to retrieve updated pack: ${pack.id}`);
      }

      logger.info({ packId: pack.id }, 'Pack pipeline completed successfully');
      return updatedPack;
    } catch (error) {
      logger.error({ packId: pack.id, error }, 'Pack pipeline failed');

      await this.prisma.assetPack.update({
        where: { id: pack.id },
        data: { status: 'failed' },
      });

      throw error;
    }
  }

  private async buildEvaluations(assets: Asset[]): Promise<EvaluationResult[]> {
    const evaluations: EvaluationResult[] = [];

    for (const asset of assets) {
      const iterations = await this.prisma.assetIteration.findMany({
        where: { assetId: asset.id },
        orderBy: { iterationNumber: 'desc' },
      });

      const latestIteration = iterations[0];
      if (latestIteration && latestIteration.scores) {
        evaluations.push({
          scores: latestIteration.scores as unknown as Record<string, number>,
          issues: (latestIteration.issues ?? []) as unknown as EvaluationResult['issues'],
          continueIteration: false,
        });
      } else if (asset.finalScores) {
        evaluations.push({
          scores: asset.finalScores as unknown as Record<string, number>,
          issues: [],
          continueIteration: false,
        });
      }
    }

    return evaluations;
  }

  private retryProgressForStage(stage: import('@svg-builder/shared').PipelineStage): number {
    const progressByStage: Record<import('@svg-builder/shared').PipelineStage, number> = {
      classify: 11,
      brief: 21,
      style: 31,
      layout: 41,
      svg: 52,
      render: 61,
      evaluate: 89,
      revise: 90,
      optimize: 94,
      export: 98,
    };
    return progressByStage[stage];
  }
}
