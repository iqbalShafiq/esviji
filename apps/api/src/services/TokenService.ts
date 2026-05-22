import { prisma } from '../db/prisma.js';

export class TokenService {
  async reserve(userId: string, amount: number, idempotencyKey?: string): Promise<number> {
    if (amount <= 0) return 0;
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (!user) throw new Error('User not found');
      if (user.role === 'admin') return 0;
      if (user.tokenBalance < amount) {
        throw new Error(`Insufficient tokens. Required ${amount}, available ${user.tokenBalance}.`);
      }
      const key = idempotencyKey ?? `reserve:${userId}:${Date.now()}:${amount}`;
      const existing = await tx.tokenLedgerEntry.findUnique({ where: { idempotencyKey: key } });
      if (existing) return Math.abs(existing.amount);
      await tx.user.update({
        where: { id: userId },
        data: { tokenBalance: { decrement: amount } },
      });
      await tx.tokenLedgerEntry.create({
        data: {
          userId,
          amount: -amount,
          type: 'generation_reserve',
          note: 'Reserved for SVG generation',
          idempotencyKey: key,
        },
      });
      return amount;
    });
  }

  async refund(userId: string, amount: number, idempotencyKey?: string): Promise<void> {
    if (amount <= 0) return;
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
      if (!user || user.role === 'admin') return;
      const key = idempotencyKey ?? `refund:${userId}:${Date.now()}:${amount}`;
      const existing = await tx.tokenLedgerEntry.findUnique({ where: { idempotencyKey: key } });
      if (existing) return;
      await tx.user.update({
        where: { id: userId },
        data: { tokenBalance: { increment: amount } },
      });
      await tx.tokenLedgerEntry.create({
        data: {
          userId,
          amount,
          type: 'generation_refund',
          note: 'Unused SVG generation tokens returned',
          idempotencyKey: key,
        },
      });
    });
  }

  async adjust(userId: string, targetBalance: number, adminUserId: string): Promise<void> {
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId }, select: { tokenBalance: true, role: true } });
      if (!user || user.role === 'admin') return;
      const delta = targetBalance - user.tokenBalance;
      if (delta === 0) return;
      await tx.user.update({ where: { id: userId }, data: { tokenBalance: targetBalance } });
      await tx.tokenLedgerEntry.create({
        data: {
          userId,
          amount: delta,
          type: 'admin_adjustment',
          note: `Adjusted by admin ${adminUserId}`,
          idempotencyKey: `admin:${adminUserId}:${userId}:${Date.now()}:${targetBalance}`,
        },
      });
    });
  }
}
