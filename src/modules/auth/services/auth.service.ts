import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { User } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { UsersService } from '../../users/services/users.service.js';
import { LoginPasswordDto } from '../dto/login-password.dto.js';
import { LoginSmsDto } from '../dto/login-sms.dto.js';
import { RegisterDto } from '../dto/register.dto.js';
import { SendSmsCodeDto } from '../dto/send-sms-code.dto.js';
import { AuthRepository } from '../repositories/auth.repository.js';
import { hashPassword, verifyPassword } from '../security/password.js';
import type {
  AuthResult,
  AuthenticatedUser,
  PublicUser,
  SendSmsCodeResult,
} from '../types/auth.types.js';
import { TokenService } from './token.service.js';
import { VerificationCodeService } from './verification-code.service.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly authRepository: AuthRepository,
    private readonly tokenService: TokenService,
    private readonly verificationCodeService: VerificationCodeService,
  ) {}

  async register(dto: RegisterDto): Promise<AuthResult> {
    const user = await this.usersService.register(
      dto.username,
      hashPassword(dto.password),
    );
    return this.issueToken(user);
  }

  async login(dto: LoginPasswordDto): Promise<AuthResult> {
    const user = await this.usersService.findByUsername(dto.username);

    if (!user?.passwordHash || !verifyPassword(dto.password, user.passwordHash)) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    return this.issueToken(user);
  }

  async sendSmsCode(dto: SendSmsCodeDto): Promise<SendSmsCodeResult> {
    const expiresIn = await this.verificationCodeService.sendLoginCode(
      dto.phone,
    );

    return {
      message: '验证码已发送',
      expiresIn,
    };
  }

  async loginBySms(dto: LoginSmsDto): Promise<AuthResult> {
    await this.verificationCodeService.verifyLoginCode(dto.phone, dto.code);
    const user =
      (await this.usersService.findByPhone(dto.phone)) ??
      (await this.usersService.createSmsUser(dto.phone));

    return this.issueToken(user);
  }

  async logout(user: AuthenticatedUser): Promise<void> {
    await this.authRepository.revokeSession(user.sessionId, user.id);
  }

  private async issueToken(user: User): Promise<AuthResult> {
    const expiresIn = this.tokenService.getAccessTokenExpiresIn();
    const sessionId = randomUUID();
    const publicUser = this.toPublicUser(user);
    const accessToken = this.tokenService.createAccessToken(
      publicUser,
      sessionId,
    );

    await this.authRepository.createSession({
      id: sessionId,
      userId: user.id,
      tokenHash: this.tokenService.hashAccessToken(accessToken),
      expiresAt: new Date(Date.now() + expiresIn * 1000),
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn,
      user: publicUser,
    };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      username: user.username,
      phone: user.phone,
    };
  }
}
