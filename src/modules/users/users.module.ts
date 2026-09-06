import { forwardRef, Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { UsersRepository } from './repositories/users.repository.js';
import { UsersService } from './services/users.service.js';
import { UsersController } from './users.controller.js';

@Module({
  imports: [PrismaModule, forwardRef(() => AuthModule)],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
