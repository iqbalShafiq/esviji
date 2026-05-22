import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AuthController } from '../controllers/auth.controller.js';

export async function registerAuthRoutes(app: FastifyInstance, controller: AuthController): Promise<void> {
  app.post('/api/auth/register', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.register(request as Parameters<AuthController['register']>[0], reply);
  });

  app.post('/api/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.login(request as Parameters<AuthController['login']>[0], reply);
  });

  app.get('/api/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.me(request, reply);
  });
}
