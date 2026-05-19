import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SvgPacksController } from '../controllers/svgPacks.controller.js';

export async function registerSvgPackRoutes(
  app: FastifyInstance,
  controller: SvgPacksController
): Promise<void> {
  app.post('/api/assets/svg-pack/build', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.build(request as Parameters<SvgPacksController['build']>[0], reply);
  });

  app.get('/api/packs/:packId', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getById(
      request as Parameters<SvgPacksController['getById']>[0],
      reply
    );
  });
}
