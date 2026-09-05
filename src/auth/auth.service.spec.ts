import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { hashPassword } from './password.js';

describe('AuthService', () => {
  let authService: AuthService;
  const admin = {
    id: 'user-admin',
    username: 'admin',
    passwordHash: hashPassword('123456'),
  };
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
  } as unknown as PrismaService;

  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(admin);
    authService = new AuthService(prisma);
  });

  it('returns an access token for valid credentials', async () => {
    const result = await authService.login({
      username: 'admin',
      password: '123456',
    });

    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe(3600);
    expect(result.user).toEqual({ id: 'user-admin', username: 'admin' });
  });

  it('rejects an incomplete request body', async () => {
    await expect(
      authService.login({ username: '', password: '123456' }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects invalid credentials', async () => {
    await expect(
      authService.login({ username: 'admin', password: 'wrong-password' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('requires a JWT secret in production', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalJwtSecret = process.env.JWT_SECRET;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;

      expect(() => new AuthService(prisma)).toThrow(
        'JWT_SECRET must be set in production',
      );
    } finally {
      restoreEnvironmentVariable('NODE_ENV', originalNodeEnv);
      restoreEnvironmentVariable('JWT_SECRET', originalJwtSecret);
    }
  });

  function restoreEnvironmentVariable(name: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[name];
      return;
    }

    process.env[name] = value;
  }
});
