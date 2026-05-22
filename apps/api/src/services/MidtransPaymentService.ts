import { createHash, randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';

const DEFAULT_PACKAGES = [
  { code: 'starter-50', name: 'Starter', description: 'A light refill for quick experiments.', tokenAmount: 50, priceIdr: 25000, sortOrder: 10 },
  { code: 'creator-125', name: 'Creator', description: 'Balanced capacity for everyday asset work.', tokenAmount: 125, priceIdr: 55000, sortOrder: 20 },
  { code: 'studio-300', name: 'Studio', description: 'Best value for packs and repeated refinements.', tokenAmount: 300, priceIdr: 120000, sortOrder: 30 },
];

type MidtransTransactionStatus =
  | 'pending'
  | 'capture'
  | 'settlement'
  | 'deny'
  | 'cancel'
  | 'expire'
  | 'failure'
  | 'refund'
  | 'partial_refund'
  | 'chargeback'
  | 'partial_chargeback'
  | 'authorize';

type MidtransNotification = {
  order_id?: string;
  transaction_id?: string;
  transaction_status?: MidtransTransactionStatus | string;
  fraud_status?: string;
  status_code?: string;
  status_message?: string;
  gross_amount?: string;
  signature_key?: string;
  payment_type?: string;
  settlement_time?: string;
  transaction_time?: string;
};

type SnapResponse = {
  token: string;
  redirect_url: string;
};

type CreateOrderResult = {
  order: Awaited<ReturnType<MidtransPaymentService['getOrderForUser']>>;
  snapToken?: string;
  redirectUrl?: string;
};

export class PaymentConfigurationError extends Error {}

export class MidtransPaymentService {
  async listPackages() {
    await this.ensureDefaultPackages();
    return prisma.tokenPackage.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { priceIdr: 'asc' }],
    });
  }

  async getPublicConfig() {
    return {
      provider: 'midtrans',
      environment: this.environment,
      isConfigured: this.isConfigured,
      enabledPayments: ['qris', 'credit_card'],
    };
  }

  async createOrder(userId: string, packageId: string): Promise<CreateOrderResult> {
    if (!this.isConfigured) {
      throw new PaymentConfigurationError('Midtrans is not configured yet. Add MIDTRANS_SERVER_KEY to enable checkout.');
    }

    const selectedPackage = await prisma.tokenPackage.findFirst({
      where: { id: packageId, isActive: true },
    });
    if (!selectedPackage) throw new Error('Token package not found');

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, username: true, email: true },
    });
    if (!user) throw new Error('User not found');

    const providerOrderId = `esviji-${randomUUID()}`;
    const order = await prisma.paymentOrder.create({
      data: {
        userId,
        packageId: selectedPackage.id,
        providerOrderId,
        amountIdr: selectedPackage.priceIdr,
        tokenAmount: selectedPackage.tokenAmount,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      include: { package: true },
    });

    try {
      const snap = await this.createSnapTransaction({
        orderId: providerOrderId,
        amountIdr: selectedPackage.priceIdr,
        tokenAmount: selectedPackage.tokenAmount,
        packageName: selectedPackage.name,
        customer: user,
      });
      const updated = await prisma.paymentOrder.update({
        where: { id: order.id },
        data: { snapToken: snap.token, snapRedirectUrl: snap.redirect_url },
        include: { package: true },
      });
      return { order: this.serializeOrder(updated), snapToken: snap.token, redirectUrl: snap.redirect_url };
    } catch (error) {
      await prisma.paymentOrder.update({
        where: { id: order.id },
        data: { status: 'failed', failureReason: error instanceof Error ? error.message : 'Failed to create Midtrans checkout' },
      });
      throw error;
    }
  }

  async listOrdersForUser(userId: string) {
    const orders = await prisma.paymentOrder.findMany({
      where: { userId },
      include: { package: true },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return orders.map((order) => this.serializeOrder(order));
  }

  async getOrderForUser(orderId: string, userId: string) {
    const order = await prisma.paymentOrder.findFirst({
      where: { id: orderId, userId },
      include: { package: true },
    });
    return order ? this.serializeOrder(order) : undefined;
  }

  async listAdminOrders() {
    const orders = await prisma.paymentOrder.findMany({
      include: { package: true, user: { select: { username: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return orders.map((order) => ({
      ...this.serializeOrder(order),
      user: order.user,
    }));
  }

  async syncOrderStatus(orderId: string, userId: string) {
    if (!this.isConfigured) {
      throw new PaymentConfigurationError('Midtrans is not configured yet.');
    }
    const order = await prisma.paymentOrder.findFirst({ where: { id: orderId, userId } });
    if (!order) return undefined;
    const status = await this.getMidtransStatus(order.providerOrderId);
    await this.applyNotification(status, { requireSignature: false });
    return this.getOrderForUser(orderId, userId);
  }

  async handleWebhook(payload: unknown) {
    return this.applyNotification(payload, { requireSignature: true });
  }

  verifySignature(notification: MidtransNotification): boolean {
    if (!notification.order_id || !notification.status_code || !notification.gross_amount || !notification.signature_key || !this.serverKey) {
      return false;
    }
    const expected = createHash('sha512')
      .update(`${notification.order_id}${notification.status_code}${notification.gross_amount}${this.serverKey}`)
      .digest('hex');
    return expected === notification.signature_key;
  }

  private async applyNotification(payload: unknown, options: { requireSignature: boolean }) {
    const notification = payload as MidtransNotification;
    const providerOrderId = notification.order_id;
    if (!providerOrderId) throw new Error('Midtrans notification missing order_id');

    const signatureValid = options.requireSignature ? this.verifySignature(notification) : true;
    if (options.requireSignature && !signatureValid) {
      await this.storeEvent(notification, undefined, false);
      throw new Error('Invalid Midtrans signature');
    }

    const order = await prisma.paymentOrder.findUnique({ where: { providerOrderId } });
    const event = await this.storeEvent(notification, order?.id, signatureValid);
    if (!order) return { ok: true, duplicate: event.duplicate };

    const next = this.mapStatus(notification);
    await prisma.$transaction(async (tx) => {
      const current = await tx.paymentOrder.findUnique({ where: { id: order.id } });
      if (!current) return;

      const baseUpdate = {
        providerTransactionId: notification.transaction_id ?? current.providerTransactionId,
        providerPaymentType: notification.payment_type ?? current.providerPaymentType,
        failureReason: notification.status_message ?? current.failureReason,
      };

      if (next.kind === 'paid') {
        await tx.paymentOrder.update({
          where: { id: current.id },
          data: {
            ...baseUpdate,
            status: 'paid',
            paidAt: current.paidAt ?? parseMidtransDate(notification.settlement_time ?? notification.transaction_time) ?? new Date(),
            tokenCreditedAt: current.tokenCreditedAt ?? new Date(),
          },
        });
        if (!current.tokenCreditedAt) {
          await tx.user.update({ where: { id: current.userId }, data: { tokenBalance: { increment: current.tokenAmount } } });
          await tx.tokenLedgerEntry.create({
            data: {
              userId: current.userId,
              paymentOrderId: current.id,
              amount: current.tokenAmount,
              type: 'payment_credit',
              note: `Paid via ${notification.payment_type ?? 'Midtrans'}`,
              idempotencyKey: `payment-credit:${current.id}`,
            },
          });
        }
        return;
      }

      if (next.kind === 'reversal') {
        await tx.paymentOrder.update({
          where: { id: current.id },
          data: {
            ...baseUpdate,
            status: next.status,
            refundedAt: new Date(),
            tokenRevokedAt: current.tokenRevokedAt ?? new Date(),
            needsManualReview: next.manualReview,
          },
        });
        if (current.tokenCreditedAt && !current.tokenRevokedAt && !next.manualReview) {
          await tx.user.update({ where: { id: current.userId }, data: { tokenBalance: { decrement: current.tokenAmount } } });
          await tx.tokenLedgerEntry.create({
            data: {
              userId: current.userId,
              paymentOrderId: current.id,
              amount: -current.tokenAmount,
              type: 'payment_reversal',
              note: `Reversed by Midtrans status ${notification.transaction_status}`,
              idempotencyKey: `payment-reversal:${current.id}`,
            },
          });
        }
        return;
      }

      await tx.paymentOrder.update({
        where: { id: current.id },
        data: {
          ...baseUpdate,
          status: next.status,
          needsManualReview: next.manualReview,
        },
      });
    });

    return { ok: true, duplicate: false };
  }

  private async storeEvent(notification: MidtransNotification, paymentOrderId: string | undefined, signatureValid: boolean) {
    const providerEventId = createHash('sha256')
      .update(JSON.stringify({
        order_id: notification.order_id,
        transaction_id: notification.transaction_id,
        transaction_status: notification.transaction_status,
        status_code: notification.status_code,
        gross_amount: notification.gross_amount,
        signature_key: notification.signature_key,
      }))
      .digest('hex');
    try {
      await prisma.paymentEvent.create({
        data: {
          paymentOrderId,
          providerEventId,
          orderId: notification.order_id,
          transactionId: notification.transaction_id,
          transactionStatus: notification.transaction_status,
          fraudStatus: notification.fraud_status,
          statusCode: notification.status_code,
          grossAmount: notification.gross_amount,
          signatureValid,
          rawPayload: notification as Prisma.JsonValue,
        },
      });
      return { duplicate: false };
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
        return { duplicate: true };
      }
      throw error;
    }
  }

  private mapStatus(notification: MidtransNotification):
    | { kind: 'paid'; status: 'paid'; manualReview: false }
    | { kind: 'reversal'; status: 'refunded' | 'partial_refund' | 'chargeback' | 'failed'; manualReview: boolean }
    | { kind: 'state'; status: string; manualReview: boolean } {
    const status = notification.transaction_status;
    const fraudStatus = notification.fraud_status;
    if (status === 'settlement' || (status === 'capture' && fraudStatus === 'accept')) {
      return { kind: 'paid', status: 'paid', manualReview: false };
    }
    if (status === 'refund') return { kind: 'reversal', status: 'refunded', manualReview: false };
    if (status === 'partial_refund') return { kind: 'reversal', status: 'partial_refund', manualReview: true };
    if (status === 'chargeback') return { kind: 'reversal', status: 'chargeback', manualReview: false };
    if (status === 'partial_chargeback') return { kind: 'reversal', status: 'chargeback', manualReview: true };
    if (status === 'deny') return { kind: 'reversal', status: 'failed', manualReview: false };
    if (status === 'expire') return { kind: 'state', status: 'expired', manualReview: false };
    if (status === 'cancel') return { kind: 'state', status: 'cancelled', manualReview: false };
    if (status === 'failure') return { kind: 'state', status: 'failed', manualReview: false };
    if (status === 'authorize') return { kind: 'state', status: 'review', manualReview: true };
    return { kind: 'state', status: 'pending', manualReview: fraudStatus === 'challenge' };
  }

  private serializeOrder(order: {
    id: string;
    providerOrderId: string;
    providerPaymentType: string | null;
    status: string;
    amountIdr: number;
    tokenAmount: number;
    snapRedirectUrl: string | null;
    failureReason: string | null;
    needsManualReview: boolean;
    paidAt: Date | null;
    refundedAt: Date | null;
    expiresAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    package: { id: string; code: string; name: string; description: string | null; tokenAmount: number; priceIdr: number };
  }) {
    return {
      id: order.id,
      providerOrderId: order.providerOrderId,
      providerPaymentType: order.providerPaymentType,
      status: order.status,
      amountIdr: order.amountIdr,
      tokenAmount: order.tokenAmount,
      snapRedirectUrl: order.snapRedirectUrl,
      failureReason: order.failureReason,
      needsManualReview: order.needsManualReview,
      paidAt: order.paidAt?.toISOString() ?? null,
      refundedAt: order.refundedAt?.toISOString() ?? null,
      expiresAt: order.expiresAt?.toISOString() ?? null,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
      package: order.package,
    };
  }

  private async ensureDefaultPackages() {
    const count = await prisma.tokenPackage.count();
    if (count > 0) return;
    await prisma.tokenPackage.createMany({ data: DEFAULT_PACKAGES });
  }

  private async createSnapTransaction(input: {
    orderId: string;
    amountIdr: number;
    tokenAmount: number;
    packageName: string;
    customer: { username: string; email: string };
  }): Promise<SnapResponse> {
    const response = await fetch(`${this.snapBaseUrl}/snap/v1/transactions`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`,
      },
      body: JSON.stringify({
        enabled_payments: ['qris', 'credit_card'],
        transaction_details: {
          order_id: input.orderId,
          gross_amount: input.amountIdr,
        },
        item_details: [
          {
            id: `tokens-${input.tokenAmount}`,
            price: input.amountIdr,
            quantity: 1,
            name: `${input.packageName} - ${input.tokenAmount} Esviji tokens`,
          },
        ],
        customer_details: {
          first_name: input.customer.username,
          email: input.customer.email,
        },
        credit_card: {
          secure: true,
        },
        expiry: {
          unit: 'hour',
          duration: 24,
        },
      }),
    });

    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body?.error_messages?.[0] === 'string'
        ? body.error_messages[0]
        : `Midtrans Snap request failed with ${response.status}`;
      throw new Error(message);
    }
    if (!body.token || !body.redirect_url) throw new Error('Midtrans Snap response did not include checkout URL');
    return body as SnapResponse;
  }

  private async getMidtransStatus(providerOrderId: string): Promise<MidtransNotification> {
    const response = await fetch(`${this.apiBaseUrl}/v2/${encodeURIComponent(providerOrderId)}/status`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Basic ${Buffer.from(`${this.serverKey}:`).toString('base64')}`,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof body?.status_message === 'string' ? body.status_message : `Midtrans status request failed with ${response.status}`;
      throw new Error(message);
    }
    return body as MidtransNotification;
  }

  private get environment(): 'sandbox' | 'production' {
    return process.env.MIDTRANS_ENV === 'production' ? 'production' : 'sandbox';
  }

  private get isConfigured(): boolean {
    return Boolean(this.serverKey);
  }

  private get serverKey(): string {
    return process.env.MIDTRANS_SERVER_KEY ?? '';
  }

  private get snapBaseUrl(): string {
    return this.environment === 'production' ? 'https://app.midtrans.com' : 'https://app.sandbox.midtrans.com';
  }

  private get apiBaseUrl(): string {
    return this.environment === 'production' ? 'https://api.midtrans.com' : 'https://api.sandbox.midtrans.com';
  }
}

function parseMidtransDate(value?: string): Date | undefined {
  if (!value) return undefined;
  const parsed = new Date(value.replace(' ', 'T') + '+07:00');
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
