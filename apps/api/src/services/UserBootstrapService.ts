import { prisma } from '../db/prisma.js';
import { hashPassword } from '../auth/password.js';
import { logger } from '../utils/logger.js';

const ADMIN_USERNAME = 'admin';
const ADMIN_EMAIL = 'admin@esviji.id';
const ADMIN_PASSWORD = 'Test@123';

export async function ensureDefaultAdminUser(): Promise<void> {
  try {
    const passwordHash = await hashPassword(ADMIN_PASSWORD);
    const admin = await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: {
        username: ADMIN_USERNAME,
        role: 'admin',
        passwordHash,
      },
      create: {
        username: ADMIN_USERNAME,
        email: ADMIN_EMAIL,
        passwordHash,
        role: 'admin',
        tokenBalance: 0,
      },
    });

    await prisma.asset.updateMany({ where: { ownerId: null }, data: { ownerId: admin.id } });
    await prisma.assetPack.updateMany({ where: { ownerId: null }, data: { ownerId: admin.id } });
  } catch (error) {
    if (isMissingAuthTableError(error)) {
      logger.warn('Auth tables are not migrated yet; skipping default admin bootstrap.');
      return;
    }
    throw error;
  }
}

function isMissingAuthTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  const message = error instanceof Error ? error.message : String(error);
  return code === 'P2021' || message.includes('table `public.User` does not exist');
}
