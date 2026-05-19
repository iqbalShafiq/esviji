import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SvgAssetsController } from '../controllers/svgAssets.controller.js';

export async function svgAssetsRoutes(
  app: FastifyInstance,
  controller: SvgAssetsController
): Promise<void> {
  app.post('/api/assets/svg/build', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.build(request as Parameters<SvgAssetsController['build']>[0], reply);
  });

  app.post('/api/assets/svg/iterate', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.iterate(request as Parameters<SvgAssetsController['iterate']>[0], reply);
  });

  app.post('/api/assets/svg/render', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.render(request as Parameters<SvgAssetsController['render']>[0], reply);
  });

  app.post('/api/assets/svg/optimize', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.optimize(request as Parameters<SvgAssetsController['optimize']>[0], reply);
  });

  app.get('/api/assets/:assetId', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getById(
      request as Parameters<SvgAssetsController['getById']>[0],
      reply
    );
  });

  app.get('/api/jobs/:jobId', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getJob(
      request as Parameters<SvgAssetsController['getJob']>[0],
      reply
    );
  });

  app.get('/api/jobs/:jobId/stream', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.streamJob(
      request as Parameters<SvgAssetsController['streamJob']>[0],
      reply
    );
  });
}
