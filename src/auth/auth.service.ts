import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { LoginDto } from './dto/login.dto.js';

const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 60 * 60;

export interface LoginResult {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: {
    id: string;
    username: string;
  };
}

@Injectable()
export class AuthService {
  private readonly demoUser = this.createDemoUser();
  private readonly jwtSecret = this.getJwtSecret();

  login(body: LoginDto): LoginResult {
    const credentials = this.parseCredentials(body);

    if (
      credentials.username !== this.demoUser.username ||
      !this.passwordMatches(credentials.password, this.demoUser.password)
    ) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return {
      accessToken: this.createAccessToken(),
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      user: {
        id: this.demoUser.id,
        username: this.demoUser.username,
      },
    };
  }

  private parseCredentials(body: LoginDto): LoginDto {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('请求体必须是 JSON 对象');
    }

    if (typeof body.username !== 'string' || body.username.trim() === '') {
      throw new BadRequestException('username 不能为空');
    }

    if (typeof body.password !== 'string' || body.password === '') {
      throw new BadRequestException('password 不能为空');
    }

    return {
      username: body.username.trim(),
      password: body.password,
    };
  }

  private passwordMatches(actual: string, expected: string): boolean {
    const actualHash = createHash('sha256').update(actual).digest();
    const expectedHash = createHash('sha256').update(expected).digest();

    return timingSafeEqual(actualHash, expectedHash);
  }

  private createAccessToken(): string {
    const now = Math.floor(Date.now() / 1000);
    const header = this.encodeTokenPart({ alg: 'HS256', typ: 'JWT' });
    const payload = this.encodeTokenPart({
      sub: this.demoUser.id,
      username: this.demoUser.username,
      iat: now,
      exp: now + ACCESS_TOKEN_EXPIRES_IN_SECONDS,
    });
    const unsignedToken = `${header}.${payload}`;
    const signature = createHmac('sha256', this.jwtSecret)
      .update(unsignedToken)
      .digest('base64url');

    return `${unsignedToken}.${signature}`;
  }

  private encodeTokenPart(value: object): string {
    return Buffer.from(JSON.stringify(value)).toString('base64url');
  }

  private createDemoUser() {
    const username = process.env.AUTH_USERNAME;
    const password = process.env.AUTH_PASSWORD;

    if (process.env.NODE_ENV === 'production' && (!username || !password)) {
      throw new Error(
        'AUTH_USERNAME and AUTH_PASSWORD must be set in production',
      );
    }

    return {
      id: '1',
      username: username ?? 'admin',
      password: password ?? '123456',
    };
  }

  private getJwtSecret(): string {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }

    return jwtSecret ?? 'nest-learn-development-secret';
  }
}
