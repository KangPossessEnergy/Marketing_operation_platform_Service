import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { LoginDto } from './dto/login.dto.js';
import { verifyPassword } from './password.js';

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
  private readonly jwtSecret = this.getJwtSecret();

  constructor(private readonly prisma: PrismaService) {}

  async login(body: LoginDto): Promise<LoginResult> {
    const credentials = this.parseCredentials(body);
    const user = await this.prisma.user.findUnique({
      where: { username: credentials.username },
    });

    if (!user || !verifyPassword(credentials.password, user.passwordHash)) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return {
      accessToken: this.createAccessToken(user),
      tokenType: 'Bearer',
      expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      user: {
        id: user.id,
        username: user.username,
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

  private createAccessToken(user: { id: string; username: string }): string {
    const now = Math.floor(Date.now() / 1000);
    const header = this.encodeTokenPart({ alg: 'HS256', typ: 'JWT' });
    const payload = this.encodeTokenPart({
      sub: user.id,
      username: user.username,
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

  private getJwtSecret(): string {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret && process.env.NODE_ENV === 'production') {
      throw new Error('JWT_SECRET must be set in production');
    }

    return jwtSecret ?? 'nest-learn-development-secret';
  }
}
