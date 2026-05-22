import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SvgAssetsController } from '../controllers/svgAssets.controller.js';

export async function svgAssetsRoutes(
  app: FastifyInstance,
  controller: SvgAssetsController
): Promise<void> {
  app.get('/api/assets', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.list(request, reply);
  });

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

  app.patch('/api/assets/:assetId/pack', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.updatePack(
      request as Parameters<SvgAssetsController['updatePack']>[0],
      reply
    );
  });

  app.patch('/api/assets/:assetId/visibility', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.updateVisibility(
      request as Parameters<SvgAssetsController['updateVisibility']>[0],
      reply
    );
  });

  app.post('/api/assets/:assetId/clone', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.clone(
      request as Parameters<SvgAssetsController['clone']>[0],
      reply
    );
  });

  app.delete('/api/assets/:assetId', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.delete(
      request as Parameters<SvgAssetsController['delete']>[0],
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
