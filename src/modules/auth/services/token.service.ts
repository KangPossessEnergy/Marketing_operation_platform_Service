import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type {
  AccessTokenPayload,
  PublicUser,
} from '../types/auth.types.js';

@Injectable()
export class TokenService {
  private readonly jwtSecret: string;
  private readonly accessTokenExpiresIn: number;

  constructor(private readonly config: ConfigService) {
    const jwtSecret = config.get<string>('auth.jwtSecret');

    if (!jwtSecret && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }

    this.jwtSecret = jwtSecret ?? 'nest-learn-development-secret';
    this.accessTokenExpiresIn =
      config.get<number>('auth.accessTokenExpiresIn') ?? 3600;
  }

  getAccessTokenExpiresIn(): number {
    return this.accessTokenExpiresIn;
  }

  createAccessToken(user: PublicUser, sessionId: string): string {
    const now = Math.floor(Date.now() / 1000);
    const header = this.encodeTokenPart({ alg: 'HS256', typ: 'JWT' });
    const payload = this.encodeTokenPart({
      sub: user.id,
      username: user.username,
      sid: sessionId,
      iat: now,
      exp: now + this.accessTokenExpiresIn,
    });
    const unsignedToken = `${header}.${payload}`;
    const signature = createHmac('sha256', this.jwtSecret)
      .update(unsignedToken)
      .digest('base64url');

    return `${unsignedToken}.${signature}`;
  }

  hashAccessToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  verifyAccessToken(token: string): AccessTokenPayload {
    try {
      const [encodedHeader, encodedPayload, encodedSignature] = token.split('.');

      if (!encodedHeader || !encodedPayload || !encodedSignature) {
        throw new Error('Malformed token');
      }

      const header = this.decodeTokenPart<{ alg?: string; typ?: string }>(
        encodedHeader,
      );
      const payload = this.decodeTokenPart<Partial<AccessTokenPayload>>(
        encodedPayload,
      );

      if (header.alg !== 'HS256' || header.typ !== 'JWT') {
        throw new Error('Unsupported token');
      }

      const expectedSignature = createHmac('sha256', this.jwtSecret)
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest();
      const actualSignature = Buffer.from(encodedSignature, 'base64url');

      if (
        actualSignature.length !== expectedSignature.length ||
        !timingSafeEqual(actualSignature, expectedSignature)
      ) {
        throw new Error('Invalid signature');
      }

      if (
        typeof payload.sub !== 'string' ||
        typeof payload.sid !== 'string' ||
        typeof payload.iat !== 'number' ||
        typeof payload.exp !== 'number' ||
        (payload.username !== null &&
          typeof payload.username !== 'string') ||
        payload.exp <= Math.floor(Date.now() / 1000)
      ) {
        throw new Error('Invalid claims');
      }

      return payload as AccessTokenPayload;
    } catch {
      throw new UnauthorizedException('登录状态无效或已过期');
    }
  }

  private encodeTokenPart(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private decodeTokenPart<T>(value: string): T {
    return JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as T;
  }
}
