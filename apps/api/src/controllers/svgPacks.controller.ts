import type { FastifyReply, FastifyRequest } from 'fastify';
import { BuildSvgPackAssetRequestSchema, BuildSvgPackRequestSchema } from '@svg-builder/shared';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import type { SvgPackBuildOrchestrator } from '../orchestrators/SvgPackBuildOrchestrator.js';
import { logger } from '../utils/logger.js';
import { generateId } from '../utils/id.js';
import type { JobService } from '../services/JobService.js';
import { TokenService } from '../services/TokenService.js';
import { getOptionalAuthUser, requireAuthUser } from '../auth/requestAuth.js';

export class SvgPacksController {
  private tokenService = new TokenService();

  constructor(private orchestrator: SvgPackBuildOrchestrator, private jobService: JobService) {}

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = await getOptionalAuthUser(request);
    try {
      const packs = await prisma.assetPack.findMany({
        where: visibilityWhere(user?.id, user?.role),
        orderBy: { updatedAt: 'desc' },
        include: {
          owner: true,
          _count: { select: { assets: true } },
          assets: { orderBy: { updatedAt: 'desc' }, take: 6, select: { id: true, name: true, prompt: true, finalPngPath: true, finalSvgPath: true, width: true, height: true } },
        },
      });
      reply.status(200).send({ success: true, data: packs.map((pack) => ({
        id: pack.id,
        ownerId: pack.ownerId,
        owner: pack.owner ? { username: pack.owner.username, email: pack.owner.email } : null,
        isOwner: Boolean(user?.id && pack.ownerId === user.id),
        prompt: pack.prompt,
        assetType: pack.assetType,
        quantity: pack.quantity,
        status: pack.status,
        visibility: pack.visibility,
        assetCount: pack._count?.assets ?? pack.assets.length,
        thumbnails: pack.assets.map((asset: any) => ({ id: asset.id, name: asset.name, prompt: asset.prompt, finalPngPath: asset.finalPngPath, finalSvgPath: asset.finalSvgPath, width: asset.width, height: asset.height })),
        createdAt: pack.createdAt,
        updatedAt: pack.updatedAt,
      })) });
    } catch (error) {
      logger.error({ error }, 'Failed to list packs');
      sendServerError(reply, error, 'Failed to list packs');
    }
  }

  async create(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    const parseResult = CreatePackRequestSchema.safeParse(request.body);
    if (!parseResult.success) return sendValidationError(reply, parseResult.error.format());
    const body = parseResult.data;
    try {
      const pack = await prisma.assetPack.create({
        data: { ownerId: user.id, prompt: body.prompt, assetType: body.assetType, quantity: 0, style: body.style, visibility: body.visibility, status: 'completed', styleSystem: { source: 'manual', createdFor: 'asset_assignment' } },
      });
      reply.status(201).send({ success: true, data: pack });
    } catch (error) {
      logger.error({ error, body }, 'Failed to create pack');
      sendServerError(reply, error, 'Failed to create pack');
    }
  }

  async build(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    const parseResult = BuildSvgPackRequestSchema.safeParse(request.body);
    if (!parseResult.success) return sendValidationError(reply, parseResult.error.format());
    const body = parseResult.data;
    const reservedTokens = await this.reserveOrReply(user.id, body.quantity * body.maxIterations, reply);
    if (reservedTokens === undefined) return;

    try {
      const jobId = generateId('job');
      const job = await this.jobService.create({ jobId });
      void (async () => {
        try {
          await this.jobService.start(jobId);
          const pack = await this.orchestrator.build(body, {
            ownerId: user.id,
            visibility: body.visibility,
            onStage: (stage, message, progress) => void this.jobService.stage(jobId, stage, progress, message),
            onLlmToken: (stage, token) => void this.jobService.appendStageStream(jobId, stage, token),
            onReasoning: (stage, message) => void this.jobService.appendStageReasoning(jobId, stage, message),
            onToolEvent: (stage, event) => void this.jobService.appendToolEvent(jobId, stage, event),
          });
          const actualIterations = await prisma.asset.aggregate({ where: { packId: pack.id }, _sum: { currentIteration: true } });
          await this.tokenService.refund(user.id, Math.max(0, reservedTokens - (actualIterations._sum.currentIteration ?? 0)));
          await this.jobService.attachPack(jobId, pack.id);
          await this.jobService.complete(jobId);
        } catch (error) {
          await this.tokenService.refund(user.id, reservedTokens);
          await this.jobService.fail(jobId, error instanceof Error ? error.message : 'Pack build failed');
          logger.error({ error, prompt: body.prompt }, 'Background pack build failed');
        }
      })();
      reply.status(202).send({ success: true, data: { jobId: job.jobId, status: job.status, progress: job.progress } });
    } catch (error) {
      await this.tokenService.refund(user.id, reservedTokens);
      logger.error({ error, body }, 'Failed to build SVG pack');
      sendServerError(reply, error, 'Failed to build pack');
    }
  }

  async buildAsset(request: FastifyRequest<{ Params: { packId: string }; Body: unknown }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    const parseResult = BuildSvgPackAssetRequestSchema.safeParse(request.body);
    if (!parseResult.success) return sendValidationError(reply, parseResult.error.format());
    const body = parseResult.data;
    const { packId } = request.params;
    const pack = await prisma.assetPack.findUnique({ where: { id: packId }, select: { ownerId: true } });
    if (!pack) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Pack not found: ${packId}` });
    if (!canWriteOwned(pack, user.id, user.role)) return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only add assets to packs you own' });

    const reservedTokens = await this.reserveOrReply(user.id, body.maxIterations ?? 15, reply);
    if (reservedTokens === undefined) return;

    try {
      const jobId = generateId('job');
      const job = await this.jobService.create({ jobId, packId });
      void (async () => {
        try {
          await this.jobService.start(jobId);
          const asset = await this.orchestrator.buildAssetIntoPack(packId, body, {
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
          await this.jobService.attachPack(jobId, packId);
          await this.jobService.complete(jobId);
        } catch (error) {
          await this.tokenService.refund(user.id, reservedTokens);
          await this.jobService.fail(jobId, error instanceof Error ? error.message : 'Pack asset build failed');
          logger.error({ error, packId, prompt: body.prompt }, 'Background pack asset build failed');
        }
      })();
      reply.status(202).send({ success: true, data: { jobId: job.jobId, status: job.status, progress: job.progress } });
    } catch (error) {
      await this.tokenService.refund(user.id, reservedTokens);
      logger.error({ error, body, packId }, 'Failed to build SVG asset into pack');
      sendServerError(reply, error, 'Failed to build pack asset');
    }
  }

  async getById(request: FastifyRequest<{ Params: { packId: string } }>, reply: FastifyReply): Promise<void> {
    const user = await getOptionalAuthUser(request);
    const { packId } = request.params;
    try {
      const pack = await prisma.assetPack.findUnique({ where: { id: packId }, include: { owner: true, assets: { include: { iterations: { orderBy: { iterationNumber: 'asc' } } } } } });
      if (!pack) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: `Pack not found: ${packId}` });
      if (!canReadOwned(pack, user?.id, user?.role)) return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You cannot access this pack' });
      reply.status(200).send({ success: true, data: {
        ...pack,
        isOwner: Boolean(user?.id && pack.ownerId === user.id),
        owner: pack.owner ? { username: pack.owner.username, email: pack.owner.email } : null,
        sharedStyleSystem: pack.styleSystem,
        zipUrl: pack.zipPath ? `/packs/${pack.id}/pack.zip` : undefined,
        assets: pack.assets.map((asset: any) => serializePackAsset(asset, user?.id, pack.ownerId)),
      } });
    } catch (error) {
      logger.error({ error, packId }, 'Failed to get pack');
      sendServerError(reply, error, 'Failed to get pack');
    }
  }

  async updateVisibility(request: FastifyRequest<{ Params: { packId: string }; Body: unknown }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    const parsed = VisibilitySchema.safeParse(request.body);
    if (!parsed.success) return sendValidationError(reply, parsed.error.format());
    const pack = await prisma.assetPack.findUnique({ where: { id: request.params.packId }, select: { ownerId: true } });
    if (!pack) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Pack not found' });
    if (!canWriteOwned(pack, user.id, user.role)) return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'You can only update packs you own' });
    const updated = await prisma.assetPack.update({ where: { id: request.params.packId }, data: { visibility: parsed.data.visibility } });
    await prisma.asset.updateMany({ where: { packId: request.params.packId }, data: { visibility: parsed.data.visibility } });
    reply.status(200).send({ success: true, data: updated });
  }

  async clone(request: FastifyRequest<{ Params: { packId: string } }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    const source = await prisma.assetPack.findUnique({ where: { id: request.params.packId }, include: { assets: { include: { iterations: { orderBy: { iterationNumber: 'asc' } } } } } });
    if (!source) return reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Pack not found' });
    if (source.visibility !== 'public' && source.ownerId !== user.id && user.role !== 'admin') return reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Only public packs can be cloned' });
    const cloned = await prisma.assetPack.create({
      data: {
        ownerId: user.id,
        sourcePackId: source.id,
        prompt: source.prompt,
        assetType: source.assetType,
        quantity: source.quantity,
        style: source.style,
        visibility: 'private',
        status: source.status,
        styleSystem: source.styleSystem,
        consistencyScores: source.consistencyScores ?? Prisma.JsonNull,
        zipPath: source.zipPath,
        assets: { create: source.assets.map((asset: any) => ({ ownerId: user.id, sourceAssetId: asset.id, name: asset.name, prompt: asset.prompt, assetType: asset.assetType, mode: asset.mode, style: asset.style, visibility: 'private', status: asset.status, width: asset.width, height: asset.height, referenceImageUrl: asset.referenceImageUrl, finalSvgPath: asset.finalSvgPath, finalPngPath: asset.finalPngPath, finalDebugPngPath: asset.finalDebugPngPath, currentIteration: asset.currentIteration, bestIterationNumber: asset.bestIterationNumber, finalScores: asset.finalScores ?? Prisma.JsonNull, iterations: { create: asset.iterations.map((it: any) => ({ iterationNumber: it.iterationNumber, brief: it.brief, styleSystem: it.styleSystem, referenceAnalysis: it.referenceAnalysis ?? Prisma.JsonNull, layout: it.layout, svgDraftPath: it.svgDraftPath, pngPreviewPath: it.pngPreviewPath, debugPreviewPath: it.debugPreviewPath, scores: it.scores ?? Prisma.JsonNull, issues: it.issues ?? Prisma.JsonNull, actionTaken: it.actionTaken ?? Prisma.JsonNull })) } })) },
      },
    });
    reply.status(201).send({ success: true, data: { id: cloned.id } });
  }

  private async reserveOrReply(userId: string, amount: number, reply: FastifyReply): Promise<number | undefined> {
    try {
      return await this.tokenService.reserve(userId, amount);
    } catch (error) {
      reply.status(402).send({ statusCode: 402, error: 'Payment Required', message: error instanceof Error ? error.message : 'Insufficient tokens' });
      return undefined;
    }
  }
}

const CreatePackRequestSchema = z.object({
  prompt: z.string().trim().min(1),
  assetType: z.string().trim().min(1).default('icon_pack'),
  style: z.string().trim().optional(),
  visibility: z.enum(['private', 'public']).default('private'),
});
const VisibilitySchema = z.object({ visibility: z.enum(['private', 'public']) });

function serializePackAsset(asset: any, viewerId?: string, packOwnerId?: string | null) {
  const iterations = asset.iterations ?? [];
  return {
    ...asset,
    isOwner: Boolean(viewerId && (asset.ownerId === viewerId || packOwnerId === viewerId)),
    output: { width: asset.width, height: asset.height, formats: ['svg', 'png'] },
    currentStage: asset.status === 'completed' ? 'export' : undefined,
    classification: { assetType: asset.assetType },
    brief: iterations[0]?.brief,
    styleSystem: iterations[0]?.styleSystem,
    layoutBlueprint: iterations[0]?.layout,
    evaluation: { scores: asset.finalScores ?? iterations[iterations.length - 1]?.scores ?? {}, issues: iterations[iterations.length - 1]?.issues ?? [], continueIteration: false },
  };
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
  return /^(Retrying .+ flow|Generating SVG iteration|Evaluating iteration|Planning revision from iteration|Classifying|Analyzing reference image|Building creative brief|Preparing pack consistency context|Building style system|Planning asset strategy and layout|Evaluating pack consistency|Re-scoring pack consistency)/i.test(message);
}
