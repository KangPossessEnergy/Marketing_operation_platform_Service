import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service.js';

describe('AuthService', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService();
  });

  it('returns an access token for valid credentials', () => {
    const result = authService.login({
      username: 'admin',
      password: '123456',
    });

    expect(result.accessToken.split('.')).toHaveLength(3);
    expect(result.tokenType).toBe('Bearer');
    expect(result.expiresIn).toBe(3600);
    expect(result.user).toEqual({ id: '1', username: 'admin' });
  });

  it('rejects an incomplete request body', () => {
    expect(() =>
      authService.login({ username: '', password: '123456' }),
    ).toThrow(BadRequestException);
  });

  it('rejects invalid credentials', () => {
    expect(() =>
      authService.login({ username: 'admin', password: 'wrong-password' }),
    ).toThrow(UnauthorizedException);
  });

  it('requires authentication configuration in production', () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalUsername = process.env.AUTH_USERNAME;
    const originalPassword = process.env.AUTH_PASSWORD;
    const originalJwtSecret = process.env.JWT_SECRET;

    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_USERNAME;
    delete process.env.AUTH_PASSWORD;
    delete process.env.JWT_SECRET;

    expect(() => new AuthService()).toThrow(
      'AUTH_USERNAME and AUTH_PASSWORD must be set in production',
    );

    restoreEnvironmentVariable('NODE_ENV', originalNodeEnv);
    restoreEnvironmentVariable('AUTH_USERNAME', originalUsername);
    restoreEnvironmentVariable('AUTH_PASSWORD', originalPassword);
    restoreEnvironmentVariable('JWT_SECRET', originalJwtSecret);
  });

  function restoreEnvironmentVariable(name: string, value: string | undefined) {
    if (value === undefined) {
      delete process.env[name];
      return;
    }

    process.env[name] = value;
  }
});
