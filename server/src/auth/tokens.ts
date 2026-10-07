import { createHash, randomBytes } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

const ISSUER = 'kliniki';
const AUDIENCE = 'kliniki-api';

export interface AccessClaims {
  userId: string;
  clinicId: string;
  deviceId: string;
}

export interface TokenSigner {
  signAccess(claims: AccessClaims): Promise<string>;
  verifyAccess(token: string): Promise<AccessClaims | null>;
}

/**
 * Access tokens only say who is asking (user, clinic, device). The role is deliberately not in them:
 * it is read from the database on every request, so demoting or disabling someone takes effect at once.
 */
export function createTokenSigner(secret: string, ttlSeconds: number): TokenSigner {
  const key = new TextEncoder().encode(secret);
  return {
    signAccess: ({ userId, clinicId, deviceId }) =>
      new SignJWT({ cid: clinicId, did: deviceId })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(userId)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${ttlSeconds}s`)
        .sign(key),

    async verifyAccess(token) {
      try {
        const { payload } = await jwtVerify(token, key, { issuer: ISSUER, audience: AUDIENCE, algorithms: ['HS256'] });
        const { sub, cid, did } = payload as { sub?: string; cid?: unknown; did?: unknown };
        if (!sub || typeof cid !== 'string' || typeof did !== 'string') return null;
        return { userId: sub, clinicId: cid, deviceId: did };
      } catch {
        return null; // expired, tampered with, or issued for something else
      }
    },
  };
}

/** A random refresh token. Only its hash is ever stored, so a database leak does not leak sessions. */
export const newRefreshToken = () => randomBytes(32).toString('base64url');

export const hashRefreshToken = (token: string) => createHash('sha256').update(token).digest('hex');
