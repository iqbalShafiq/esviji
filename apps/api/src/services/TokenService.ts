import { prisma } from '../db/prisma.js';

export class TokenService {
  async reserve(userId: string, amount: number): Promise<number> {
    if (amount <= 0) return 0;
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (user.role === 'admin') return 0;
    if (user.tokenBalance < amount) {
      throw new Error(`Insufficient tokens. Required ${amount}, available ${user.tokenBalance}.`);
    }
    await prisma.user.update({
      where: { id: userId },
      data: { tokenBalance: { decrement: amount } },
    });
    return amount;
  }

  async refund(userId: string, amount: number): Promise<void> {
    if (amount <= 0) return;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (!user || user.role === 'admin') return;
    await prisma.user.update({
      where: { id: userId },
      data: { tokenBalance: { increment: amount } },
    });
  }
}
