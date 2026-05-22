import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { AdminController } from '../controllers/admin.controller.js';

export async function registerAdminRoutes(app: FastifyInstance, controller: AdminController): Promise<void> {
  app.get('/api/admin/users', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.listUsers(request, reply);
  });

  app.patch('/api/admin/users/:userId/tokens', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.updateUserTokens(request as Parameters<AdminController['updateUserTokens']>[0], reply);
  });
}
