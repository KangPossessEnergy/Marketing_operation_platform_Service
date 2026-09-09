import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { OrganizationController } from './organization.controller.js';
import { OrganizationRepository } from './repositories/organization.repository.js';
import { OrganizationService } from './services/organization.service.js';

@Module({
  imports: [PrismaModule, AuthModule],
  controllers: [OrganizationController],
  providers: [OrganizationRepository, OrganizationService],
})
export class OrganizationModule {}
