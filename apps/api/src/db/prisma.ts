import { PrismaClient } from '@prisma/client';
import { loadRootEnv } from '../config/loadEnv.js';

loadRootEnv();

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is missing. Check .env loading before Prisma initialization.');
}

export const prisma = new PrismaClient();
