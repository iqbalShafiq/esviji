import { randomUUID } from 'crypto';

export function generateId(prefix: 'asset' | 'pack' | 'job'): string {
  return `${prefix}_${randomUUID()}`;
}
