import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PaymentsController } from '../controllers/payments.controller.js';

export async function registerPaymentRoutes(app: FastifyInstance, controller: PaymentsController): Promise<void> {
  app.get('/api/payments/config', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.config(request, reply);
  });

  app.get('/api/payments/packages', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.packages(request, reply);
  });

  app.post('/api/payments/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.createOrder(request as Parameters<PaymentsController['createOrder']>[0], reply);
  });

  app.get('/api/payments/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.listOrders(request, reply);
  });

  app.get('/api/payments/orders/:orderId', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.getOrder(request as Parameters<PaymentsController['getOrder']>[0], reply);
  });

  app.post('/api/payments/orders/:orderId/sync', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.syncOrder(request as Parameters<PaymentsController['syncOrder']>[0], reply);
  });

  app.post('/api/payments/midtrans/webhook', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.webhook(request as Parameters<PaymentsController['webhook']>[0], reply);
  });

  app.get('/api/admin/payments/orders', async (request: FastifyRequest, reply: FastifyReply) => {
    await controller.adminOrders(request, reply);
  });
}
