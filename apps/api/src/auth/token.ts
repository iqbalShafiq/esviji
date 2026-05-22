import { createHmac, timingSafeEqual } from 'crypto';

export interface AuthTokenPayload {
  sub: string;
  role: string;
  email: string;
  username: string;
  exp: number;
}

function base64Url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('JWT_SECRET must be set and at least 32 characters long');
  }
  return secret;
}

export function signAuthToken(payload: Omit<AuthTokenPayload, 'exp'>, expiresInSeconds = 60 * 60 * 24 * 7): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const body: AuthTokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
  };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedBody = base64Url(JSON.stringify(body));
  const signature = createHmac('sha256', getJwtSecret())
    .update(`${encodedHeader}.${encodedBody}`)
    .digest('base64url');
  return `${encodedHeader}.${encodedBody}.${signature}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | undefined {
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  const [encodedHeader, encodedBody, signature] = parts;
  const expectedSignature = createHmac('sha256', getJwtSecret())
    .update(`${encodedHeader}.${encodedBody}`)
    .digest('base64url');
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) return undefined;

  const payload = JSON.parse(Buffer.from(encodedBody, 'base64url').toString('utf8')) as AuthTokenPayload;
  if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return undefined;
  return payload;
}
