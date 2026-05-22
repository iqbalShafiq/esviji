import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db/prisma.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signAuthToken } from '../auth/token.js';
import { requireAuthUser } from '../auth/requestAuth.js';

const RegisterSchema = z.object({
  username: z.string().trim().min(3),
  email: z.string().trim().email(),
  password: z.string().min(8),
});

const LoginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

function serializeUser(user: { id: string; username: string; email: string; role: string; tokenBalance: number }) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    tokenBalance: user.role === 'admin' ? null : user.tokenBalance,
  };
}

export class AuthController {
  async register(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const parsed = RegisterSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid request body', details: parsed.error.format() });
      return;
    }

    const { username, email, password } = parsed.data;
    const existing = await prisma.user.findFirst({ where: { OR: [{ username }, { email }] } });
    if (existing) {
      reply.status(409).send({ statusCode: 409, error: 'Conflict', message: 'Username or email already exists' });
      return;
    }

    const user = await prisma.user.create({
      data: { username, email, passwordHash: await hashPassword(password), tokenBalance: 50 },
      select: { id: true, username: true, email: true, role: true, tokenBalance: true },
    });
    const token = signAuthToken({ sub: user.id, role: user.role, email: user.email, username: user.username });
    reply.status(201).send({ success: true, data: { token, user: serializeUser(user) } });
  }

  async login(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const parsed = LoginSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid request body', details: parsed.error.format() });
      return;
    }

    const { identifier, password } = parsed.data;
    const user = await prisma.user.findFirst({
      where: { OR: [{ username: identifier }, { email: identifier }] },
    });
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      reply.status(401).send({ statusCode: 401, error: 'Unauthorized', message: 'Invalid credentials' });
      return;
    }

    const token = signAuthToken({ sub: user.id, role: user.role, email: user.email, username: user.username });
    reply.status(200).send({ success: true, data: { token, user: serializeUser(user) } });
  }

  async me(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    reply.status(200).send({ success: true, data: serializeUser(user) });
  }
}
