import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { requireAdminUser } from '../auth/requestAuth.js';
import { TokenService } from '../services/TokenService.js';

const UpdateTokenSchema = z.object({ tokenBalance: z.number().int().min(0) });

export class AdminController {
  private tokenService = new TokenService();

  async listUsers(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const admin = await requireAdminUser(request, reply);
    if (!admin) return;
    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        tokenBalance: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { assets: true, packs: true } },
      },
    });
    reply.status(200).send({ success: true, data: users });
  }

  async updateUserTokens(request: FastifyRequest<{ Params: { userId: string }; Body: unknown }>, reply: FastifyReply): Promise<void> {
    const admin = await requireAdminUser(request, reply);
    if (!admin) return;
    const parsed = UpdateTokenSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid request body', details: parsed.error.format() });
      return;
    }
    await this.tokenService.adjust(request.params.userId, parsed.data.tokenBalance, admin.id);
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: request.params.userId },
      select: { id: true, username: true, email: true, role: true, tokenBalance: true, createdAt: true, updatedAt: true },
    });
    reply.status(200).send({ success: true, data: user });
  }
}
