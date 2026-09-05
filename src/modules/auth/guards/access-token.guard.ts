import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthRepository } from '../repositories/auth.repository.js';
import { TokenService } from '../services/token.service.js';
import type { AuthenticatedRequest } from '../types/auth.types.js';

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly tokenService: TokenService,
    private readonly authRepository: AuthRepository,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractBearerToken(request.headers.authorization);
    const payload = this.tokenService.verifyAccessToken(token);
    const session = await this.authRepository.findActiveSession(
      payload.sid,
      payload.sub,
      this.tokenService.hashAccessToken(token),
      new Date(),
    );

    if (!session) {
      throw new UnauthorizedException('登录状态无效或已退出');
    }

    request.user = {
      id: payload.sub,
      username: payload.username,
      sessionId: payload.sid,
    };
    return true;
  }

  private extractBearerToken(authorization: string | undefined): string {
    const match = authorization?.match(/^Bearer\s+(.+)$/i);

    if (!match?.[1]) {
      throw new UnauthorizedException('请提供 Bearer 访问令牌');
    }

    return match[1];
  }
}
