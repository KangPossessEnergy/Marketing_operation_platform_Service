import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import type { SmsGateway } from '../gateways/sms.gateway.js';
import { SMS_GATEWAY } from '../gateways/sms.gateway.js';
import { AuthRepository } from '../repositories/auth.repository.js';

const SMS_LOGIN_PURPOSE = 'login';

export function hashVerificationCode(
  phone: string,
  code: string,
  secret: string,
): string {
  return createHash('sha256')
    .update(`${secret}:${phone}:${code}`)
    .digest('hex');
}

@Injectable()
export class VerificationCodeService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly config: ConfigService,
    @Inject(SMS_GATEWAY) private readonly smsGateway: SmsGateway,
  ) {}

  async sendLoginCode(phone: string): Promise<number> {
    const now = new Date();
    const resendInterval = this.getConfig('sms.resendInterval', 60);
    const latestCode = await this.authRepository.findLatestSmsCode(
      phone,
      SMS_LOGIN_PURPOSE,
    );

    if (
      latestCode &&
      now.getTime() - latestCode.createdAt.getTime() <
        resendInterval * 1000
    ) {
      throw new HttpException(
        '验证码发送过于频繁，请稍后再试',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = this.getConfig<string | undefined>('sms.fixedCode', undefined)
      ?? randomInt(100000, 1000000).toString();
    const expiresIn = this.getConfig('sms.codeExpiresIn', 300);
    const secret = this.getConfig(
      'sms.codeSecret',
      'nest-learn-development-sms-secret',
    );

    await this.authRepository.createSmsCode({
      phone,
      purpose: SMS_LOGIN_PURPOSE,
      codeHash: hashVerificationCode(phone, code, secret),
      expiresAt: new Date(now.getTime() + expiresIn * 1000),
    });
    await this.smsGateway.send(phone, code);

    return expiresIn;
  }

  async verifyLoginCode(phone: string, code: string): Promise<void> {
    const record = await this.authRepository.findLatestSmsCode(
      phone,
      SMS_LOGIN_PURPOSE,
    );
    const now = new Date();
    const maxAttempts = this.getConfig('sms.maxAttempts', 5);

    if (
      !record ||
      record.consumedAt ||
      record.expiresAt <= now ||
      record.attempts >= maxAttempts
    ) {
      throw new UnauthorizedException('验证码错误或已失效');
    }

    const secret = this.getConfig(
      'sms.codeSecret',
      'nest-learn-development-sms-secret',
    );
    const expectedHash = hashVerificationCode(phone, code, secret);
    const expected = Buffer.from(record.codeHash, 'hex');
    const actual = Buffer.from(expectedHash, 'hex');
    const valid =
      expected.length === actual.length && timingSafeEqual(expected, actual);

    if (!valid) {
      await this.authRepository.incrementSmsAttempts(record.id);
      throw new UnauthorizedException('验证码错误或已失效');
    }

    const consumed = await this.authRepository.consumeSmsCode(record.id, now);
    if (!consumed) {
      throw new UnauthorizedException('验证码错误或已失效');
    }
  }

  private getConfig<T>(key: string, fallback: T): T {
    return this.config.get<T>(key) ?? fallback;
  }
}
