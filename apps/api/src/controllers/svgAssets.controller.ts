import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  BuildSvgAssetRequestSchema,
  IterateSvgAssetRequestSchema,
  RenderSvgRequestSchema,
  OptimizeSvgRequestSchema,
  type BuildSvgAssetRequest,
  type IterateSvgAssetRequest,
  type RenderSvgRequest,
  type OptimizeSvgRequest,
} from '@svg-builder/shared';
import { prisma } from '../db/prisma.js';
import type { SvgBuildOrchestrator } from '../orchestrators/SvgBuildOrchestrator.js';
import type { SvgRenderService } from '../services/SvgRenderService.js';
import type { SvgOptimizerService } from '../services/SvgOptimizerService.js';
import type { JobService } from '../services/JobService.js';
import { logger } from '../utils/logger.js';
import { generateId } from '../utils/id.js';
import { QUALITY_THRESHOLDS } from '@svg-builder/shared';

export class SvgAssetsController {
  constructor(
    private orchestrator: SvgBuildOrchestrator,
    private renderService: SvgRenderService,
    private optimizerService: SvgOptimizerService,
    private jobService: JobService
  ) {}

  async build(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const parseResult = BuildSvgAssetRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid request body',
        details: parseResult.error.format(),
      });
      return;
    }

    const body = parseResult.data;
    logger.info({ prompt: body.prompt }, 'Building SVG asset');

    try {
      const jobId = generateId('job');
      const job = await this.jobService.create({ jobId });

      void (async () => {
        try {
          await this.jobService.start(jobId);
          const asset = await this.orchestrator.build(body, {
            onStage: (stage, message, progress) => {
              void this.jobService.stage(jobId, stage, progress, message);
            },
            onLlmToken: (stage, token) => {
              void this.jobService.appendStageStream(jobId, stage, token);
            },
            onReasoning: (stage, message) => {
              void this.jobService.appendStageReasoning(jobId, stage, message);
            },
            onIterationRendered: (iteration, previewUrl) => {
              void this.jobService.setLatestPreview(jobId, previewUrl, iteration);
            },
          });
          if (asset.id) await this.jobService.attachAsset(jobId, asset.id);
          await this.jobService.complete(jobId);
        } catch (error) {
          await this.jobService.fail(jobId, error instanceof Error ? error.message : 'Build failed');
          logger.error({ error, prompt: body.prompt }, 'Background build failed');
        }
      })();

      reply.status(202).send({
        success: true,
        data: {
          jobId: job.jobId,
          status: job.status,
          progress: job.progress,
        },
      });
    } catch (error) {
      logger.error({ error, body }, 'Failed to build SVG asset');
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to build asset',
      });
    }
  }

  async getJob(
    request: FastifyRequest<{ Params: { jobId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const job = await this.jobService.get(request.params.jobId);
    if (!job) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found' });
      return;
    }

    reply.status(200).send({ success: true, data: job });
  }

  async streamJob(
    request: FastifyRequest<{ Params: { jobId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { jobId } = request.params;
    const origin = typeof request.headers.origin === 'string' ? request.headers.origin : '*';
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin',
    });

    let sentLogs = 0;

    const write = async () => {
      const job = await this.jobService.get(jobId);
      if (!job) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: 'Job not found' })}\n\n`);
        reply.raw.end();
        return true;
      }

      reply.raw.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`);

      if (job.logs.length > sentLogs) {
        const newLogs = job.logs.slice(sentLogs);
        for (const log of newLogs) {
          reply.raw.write(`event: flow\ndata: ${JSON.stringify(log)}\n\n`);
        }
        sentLogs = job.logs.length;
      }

      if (job.status === 'completed' || job.status === 'failed') {
        reply.raw.end();
        return true;
      }
      return false;
    };

    const done = await write();
    if (done) return;

    const timer = setInterval(async () => {
      const finished = await write();
      if (finished) clearInterval(timer);
    }, 1000);

    request.raw.on('close', () => {
      clearInterval(timer);
    });
  }

  async iterate(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const parseResult = IterateSvgAssetRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid request body',
        details: parseResult.error.format(),
      });
      return;
    }

    const body = parseResult.data;
    logger.info({ assetId: body.assetId }, 'Iterating SVG asset');

    try {
      const asset = await this.orchestrator.iterate(body);
      reply.status(200).send({
        success: true,
        data: {
          assetId: asset.id,
          status: asset.status,
          currentIteration: asset.currentIteration,
          finalSvgPath: asset.finalSvgPath,
          finalPngPath: asset.finalPngPath,
          updatedAt: asset.updatedAt,
        },
      });
    } catch (error) {
      logger.error({ error, body }, 'Failed to iterate SVG asset');
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to iterate asset',
      });
    }
  }

  async render(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const parseResult = RenderSvgRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid request body',
        details: parseResult.error.format(),
      });
      return;
    }

    const body = parseResult.data;

    try {
      const { pngUrl } = await this.renderService.render(
        body.svg,
        'render-request',
        0,
        body.width,
        body.height
      );
      reply.status(200).send({
        success: true,
        data: {
          pngUrl,
        },
      });
    } catch (error) {
      logger.error({ error, body }, 'Failed to render SVG');
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to render SVG',
      });
    }
  }

  async optimize(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const parseResult = OptimizeSvgRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      reply.status(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: 'Invalid request body',
        details: parseResult.error.format(),
      });
      return;
    }

    const body = parseResult.data;

    try {
      const result = await this.optimizerService.optimize(body.svg);
      reply.status(200).send({
        success: true,
        data: {
          optimizedSvg: result.optimizedSvg,
          sizeBeforeBytes: result.sizeBeforeBytes,
          sizeAfterBytes: result.sizeAfterBytes,
        },
      });
    } catch (error) {
      logger.error({ error, body }, 'Failed to optimize SVG');
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to optimize SVG',
      });
    }
  }

  async getById(
    request: FastifyRequest<{ Params: { assetId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { assetId } = request.params;

    try {
      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
        include: { iterations: { orderBy: { iterationNumber: 'asc' } } },
      });

      if (!asset) {
        reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Asset not found: ${assetId}`,
        });
        return;
      }

      reply.status(200).send({
        success: true,
        data: {
          ...asset,
          currentStage: asset.status === 'completed' ? 'export' : undefined,
          classification: { assetType: asset.assetType },
          brief: asset.iterations[0]?.brief,
          styleSystem: asset.iterations[0]?.styleSystem,
          layoutBlueprint: asset.iterations[0]?.layout,
          evaluation: {
            scores: asset.finalScores ?? asset.iterations[asset.iterations.length - 1]?.scores ?? {},
            issues: asset.iterations[asset.iterations.length - 1]?.issues ?? [],
            continueIteration: false,
          },
          qualityGates: this.buildQualityGates(asset),
        },
      });
    } catch (error) {
      logger.error({ error, assetId }, 'Failed to get asset');
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to get asset',
      });
    }
  }

  private buildQualityGates(asset: {
    assetType: string;
    finalSvgPath: string | null;
    finalPngPath: string | null;
    iterations: Array<{ svgDraftPath: string | null; scores: unknown }>;
  }): Array<{ name: string; passed: boolean; message?: string }> {
    const latest = asset.iterations[asset.iterations.length - 1];
    const scores = (latest?.scores ?? {}) as Record<string, number>;
    const thresholds =
      QUALITY_THRESHOLDS[asset.assetType as keyof typeof QUALITY_THRESHOLDS] ?? QUALITY_THRESHOLDS.icon;
    const meetsThresholds = Object.entries(thresholds).every(([k, v]) => {
      const score = scores[k];
      return typeof score === 'number' ? score >= v : true;
    });

    return [
      { name: 'Valid XML SVG', passed: Boolean(asset.finalSvgPath) },
      { name: 'Successful PNG render', passed: Boolean(asset.finalPngPath) },
      { name: 'Stable layer IDs', passed: Boolean(latest?.svgDraftPath?.includes('id=')) },
      { name: 'Asset thresholds passed', passed: meetsThresholds },
    ];
  }
}
