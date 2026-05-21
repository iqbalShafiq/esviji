import { StyleSystemSchema, type BuildSvgPackAssetRequest, type BuildSvgPackRequest, type CreativeBrief, type EvaluationResult, type StyleSystem } from '@svg-builder/shared';
import type { AssetPack, Asset, AssetIteration, PrismaClient } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { logger } from '../utils/logger.js';
import { readFile } from 'fs/promises';

import type { PackPlan, PackPlannerService } from '../services/PackPlannerService.js';
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
    private prisma: PrismaClient
  ) {}

  async build(
    request: BuildSvgPackRequest,
    options?: {
      onStage?: (stage: import('@svg-builder/shared').PipelineStage, message: string, progress: number) => void;
      onLlmToken?: (stage: import('@svg-builder/shared').PipelineStage, token: string) => void;
      onReasoning?: (stage: import('@svg-builder/shared').PipelineStage, message: string) => void;
      onToolEvent?: (
        stage: import('@svg-builder/shared').PipelineStage,
        event: { name: string; status: 'requested' | 'running' | 'completed' | 'failed'; message: string }
      ) => void;
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
      const classification = await this.classifier.classify(request.prompt, {
        explicitAssetType: request.assetType,
        quantity: request.quantity,
        width: request.output.width,
        height: request.output.height,
        useCase: request.style,
        hasReference: false,
        onToken: (token) => options?.onLlmToken?.('classify', token),
        onReasoning: (token) => options?.onReasoning?.('classify', token),
        onRetry: (attempt, maxRetries, error) => reportRetry('classify', attempt, maxRetries, error),
      });

      // Step 3: Create pack plan using packPlanner
      options?.onStage?.('brief', 'Planning pack items', 20);
      const packPlan = await this.packPlanner.plan(request.prompt, classification, {
        quantity: request.quantity,
        style: request.style,
        items: request.items,
        onToken: (token) => options?.onLlmToken?.('brief', token),
        onReasoning: (token) => options?.onReasoning?.('brief', token),
        onRetry: (attempt, maxRetries, error) => reportRetry('brief', attempt, maxRetries, error),
      });

      // Step 4: Build shared style system using styleBuilder (pass packPlan)
      options?.onStage?.('style', 'Building shared style system', 30);
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
        onReasoning: (token) => options?.onReasoning?.('style', token),
        onRetry: (attempt, maxRetries, error) => reportRetry('style', attempt, maxRetries, error),
      });

      await this.prisma.assetPack.update({
        where: { id: pack.id },
        data: { styleSystem: styleSystem as unknown as Prisma.JsonValue },
      });

      // Step 5: For each item in packPlan.items, call svgBuildOrchestrator.build
      options?.onStage?.('layout', 'Generating assets in pack', 40);
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
          onToolEvent: (stage, event) =>
            options?.onToolEvent?.(stage, {
              ...event,
              message: `[${item.name}] ${event.message}`,
            }),
        });

        logger.info({ packId: pack.id, assetId: asset.id }, 'Pack asset built');
      }

      // Step 6: Fetch all assets for pack
      let assets = await this.prisma.asset.findMany({
        where: { packId: pack.id },
      });

      // Step 7: Evaluate consistency using consistencyEvaluator
      options?.onStage?.('evaluate', 'Evaluating pack consistency', 88);
      let evaluations = await this.buildEvaluations(assets);

      let consistencyEvaluation = await this.consistencyEvaluator.evaluate(
        packPlan,
        styleSystem,
        assets,
        evaluations,
        {
          onToken: (token) => options?.onLlmToken?.('evaluate', token),
          onReasoning: (token) => options?.onReasoning?.('evaluate', token),
          onRetry: (attempt, maxRetries, error) => reportRetry('evaluate', attempt, maxRetries, error),
        }
      );

      // Step 8: For outlier assets (if any), iterate with suggested fixes
      if (consistencyEvaluation.outliers.length > 0) {
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
            onReasoning: (token) => options?.onReasoning?.('evaluate', token),
            onRetry: (attempt, maxRetries, error) => reportRetry('evaluate', attempt, maxRetries, error),
          }
        );
      }

      // Step 9: Optimize all SVGs
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

  async buildAssetIntoPack(
    packId: string,
    request: BuildSvgPackAssetRequest,
    options?: {
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
    const pack = await this.prisma.assetPack.findUnique({
      where: { id: packId },
      include: {
        assets: {
          include: {
            iterations: { orderBy: { iterationNumber: 'desc' }, take: 1 },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!pack) {
      throw new Error(`Pack not found: ${packId}`);
    }

    const styleSystem = this.readPackStyleSystem(pack) ?? this.readLatestAssetStyleSystem(pack.assets);
    if (!styleSystem) {
      throw new Error(`Pack ${packId} does not have enough style context to generate a consistent SVG`);
    }

    const packContext = this.buildPackConsistencyContext(pack, pack.assets);
    const asset = await this.svgBuildOrchestrator.build(
      {
        prompt: request.prompt,
        assetType: request.assetType ?? normalizePackAssetType(pack.assetType),
        mode: request.mode,
        style: request.style ?? pack.style ?? undefined,
        output: request.output,
        referenceImageUrl: request.referenceImageUrl,
        maxIterations: request.maxIterations,
      },
      {
        sharedStyleSystem: styleSystem,
        packConsistencyContext: packContext,
        packId,
        name: request.name,
        onStage: options?.onStage,
        onIterationRendered: options?.onIterationRendered,
        onLlmToken: options?.onLlmToken,
        onReasoning: options?.onReasoning,
        onToolEvent: options?.onToolEvent,
      }
    );

    await this.prisma.assetPack.update({
      where: { id: packId },
      data: {
        quantity: { increment: 1 },
        status: 'completed',
        styleSystem: styleSystem as unknown as Prisma.JsonValue,
      },
    });

    options?.onStage?.('evaluate', 'Re-scoring pack consistency', 88);
    await this.evaluateAndPersistConsistency(packId, styleSystem, options);

    const assets = await this.prisma.asset.findMany({ where: { packId } });
    options?.onStage?.('export', 'Refreshing pack ZIP', 97);
    const zipPath = await this.zipExport.createZip(
      packId,
      assets,
      {
        packName: pack.prompt,
        prompt: pack.prompt,
        assetType: pack.assetType,
        quantity: assets.length,
        style: pack.style,
      },
      styleSystem
    );
    await this.prisma.assetPack.update({
      where: { id: packId },
      data: { zipPath },
    });

    return asset;
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

  private async evaluateAndPersistConsistency(
    packId: string,
    styleSystem: StyleSystem,
    options?: {
      onLlmToken?: (stage: import('@svg-builder/shared').PipelineStage, token: string) => void;
      onReasoning?: (stage: import('@svg-builder/shared').PipelineStage, message: string) => void;
      onStage?: (stage: import('@svg-builder/shared').PipelineStage, message: string, progress: number) => void;
    }
  ): Promise<void> {
    const pack = await this.prisma.assetPack.findUnique({
      where: { id: packId },
      include: { assets: true },
    });
    if (!pack) return;

    const assets = pack.assets;
    if (assets.length < 2) {
      await this.prisma.assetPack.update({
        where: { id: packId },
        data: {
          consistencyScores: {
            styleConsistency: 100,
            strokeConsistency: 100,
            paletteConsistency: 100,
            gridConsistency: 100,
            metaphorDiversity: 100,
            overall: 100,
          },
        },
      });
      return;
    }

    const evaluations = await this.buildEvaluations(assets);
    const plan = this.createPackPlanFromAssets(pack, assets);
    const consistencyEvaluation = await this.consistencyEvaluator.evaluate(
      plan,
      styleSystem,
      assets,
      evaluations,
      {
        onToken: (token) => options?.onLlmToken?.('evaluate', token),
        onReasoning: (token) => options?.onReasoning?.('evaluate', token),
      }
    );

    await this.prisma.assetPack.update({
      where: { id: packId },
      data: {
        consistencyScores: consistencyEvaluation.consistencyScores as unknown as Prisma.JsonValue,
      },
    });
    options?.onStage?.('evaluate', `Consistency score: ${Math.round(consistencyEvaluation.consistencyScores.overall)}`, 92);
  }

  private readPackStyleSystem(pack: AssetPack): StyleSystem | undefined {
    if (!pack.styleSystem || pack.styleSystem === Prisma.JsonNull) return undefined;
    const parseResult = StyleSystemSchema.safeParse(pack.styleSystem);
    return parseResult.success ? parseResult.data : undefined;
  }

  private readLatestAssetStyleSystem(
    assets: Array<Asset & { iterations?: AssetIteration[] }>
  ): StyleSystem | undefined {
    for (const asset of assets) {
      const styleSystem = asset.iterations?.[0]?.styleSystem;
      const parseResult = StyleSystemSchema.safeParse(styleSystem);
      if (parseResult.success) return parseResult.data;
    }
    return undefined;
  }

  private buildPackConsistencyContext(
    pack: AssetPack,
    assets: Array<Asset & { iterations?: AssetIteration[] }>
  ): string {
    const examples = assets.slice(0, 8).map((asset, index) => {
      const latest = asset.iterations?.[0];
      const scores = latest?.scores ?? asset.finalScores ?? {};
      return `${index + 1}. ${asset.name ?? asset.prompt}: type=${asset.assetType}, size=${asset.width}x${asset.height}, scores=${JSON.stringify(scores)}`;
    });

    return [
      `Pack: ${pack.prompt}`,
      `Pack asset type: ${pack.assetType}`,
      pack.style ? `Pack style: ${pack.style}` : undefined,
      `Existing asset count: ${assets.length}`,
      examples.length > 0 ? `Existing SVG examples:\n${examples.join('\n')}` : undefined,
      'Preserve the shared palette, stroke logic, canvas density, corner radius, layer naming style, lighting/effects, and icon family rhythm.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  private createPackPlanFromAssets(pack: AssetPack, assets: Asset[]): PackPlan {
    return {
      packName: pack.prompt,
      assetType: pack.assetType,
      quantity: assets.length,
      items: assets.map((asset) => ({
        name: asset.name ?? asset.prompt,
        prompt: asset.prompt,
        metaphor: asset.name ?? asset.prompt,
        requiredElements: [],
        avoidElements: [],
        layoutHint: `${asset.width}x${asset.height} canvas`,
      })),
    };
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

function normalizePackAssetType(assetType: string): string {
  if (assetType.endsWith('_pack')) {
    return assetType.slice(0, -'_pack'.length) || 'icon';
  }
  if (assetType.endsWith('_set')) {
    return assetType.slice(0, -'_set'.length) || 'illustration';
  }
  return assetType || 'icon';
}
