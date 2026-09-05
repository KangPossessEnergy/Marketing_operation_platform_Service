import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../../modules/auth/types/auth.types.js';

export const CurrentAuthUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => {
    const request =
      context.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);
