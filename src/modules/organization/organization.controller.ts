import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { CreateOrganizationNodeDto } from './dto/create-organization-node.dto.js';
import { UpdateOrganizationNodeDto } from './dto/update-organization-node.dto.js';
import { OrganizationService } from './services/organization.service.js';

@Controller('organizations')
@UseGuards(AccessTokenGuard)
export class OrganizationController {
  constructor(
    private readonly organizationService: OrganizationService,
  ) {}

  @Get('tree')
  listTree() {
    return this.organizationService.listTree();
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.organizationService.getById(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateOrganizationNodeDto) {
    return this.organizationService.create(dto);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateOrganizationNodeDto) {
    return this.organizationService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.organizationService.remove(id);
  }
}
