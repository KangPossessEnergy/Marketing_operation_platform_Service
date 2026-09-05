import { Injectable } from '@nestjs/common';
import type {
  AuthSession,
  SmsVerificationCode,
} from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service.js';

@Injectable()
export class AuthRepository {
  constructor(private readonly prisma: PrismaService) {}

  createSession(data: {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
  }): Promise<AuthSession> {
    return this.prisma.authSession.create({ data });
  }

  findActiveSession(
    sessionId: string,
    userId: string,
    tokenHash: string,
    now: Date,
  ): Promise<AuthSession | null> {
    return this.prisma.authSession.findFirst({
      where: {
        id: sessionId,
        userId,
        tokenHash,
        revokedAt: null,
        expiresAt: { gt: now },
      },
    });
  }

  async revokeSession(sessionId: string, userId: string): Promise<void> {
    await this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        userId,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });
  }

  findLatestSmsCode(
    phone: string,
    purpose: string,
  ): Promise<SmsVerificationCode | null> {
    return this.prisma.smsVerificationCode.findFirst({
      where: { phone, purpose },
      orderBy: { createdAt: 'desc' },
    });
  }

  createSmsCode(data: {
    phone: string;
    purpose: string;
    codeHash: string;
    expiresAt: Date;
  }): Promise<SmsVerificationCode> {
    return this.prisma.smsVerificationCode.create({ data });
  }

  async incrementSmsAttempts(id: string): Promise<void> {
    await this.prisma.smsVerificationCode.update({
      where: { id },
      data: { attempts: { increment: 1 } },
    });
  }

  async consumeSmsCode(id: string, now: Date): Promise<boolean> {
    const result = await this.prisma.smsVerificationCode.updateMany({
      where: {
        id,
        consumedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        consumedAt: now,
      },
    });

    return result.count === 1;
  }
}
