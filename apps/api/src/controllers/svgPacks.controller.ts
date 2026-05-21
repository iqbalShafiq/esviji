import type { FastifyReply, FastifyRequest } from 'fastify';
import { BuildSvgPackRequestSchema } from '@svg-builder/shared';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import type { SvgPackBuildOrchestrator } from '../orchestrators/SvgPackBuildOrchestrator.js';
import { logger } from '../utils/logger.js';
import { generateId } from '../utils/id.js';
import type { JobService } from '../services/JobService.js';

export class SvgPacksController {
  constructor(private orchestrator: SvgPackBuildOrchestrator, private jobService: JobService) {}

  async list(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const packs = await prisma.assetPack.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { assets: { select: { id: true } } },
      });

      reply.status(200).send({
        success: true,
        data: packs.map((pack) => ({
          id: pack.id,
          prompt: pack.prompt,
          assetType: pack.assetType,
          quantity: pack.quantity,
          status: pack.status,
          assetCount: pack.assets.length,
          createdAt: pack.createdAt,
          updatedAt: pack.updatedAt,
        })),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list packs');
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to list packs',
      });
    }
  }

  async create(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const parseResult = CreatePackRequestSchema.safeParse(request.body);
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
      const pack = await prisma.assetPack.create({
        data: {
          prompt: body.prompt,
          assetType: body.assetType,
          quantity: 0,
          style: body.style,
          status: 'completed',
          styleSystem: {
            source: 'manual',
            createdFor: 'asset_assignment',
          },
        },
      });

      reply.status(201).send({ success: true, data: pack });
    } catch (error) {
      logger.error({ error, body }, 'Failed to create pack');
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to create pack',
      });
    }
  }

  async build(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const parseResult = BuildSvgPackRequestSchema.safeParse(request.body);
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
    logger.info({ prompt: body.prompt, quantity: body.quantity }, 'Building SVG pack');

    try {
      const jobId = generateId('job');
      const job = await this.jobService.create({ jobId });

      void (async () => {
        try {
          await this.jobService.start(jobId);
          const pack = await this.orchestrator.build(body, {
            onStage: (stage, message, progress) => {
              void this.jobService.stage(jobId, stage, progress, message);
            },
            onLlmToken: (stage, token) => {
              void this.jobService.appendStageStream(jobId, stage, token);
            },
            onReasoning: (stage, message) => {
              void this.jobService.appendStageReasoning(jobId, stage, message);
            },
            onToolEvent: (stage, event) => {
              void this.jobService.appendToolEvent(jobId, stage, event);
            },
          });
          await this.jobService.attachPack(jobId, pack.id);
          await this.jobService.complete(jobId);
        } catch (error) {
          await this.jobService.fail(jobId, error instanceof Error ? error.message : 'Pack build failed');
          logger.error({ error, prompt: body.prompt }, 'Background pack build failed');
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
      logger.error({ error, body }, 'Failed to build SVG pack');
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to build pack',
      });
    }
  }

  async getById(
    request: FastifyRequest<{ Params: { packId: string } }>,
    reply: FastifyReply
  ): Promise<void> {
    const { packId } = request.params;

    try {
      const pack = await prisma.assetPack.findUnique({
        where: { id: packId },
        include: {
          assets: {
            include: { iterations: { orderBy: { iterationNumber: 'asc' } } },
          },
        },
      });

      if (!pack) {
        reply.status(404).send({
          statusCode: 404,
          error: 'Not Found',
          message: `Pack not found: ${packId}`,
        });
        return;
      }

      reply.status(200).send({
        success: true,
        data: {
          ...pack,
          assets: pack.assets.map((asset) => {
            const iterations = asset.iterations ?? [];
            return {
              ...asset,
              output: {
                width: asset.width,
                height: asset.height,
                formats: ['svg', 'png'],
              },
              currentStage: asset.status === 'completed' ? 'export' : undefined,
              classification: { assetType: asset.assetType },
              brief: iterations[0]?.brief,
              styleSystem: iterations[0]?.styleSystem,
              layoutBlueprint: iterations[0]?.layout,
              evaluation: {
                scores: asset.finalScores ?? iterations[iterations.length - 1]?.scores ?? {},
                issues: iterations[iterations.length - 1]?.issues ?? [],
                continueIteration: false,
              },
            };
          }),
        },
      });
    } catch (error) {
      logger.error({ error, packId }, 'Failed to get pack');
      reply.status(500).send({
        statusCode: 500,
        error: 'Internal Server Error',
        message: error instanceof Error ? error.message : 'Failed to get pack',
      });
    }
  }
}

const CreatePackRequestSchema = z.object({
  prompt: z.string().trim().min(1),
  assetType: z.string().trim().min(1).default('icon_pack'),
  style: z.string().trim().optional(),
});
