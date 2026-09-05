import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { CurrentAuthUser } from '../../../common/decorators/current-auth-user.decorator.js';
import { LoginPasswordDto } from '../dto/login-password.dto.js';
import { LoginSmsDto } from '../dto/login-sms.dto.js';
import { RegisterDto } from '../dto/register.dto.js';
import { SendSmsCodeDto } from '../dto/send-sms-code.dto.js';
import { AccessTokenGuard } from '../guards/access-token.guard.js';
import { AuthService } from '../services/auth.service.js';
import type {
  AuthResult,
  AuthenticatedUser,
  SendSmsCodeResult,
} from '../types/auth.types.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto): Promise<AuthResult> {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginPasswordDto): Promise<AuthResult> {
    return this.authService.login(dto);
  }

  @Post('sms/send')
  @HttpCode(HttpStatus.OK)
  sendSmsCode(@Body() dto: SendSmsCodeDto): Promise<SendSmsCodeResult> {
    return this.authService.sendSmsCode(dto);
  }

  @Post('login/sms')
  @HttpCode(HttpStatus.OK)
  loginBySms(@Body() dto: LoginSmsDto): Promise<AuthResult> {
    return this.authService.loginBySms(dto);
  }

  @Post('logout')
  @UseGuards(AccessTokenGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@CurrentAuthUser() user: AuthenticatedUser): Promise<void> {
    await this.authService.logout(user);
  }
}
