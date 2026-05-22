import type { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../db/prisma.js';
import { verifyAuthToken } from './token.js';

export interface AuthUser {
  id: string;
  username: string;
  email: string;
  role: string;
  tokenBalance: number;
}

export async function getOptionalAuthUser(request: FastifyRequest): Promise<AuthUser | undefined> {
  const authorization = request.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) return undefined;

  const payload = verifyAuthToken(authorization.slice('Bearer '.length));
  if (!payload) return undefined;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, username: true, email: true, role: true, tokenBalance: true },
  });
  return user ?? undefined;
}

export async function requireAuthUser(request: FastifyRequest, reply: FastifyReply): Promise<AuthUser | undefined> {
  const user = await getOptionalAuthUser(request);
  if (!user) {
    reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Login required' });
    return undefined;
  }
  return user;
}

export async function requireAdminUser(request: FastifyRequest, reply: FastifyReply): Promise<AuthUser | undefined> {
  const user = await requireAuthUser(request, reply);
  if (!user) return undefined;
  if (user.role !== 'admin') {
    reply.status(403).send({ statusCode: 403, error: 'Forbidden', message: 'Admin access required' });
    return undefined;
  }
  return user;
}
