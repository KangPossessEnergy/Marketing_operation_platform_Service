import { UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { AuthService } from './auth.service.js';
import type { UsersService } from '../../users/services/users.service.js';
import type { AuthRepository } from '../repositories/auth.repository.js';
import type { TokenService } from './token.service.js';
import type { VerificationCodeService } from './verification-code.service.js';
import { hashPassword } from '../security/password.js';

describe('AuthService', () => {
  const user: User = {
    id: 'user-1',
    username: 'admin',
    phone: null,
    passwordHash: hashPassword('123456'),
    phoneVerifiedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const usersService = {
    register: vi.fn(),
    findByUsername: vi.fn(),
    findByPhone: vi.fn(),
    createSmsUser: vi.fn(),
  } as unknown as UsersService;
  const authRepository = {
    createSession: vi.fn(),
    revokeSession: vi.fn(),
  } as unknown as AuthRepository;
  const tokenService = {
    getAccessTokenExpiresIn: vi.fn(() => 3600),
    createAccessToken: vi.fn(() => 'access-token'),
    hashAccessToken: vi.fn(() => 'token-hash'),
  } as unknown as TokenService;
  const verificationCodeService = {
    sendLoginCode: vi.fn(),
    verifyLoginCode: vi.fn(),
  } as unknown as VerificationCodeService;
  let authService: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(usersService.findByUsername).mockResolvedValue(user);
    vi.mocked(authRepository.createSession).mockImplementation(
      async (data) =>
        ({
          ...data,
          revokedAt: null,
          createdAt: new Date(),
        }) as never,
    );
    authService = new AuthService(
      usersService,
      authRepository,
      tokenService,
      verificationCodeService,
    );
  });

  it('issues a session-backed access token for password login', async () => {
    const result = await authService.login({
      username: 'admin',
      password: '123456',
    });

    expect(result).toEqual({
      accessToken: 'access-token',
      tokenType: 'Bearer',
      expiresIn: 3600,
      user: {
        id: 'user-1',
        username: 'admin',
        phone: null,
      },
    });
    expect(authRepository.createSession).toHaveBeenCalledWith({
      id: expect.any(String),
      userId: 'user-1',
      tokenHash: 'token-hash',
      expiresAt: expect.any(Date),
    });
  });

  it('rejects incorrect password credentials', async () => {
    await expect(
      authService.login({ username: 'admin', password: 'incorrect' }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('verifies SMS code before creating a phone user', async () => {
    const phoneUser = {
      ...user,
      id: 'user-2',
      username: null,
      phone: '13800138000',
      passwordHash: null,
      phoneVerifiedAt: new Date(),
    };
    vi.mocked(usersService.findByPhone).mockResolvedValue(null);
    vi.mocked(usersService.createSmsUser).mockResolvedValue(phoneUser);

    await authService.loginBySms({
      phone: '13800138000',
      code: '123456',
    });

    expect(verificationCodeService.verifyLoginCode).toHaveBeenCalledWith(
      '13800138000',
      '123456',
    );
    expect(usersService.createSmsUser).toHaveBeenCalledWith('13800138000');
  });

  it('revokes the authenticated session on logout', async () => {
    await authService.logout({
      id: 'user-1',
      username: 'admin',
      sessionId: 'session-1',
    });

    expect(authRepository.revokeSession).toHaveBeenCalledWith(
      'session-1',
      'user-1',
    );
  });
});
