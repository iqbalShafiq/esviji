import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireAdminUser, requireAuthUser } from '../auth/requestAuth.js';
import { MidtransPaymentService, PaymentConfigurationError } from '../services/MidtransPaymentService.js';

const CreatePaymentOrderSchema = z.object({
  packageId: z.string().min(1),
});

export class PaymentsController {
  constructor(private payments: MidtransPaymentService) {}

  async config(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.status(200).send({ success: true, data: await this.payments.getPublicConfig() });
  }

  async packages(_request: FastifyRequest, reply: FastifyReply): Promise<void> {
    reply.status(200).send({ success: true, data: await this.payments.listPackages() });
  }

  async createOrder(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    const parsed = CreatePaymentOrderSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: 'Invalid request body', details: parsed.error.format() });
      return;
    }
    try {
      const result = await this.payments.createOrder(user.id, parsed.data.packageId);
      reply.status(201).send({ success: true, data: result });
    } catch (error) {
      if (error instanceof PaymentConfigurationError) {
        reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: error.message });
        return;
      }
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: error instanceof Error ? error.message : 'Failed to create payment order' });
    }
  }

  async listOrders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    reply.status(200).send({ success: true, data: await this.payments.listOrdersForUser(user.id) });
  }

  async getOrder(request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    const order = await this.payments.getOrderForUser(request.params.orderId, user.id);
    if (!order) {
      reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Payment order not found' });
      return;
    }
    reply.status(200).send({ success: true, data: order });
  }

  async syncOrder(request: FastifyRequest<{ Params: { orderId: string } }>, reply: FastifyReply): Promise<void> {
    const user = await requireAuthUser(request, reply);
    if (!user) return;
    try {
      const order = await this.payments.syncOrderStatus(request.params.orderId, user.id);
      if (!order) {
        reply.status(404).send({ statusCode: 404, error: 'Not Found', message: 'Payment order not found' });
        return;
      }
      reply.status(200).send({ success: true, data: order });
    } catch (error) {
      if (error instanceof PaymentConfigurationError) {
        reply.status(503).send({ statusCode: 503, error: 'Service Unavailable', message: error.message });
        return;
      }
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: error instanceof Error ? error.message : 'Failed to sync payment status' });
    }
  }

  async webhook(request: FastifyRequest<{ Body: unknown }>, reply: FastifyReply): Promise<void> {
    try {
      await this.payments.handleWebhook(request.body);
      reply.status(200).send('OK');
    } catch (error) {
      request.log.warn({ error }, 'Midtrans webhook rejected');
      reply.status(400).send({ statusCode: 400, error: 'Bad Request', message: error instanceof Error ? error.message : 'Invalid Midtrans notification' });
    }
  }

  async adminOrders(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const admin = await requireAdminUser(request, reply);
    if (!admin) return;
    reply.status(200).send({ success: true, data: await this.payments.listAdminOrders() });
  }
}
