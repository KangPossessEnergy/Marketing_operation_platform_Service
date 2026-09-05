import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module.js';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './controllers/auth.controller.js';
import { MockSmsGateway } from './gateways/mock-sms.gateway.js';
import { SMS_GATEWAY } from './gateways/sms.gateway.js';
import { AccessTokenGuard } from './guards/access-token.guard.js';
import { AuthRepository } from './repositories/auth.repository.js';
import { AuthService } from './services/auth.service.js';
import { TokenService } from './services/token.service.js';
import { VerificationCodeService } from './services/verification-code.service.js';

@Module({
  imports: [PrismaModule, UsersModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthRepository,
    TokenService,
    VerificationCodeService,
    AccessTokenGuard,
    MockSmsGateway,
    {
      provide: SMS_GATEWAY,
      useExisting: MockSmsGateway,
    },
  ],
  exports: [AccessTokenGuard],
})
export class AuthModule {}
