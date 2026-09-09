import { Injectable } from '@nestjs/common';
import type { OrganizationNode, Prisma } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service.js';

export const organizationNodeSelect = {
  id: true,
  parentId: true,
  type: true,
  name: true,
  code: true,
  contactName: true,
  address: true,
  contactPhone: true,
  region: true,
  province: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.OrganizationNodeSelect;

export type OrganizationNodeRecord = Prisma.OrganizationNodeGetPayload<{
  select: typeof organizationNodeSelect;
}>;

@Injectable()
export class OrganizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAll(): Promise<OrganizationNodeRecord[]> {
    return this.prisma.organizationNode.findMany({
      select: organizationNodeSelect,
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    });
  }

  findById(id: string): Promise<OrganizationNodeRecord | null> {
    return this.prisma.organizationNode.findUnique({
      where: { id },
      select: organizationNodeSelect,
    });
  }

  findFirstByParentAndName(
    parentId: string | null,
    name: string,
    excludeId?: string,
  ): Promise<OrganizationNodeRecord | null> {
    return this.prisma.organizationNode.findFirst({
      where: {
        parentId,
        name,
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      select: organizationNodeSelect,
    });
  }

  countByType(type: OrganizationNode['type']): Promise<number> {
    return this.prisma.organizationNode.count({
      where: { type },
    });
  }

  create(
    data: Prisma.OrganizationNodeCreateInput,
  ): Promise<OrganizationNodeRecord> {
    return this.prisma.organizationNode.create({
      data,
      select: organizationNodeSelect,
    });
  }

  update(
    id: string,
    data: Prisma.OrganizationNodeUpdateInput,
  ): Promise<OrganizationNodeRecord> {
    return this.prisma.organizationNode.update({
      where: { id },
      data,
      select: organizationNodeSelect,
    });
  }

  deleteById(id: string): Promise<OrganizationNodeRecord> {
    return this.prisma.organizationNode.delete({
      where: { id },
      select: organizationNodeSelect,
    });
  }

  countChildren(parentId: string): Promise<number> {
    return this.prisma.organizationNode.count({
      where: { parentId },
    });
  }
}
