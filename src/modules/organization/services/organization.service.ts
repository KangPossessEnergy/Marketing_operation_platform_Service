import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { OrganizationNodeType } from '@prisma/client';
import type { CreateOrganizationNodeDto } from '../dto/create-organization-node.dto.js';
import type { UpdateOrganizationNodeDto } from '../dto/update-organization-node.dto.js';
import {
  OrganizationRepository,
  type OrganizationNodeRecord,
} from '../repositories/organization.repository.js';

export type OrganizationTreeNode = OrganizationNodeRecord & {
  depth: number;
  children: OrganizationTreeNode[];
  canCreateChild: boolean;
  canEdit: boolean;
  canDelete: boolean;
};

const childTypeByParent: Partial<
  Record<OrganizationNodeType, OrganizationNodeType>
> = {
  ROOT: 'REGION',
  REGION: 'AGENT',
  AGENT: 'STORE',
};

const typeLabel: Record<OrganizationNodeType, string> = {
  ROOT: '平台',
  REGION: '区域',
  AGENT: '一级代理商',
  STORE: '门店',
};

@Injectable()
export class OrganizationService {
  constructor(private readonly organizationRepository: OrganizationRepository) {}

  async listTree(): Promise<{
    items: OrganizationTreeNode[];
    total: number;
  }> {
    const records = await this.organizationRepository.findAll();
    const nodes = new Map<string, OrganizationTreeNode>();

    for (const record of records) {
      nodes.set(record.id, this.toTreeNode(record, 1));
    }

    const roots: OrganizationTreeNode[] = [];

    for (const node of nodes.values()) {
      if (!node.parentId) {
        roots.push(node);
        continue;
      }

      const parent = nodes.get(node.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const assignDepth = (treeNodes: OrganizationTreeNode[], depth: number) => {
      for (const node of treeNodes) {
        node.depth = depth;
        assignDepth(node.children, depth + 1);
      }
    };

    assignDepth(roots, 1);
    this.sortTree(roots);
    return { items: roots, total: records.length };
  }

  async getById(id: string) {
    const node = await this.organizationRepository.findById(id);

    if (!node) {
      throw new NotFoundException('组织节点不存在');
    }

    return this.toTreeNode(node, await this.getDepth(node));
  }

  async create(dto: CreateOrganizationNodeDto) {
    const parent = dto.parentId
      ? await this.getRequiredNode(dto.parentId)
      : null;

    if (
      !parent &&
      (await this.organizationRepository.countByType('ROOT')) > 0
    ) {
      throw new BadRequestException('平台根节点只能有一个');
    }

    const type = this.getCreateType(parent?.type);

    await this.validateName(dto.name, parent?.id ?? null);
    this.validateDetails(type, dto);

    try {
      return await this.organizationRepository.create({
        name: dto.name,
        code: dto.code,
        type,
        ...(parent ? { parent: { connect: { id: parent.id } } } : {}),
        contactName: dto.contactName,
        address: dto.address,
        contactPhone: dto.contactPhone,
        region: dto.region,
        province: dto.province,
      });
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  async update(id: string, dto: UpdateOrganizationNodeDto) {
    const node = await this.getRequiredNode(id);

    if (dto.name !== undefined) {
      await this.validateName(dto.name, node.parentId, node.id);
    }

    const merged = {
      ...node,
      ...dto,
    };
    this.validateDetails(node.type, {
      name: merged.name,
      code: merged.code,
      contactName: merged.contactName ?? undefined,
      address: merged.address ?? undefined,
      contactPhone: merged.contactPhone ?? undefined,
      region: merged.region ?? undefined,
      province: merged.province ?? undefined,
    });

    try {
      return await this.organizationRepository.update(id, {
        ...(dto.name === undefined ? {} : { name: dto.name }),
        ...(dto.code === undefined ? {} : { code: dto.code }),
        ...(dto.contactName === undefined
          ? {}
          : { contactName: dto.contactName }),
        ...(dto.address === undefined ? {} : { address: dto.address }),
        ...(dto.contactPhone === undefined
          ? {}
          : { contactPhone: dto.contactPhone }),
        ...(dto.region === undefined ? {} : { region: dto.region }),
        ...(dto.province === undefined ? {} : { province: dto.province }),
      });
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  async remove(id: string): Promise<void> {
    const node = await this.getRequiredNode(id);

    if (node.type === 'ROOT') {
      throw new BadRequestException('平台节点不能删除');
    }

    const childCount = await this.organizationRepository.countChildren(id);
    if (childCount > 0) {
      throw new ConflictException('请先删除下级组织节点');
    }

    try {
      await this.organizationRepository.deleteById(id);
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  private async getRequiredNode(id: string): Promise<OrganizationNodeRecord> {
    const node = await this.organizationRepository.findById(id);

    if (!node) {
      throw new NotFoundException('组织节点不存在');
    }

    return node;
  }

  private getCreateType(parentType?: OrganizationNodeType): OrganizationNodeType {
    if (!parentType) {
      return 'ROOT';
    }

    const childType = childTypeByParent[parentType];
    if (!childType) {
      throw new BadRequestException(`${typeLabel[parentType]}不能新增下级节点`);
    }

    return childType;
  }

  private async validateName(
    name: string,
    parentId: string | null,
    excludeId?: string,
  ): Promise<void> {
    const duplicate = await this.organizationRepository.findFirstByParentAndName(
      parentId,
      name,
      excludeId,
    );

    if (duplicate) {
      throw new ConflictException('同级组织节点名称不能重复');
    }
  }

  private validateDetails(
    type: OrganizationNodeType,
    dto: Partial<CreateOrganizationNodeDto> & {
      name: string;
      code: string;
    },
  ): void {
    if (!dto.name || !dto.code) {
      throw new BadRequestException('名称和编码不能为空');
    }

    if (type === 'REGION') {
      return;
    }

    if (!dto.contactName || !dto.address || !dto.contactPhone) {
      throw new BadRequestException(
        `${typeLabel[type]}必须填写联系人、联系电话和地址`,
      );
    }
  }

  private async getDepth(node: OrganizationNodeRecord): Promise<number> {
    let depth = 1;
    let currentParentId = node.parentId;

    while (currentParentId) {
      const parent = await this.organizationRepository.findById(currentParentId);
      if (!parent) {
        break;
      }
      depth += 1;
      currentParentId = parent.parentId;
    }

    return depth;
  }

  private toTreeNode(
    record: OrganizationNodeRecord,
    depth: number,
  ): OrganizationTreeNode {
    return {
      ...record,
      depth,
      children: [],
      canCreateChild: Boolean(childTypeByParent[record.type]),
      canEdit: true,
      canDelete: record.type !== 'ROOT',
    };
  }

  private sortTree(nodes: OrganizationTreeNode[]): void {
    nodes.sort(
      (left, right) =>
        left.sortOrder - right.sortOrder ||
        left.name.localeCompare(right.name, 'zh-CN') ||
        left.id.localeCompare(right.id),
    );

    for (const node of nodes) {
      this.sortTree(node.children);
    }
  }

  private rethrowDatabaseError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('组织编码已存在');
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('组织节点不存在');
    }

    throw error;
  }
}
