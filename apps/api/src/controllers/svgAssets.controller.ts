import type { FastifyReply, FastifyRequest } from 'fastify';
import {
  BuildSvgAssetRequestSchema,
  IterateSvgAssetRequestSchema,
  RenderSvgRequestSchema,
  OptimizeSvgRequestSchema,
  QUALITY_THRESHOLDS,
} from '@svg-builder/shared';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import type { SvgBuildOrchestrator } from '../orchestrators/SvgBuildOrchestrator.js';
import type { SvgRenderService } from '../services/SvgRenderService.js';
import type { SvgOptimizerService } from '../services/SvgOptimizerService.js';
import type { JobService } from '../services/JobService.js';
import { TokenService } from '../services/TokenService.js';
import { getOptionalAuthUser, requireAuthUser } from '../auth/requestAuth.js';
import { logger } from '../utils/logger.js';
import { generateId } from '../utils/id.js';

export class SvgAssetsController {
  private tokenService = new TokenService();

  constructor(
    private orchestrator: SvgBuildOrchestrator,
    private renderService: SvgRenderService,
    private optimizerService: SvgOptimizerService,
    private jobService: JobService
  ) {}

  async build(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;

    const parseResult = BuildSvgAssetRequestSchema.safeParse(request.body);
    if (!parseResult.success) return sendValidationError(reply, parseResult.error.format());

    const body = parseResult.data;
    const reservedTokens = await this.reserveOrReply(user.id, body.maxIterations ?? 15, reply);
    if (reservedTokens === undefined) return;

    try {
      const jobId = generateId('job');
      const job = await this.jobService.create({ jobId });

      void (async () => {
        try {
          await this.jobService.start(jobId);
          const asset = await this.orchestrator.build(body, {
            ownerId: user.id,
            visibility: body.visibility,
            onStage: (stage, message, progress) => {
              if (shouldClearStageOutput(message)) void this.jobService.clearStageOutput(jobId, stage);
              void this.jobService.stage(jobId, stage, progress, message);
            },
            onLlmToken: (stage, token) => void this.jobService.appendStageStream(jobId, stage, token),
            onReasoning: (stage, message) => void this.jobService.appendStageReasoning(jobId, stage, message),
            onToolEvent: (stage, event) => void this.jobService.appendToolEvent(jobId, stage, event),
            onIterationRendered: (iteration, previewUrl) => void this.jobService.setLatestPreview(jobId, previewUrl, iteration),
          });
          await this.tokenService.refund(user.id, Math.max(0, reservedTokens - asset.currentIteration));
          await this.jobService.attachAsset(jobId, asset.id);
          await this.jobService.complete(jobId);
        } catch (error) {
          await this.tokenService.refund(user.id, reservedTokens);
          await this.jobService.fail(jobId, error instanceof Error ? error.message : 'Build failed');
          logger.error({ error, prompt: body.prompt }, 'Background build failed');
        }
      })();

      reply.status(202).send({ success: true, data: { jobId: job.jobId, status: job.status, progress: job.progress } });
    } catch (error) {
      await this.tokenService.refund(user.id, reservedTokens);
      logger.error({ error, body }, 'Failed to build SVG asset');
      sendServerError(reply, error, 'Failed to build asset');
    }
  }

  async getJob(request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply): Promise<void> {
    const job = await this.jobService.get(request.params.jobId);
    if (!job) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Job not found' });
    reply.status(200).send({ success: true, data: job });
  }

  async streamJob(request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply): Promise<void> {
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
    let sentStreamSequence: number | undefined;
    const write = async () => {
      const job = await this.jobService.get(jobId);
      if (!job) {
        reply.raw.write(`event: error\ndata: ${JSON.stringify({ message: 'Job not found' })}\n\n`);
        reply.raw.end();
        return true;
      }
      if (sentStreamSequence === undefined) {
        sentStreamSequence = job.streamEvents?.[job.streamEvents.length - 1]?.sequence ?? 0;
      } else {
        const events = await this.jobService.getStreamEventsAfter(jobId, sentStreamSequence);
        for (const event of events) {
          reply.raw.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
          sentStreamSequence = event.sequence;
        }
      }
      reply.raw.write(`event: job\ndata: ${JSON.stringify(job)}\n\n`);
      if (job.logs.length > sentLogs) {
        for (const log of job.logs.slice(sentLogs)) reply.raw.write(`event: flow\ndata: ${JSON.stringify(log)}\n\n`);
        sentLogs = job.logs.length;
      }
      if (job.status === 'completed' || job.status === 'failed') {
        reply.raw.end();
        return true;
      }
      return false;
    };

    if (await write()) return;
    const timer = setInterval(async () => {
      if (await write()) clearInterval(timer);
    }, 100);
    request.raw.on('close', () => clearInterval(timer));
  }

  async iterate(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    const parseResult = IterateSvgAssetRequestSchema.safeParse(request.body);
    if (!parseResult.success) return sendValidationError(reply, parseResult.error.format());

    const reservedTokens = await this.reserveOrReply(user.id, 1, reply);
    if (reservedTokens === undefined) return;

    try {
      const asset = await this.orchestrator.iterate(parseResult.data, { ownerId: user.id, isAdmin: user.role === 'admin' });
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
      await this.tokenService.refund(user.id, reservedTokens);
      logger.error({ error, body: parseResult.data }, 'Failed to iterate SVG asset');
      sendServerError(reply, error, 'Failed to iterate asset');
    }
  }

  async render(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const parseResult = RenderSvgRequestSchema.safeParse(request.body);
    if (!parseResult.success) return sendValidationError(reply, parseResult.error.format());
    try {
      const { pngUrl } = await this.renderService.render(parseResult.data.svg, 'render-request', 0, parseResult.data.width, parseResult.data.height);
      reply.status(200).send({ success: true, data: { pngUrl } });
    } catch (error) {
      sendServerError(reply, error, 'Failed to render SVG');
    }
  }

  async optimize(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const parseResult = OptimizeSvgRequestSchema.safeParse(request.body);
    if (!parseResult.success) return sendValidationError(reply, parseResult.error.format());
    try {
      const result = await this.optimizerService.optimize(parseResult.data.svg);
      reply.status(200).send({ success: true, data: { optimizedSvg: result.optimizedSvg, sizeBeforeBytes: result.sizeBeforeBytes, sizeAfterBytes: result.sizeAfterBytes } });
    } catch (error) {
      sendServerError(reply, error, 'Failed to optimize SVG');
    }
  }

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = await getOptionalAuthUser(request);
    try {
      const assets = await prisma.asset.findMany({
        where: visibilityWhere(user?.id, user?.role),
        orderBy: { createdAt: 'desc' },
        include: { owner: true, pack: true, iterations: { orderBy: { iterationNumber: 'desc' }, take: 1 } },
      });
      reply.status(200).send({ success: true, data: assets.map((asset: any) => this.serializeListAsset(asset)) });
    } catch (error) {
      logger.error({ error }, 'Failed to list assets');
      sendServerError(reply, error, 'Failed to list assets');
    }
  }

  async getById(request: FastifyRequest<{ Params: { assetId: string } }>, reply: FastifyReply): Promise<void> {
    const user = await getOptionalAuthUser(request);
    const { assetId } = request.params;
    try {
      const asset = await prisma.asset.findUnique({
        where: { id: assetId },
        include: { owner: true, pack: true, iterations: { orderBy: { iterationNumber: 'asc' } } },
      });
      if (!asset) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Asset not found: ${assetId}` });
      if (!canReadOwned(asset, user?.id, user?.role)) return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You cannot access this asset' });
      reply.status(200).send({ success: true, data: this.serializeAssetDetail(asset, user?.id) });
    } catch (error) {
      logger.error({ error, assetId }, 'Failed to get asset');
      sendServerError(reply, error, 'Failed to get asset');
    }
  }

  async updatePack(request: FastifyRequest<{ Params: { assetId: string }; Body: unknown }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    const { assetId } = request.params;
    const parseResult = UpdateAssetPackRequestSchema.safeParse(request.body);
    if (!parseResult.success) return sendValidationError(reply, parseResult.error.format());
    const { packId } = parseResult.data;

    try {
      const existingAsset = await prisma.asset.findUnique({ where: { id: assetId }, select: { packId: true, ownerId: true } });
      if (!existingAsset) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Asset not found: ${assetId}` });
      if (!canWriteOwned(existingAsset, user.id, user.role)) return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only update assets you own' });
      if (packId) {
        const pack = await prisma.assetPack.findUnique({ where: { id: packId }, select: { id: true, ownerId: true } });
        if (!pack) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Pack not found: ${packId}` });
        if (!canWriteOwned(pack, user.id, user.role)) return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only assign to packs you own' });
      }
      await prisma.asset.update({ where: { id: assetId }, data: { packId } });
      const affectedPackIds = Array.from(new Set([existingAsset.packId, packId].filter((id): id is string => Boolean(id))));
      await Promise.all(affectedPackIds.map((id) => updatePackQuantity(id)));
      const asset = await prisma.asset.findUnique({ where: { id: assetId }, include: { owner: true, pack: true, iterations: { orderBy: { iterationNumber: 'asc' } } } });
      reply.status(200).send({ success: true, data: asset ? this.serializeAssetDetail(asset, user.id) : null });
    } catch (error) {
      logger.error({ error, assetId, packId }, 'Failed to update asset pack');
      sendServerError(reply, error, 'Failed to update asset pack');
    }
  }

  async updateVisibility(request: FastifyRequest<{ Params: { assetId: string }; Body: unknown }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    const parsed = VisibilitySchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error.format());
    const asset = await prisma.asset.findUnique({ where: { id: request.params.assetId }, select: { ownerId: true } });
    if (!asset) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Asset not found' });
    if (!canWriteOwned(asset, user.id, user.role)) return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only update assets you own' });
    const updated = await prisma.asset.update({ where: { id: request.params.assetId }, data: { visibility: parsed.data.visibility } });
    reply.status(200).send({ success: true, data: updated });
  }

  async clone(request: FastifyRequest<{ Params: { assetId: string } }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    const source = await prisma.asset.findUnique({ where: { id: request.params.assetId }, include: { iterations: { orderBy: { iterationNumber: 'asc' } } } });
    if (!source) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Asset not found' });
    if (source.visibility !== 'public' && source.ownerId !== user.id && user.role !== 'admin') return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Only public assets can be cloned' });

    const cloned = await prisma.asset.create({
      data: {
        ownerId: user.id,
        sourceAssetId: source.id,
        name: source.name,
        prompt: source.prompt,
        assetType: source.assetType,
        mode: source.mode,
        style: source.style,
        visibility: 'private',
        status: source.status,
        width: source.width,
        height: source.height,
        referenceImageUrl: source.referenceImageUrl,
        finalSvgPath: source.finalSvgPath,
        finalPngPath: source.finalPngPath,
        finalDebugPngPath: source.finalDebugPngPath,
        currentIteration: source.currentIteration,
        bestIterationNumber: source.bestIterationNumber,
        finalScores: source.finalScores ?? Prisma.JsonNull,
        iterations: { create: source.iterations.map((it: any) => ({ iterationNumber: it.iterationNumber, brief: it.brief, styleSystem: it.styleSystem, referenceAnalysis: it.referenceAnalysis ?? Prisma.JsonNull, layout: it.layout, svgDraftPath: it.svgDraftPath, pngPreviewPath: it.pngPreviewPath, debugPreviewPath: it.debugPreviewPath, scores: it.scores ?? Prisma.JsonNull, issues: it.issues ?? Prisma.JsonNull, actionTaken: it.actionTaken ?? Prisma.JsonNull })) },
      },
    });
    reply.status(201).send({ success: true, data: { id: cloned.id } });
  }

  async delete(request: FastifyRequest<{ Params: { assetId: string } }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    const { assetId } = request.params;
    try {
      const asset = await prisma.asset.findUnique({ where: { id: assetId }, select: { id: true, packId: true, ownerId: true } });
      if (!asset) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Asset not found: ${assetId}` });
      if (!canWriteOwned(asset, user.id, user.role)) return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only delete assets you own' });
      await prisma.$transaction([prisma.assetIteration.deleteMany({ where: { assetId } }), prisma.asset.delete({ where: { id: assetId } })]);
      if (asset.packId) await updatePackQuantity(asset.packId);
      reply.status(200).send({ success: true, data: { id: assetId } });
    } catch (error) {
      logger.error({ error, assetId }, 'Failed to delete asset');
      sendServerError(reply, error, 'Failed to delete asset');
    }
  }

  private async reserveOrReply(userId: string, amount: number, reply: FastifyReply): Promise<number | undefined> {
    try {
      return await this.tokenService.reserve(userId, amount);
    } catch (error) {
      reply.status(402).send({ statusCode: 402, error: 'Payment Required', message: error instanceof Error ? error.message : 'Insufficient tokens' });
      return undefined;
    }
  }

  private serializeListAsset(asset: any) {
    const latestIteration = asset.iterations?.[0];
    return {
      id: asset.id,
      ownerId: asset.ownerId,
      owner: asset.owner ? { username: asset.owner.username, email: asset.owner.email } : null,
      isOwner: false,
      name: asset.name,
      prompt: asset.prompt,
      assetType: asset.assetType,
      mode: asset.mode,
      style: asset.style,
      visibility: asset.visibility,
      status: asset.status,
      width: asset.width,
      height: asset.height,
      currentIteration: asset.currentIteration,
      bestIterationNumber: asset.bestIterationNumber,
      finalPngPath: asset.finalPngPath,
      packId: asset.packId,
      pack: asset.pack ? { id: asset.pack.id, prompt: asset.pack.prompt, assetType: asset.pack.assetType, quantity: asset.pack.quantity, status: asset.pack.status, visibility: asset.pack.visibility, createdAt: asset.pack.createdAt, updatedAt: asset.pack.updatedAt } : null,
      createdAt: asset.createdAt,
      updatedAt: asset.updatedAt,
      latestScores: latestIteration?.scores ?? {},
      latestPngPreviewPath: latestIteration?.pngPreviewPath ?? undefined,
    };
  }

  private serializeAssetDetail(asset: any, viewerId?: string) {
    return {
      ...asset,
      isOwner: Boolean(viewerId && asset.ownerId === viewerId),
      owner: asset.owner ? { username: asset.owner.username, email: asset.owner.email } : null,
      pack: asset.pack ? { id: asset.pack.id, prompt: asset.pack.prompt, assetType: asset.pack.assetType, quantity: asset.pack.quantity, status: asset.pack.status, visibility: asset.pack.visibility, createdAt: asset.pack.createdAt, updatedAt: asset.pack.updatedAt } : null,
      currentStage: asset.status === 'completed' ? 'export' : undefined,
      classification: { assetType: asset.assetType },
      brief: asset.iterations[0]?.brief,
      styleSystem: asset.iterations[0]?.styleSystem,
      layoutBlueprint: asset.iterations[0]?.layout,
      evaluation: { scores: asset.finalScores ?? asset.iterations[asset.iterations.length - 1]?.scores ?? {}, issues: asset.iterations[asset.iterations.length - 1]?.issues ?? [], continueIteration: false },
      qualityGates: this.buildQualityGates(asset),
    };
  }

  private buildQualityGates(asset: { assetType: string; finalSvgPath: string | null; finalPngPath: string | null; iterations: Array<{ svgDraftPath: string | null; scores: unknown }> }): Array<{ name: string; passed: boolean; message?: string }> {
    const latest = asset.iterations[asset.iterations.length - 1];
    const scores = (latest?.scores ?? {}) as Record<string, number>;
    const thresholds = QUALITY_THRESHOLDS[asset.assetType as keyof typeof QUALITY_THRESHOLDS] ?? QUALITY_THRESHOLDS.icon;
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

const UpdateAssetPackRequestSchema = z.object({ packId: z.string().min(1).nullable() });
const VisibilitySchema = z.object({ visibility: z.enum(['private', 'public']) });

async function updatePackQuantity(packId: string): Promise<void> {
  const count = await prisma.asset.count({ where: { packId } });
  await prisma.assetPack.update({ where: { id: packId }, data: { quantity: count } });
}

function visibilityWhere(userId?: string, role?: string) {
  if (role === 'admin') return undefined;
  return userId ? { OR: [{ ownerId: userId }, { visibility: 'public' }] } : { visibility: 'public' };
}

function canReadOwned(entity: { ownerId: string | null; visibility: string }, userId?: string, role?: string): boolean {
  return role === 'admin' || entity.visibility === 'public' || Boolean(userId && entity.ownerId === userId);
}

function canWriteOwned(entity: { ownerId: string | null }, userId: string, role?: string): boolean {
  return role === 'admin' || entity.ownerId === userId;
}

function sendValidationError(reply: FastifyReply, details: unknown): void {
  reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid request body', details });
}

function sendServerError(reply: FastifyReply, error: unknown, fallback: string): void {
  reply.status(500).send({ statusCode: 500, error: 'Internal Server Error', message: error instanceof Error ? error.message : fallback });
}

function shouldClearStageOutput(message: string): boolean {
  return /^(Retrying .+ flow|Generating SVG iteration|Evaluating iteration|Planning revision from iteration|Classifying|Analyzing reference image|Building creative brief|Building style system|Planning asset strategy and layout|Planning pack items|Building shared style system|Evaluating pack consistency)/i.test(message);
}
