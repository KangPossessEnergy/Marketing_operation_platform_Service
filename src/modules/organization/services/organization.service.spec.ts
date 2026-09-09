import { BadRequestException, ConflictException } from '@nestjs/common';
import type { OrganizationNodeType } from '@prisma/client';
import { OrganizationService } from './organization.service.js';

type FakeNode = {
  id: string;
  parentId: string | null;
  type: OrganizationNodeType;
  name: string;
  code: string;
  contactName: string | null;
  address: string | null;
  contactPhone: string | null;
  region: string | null;
  province: string | null;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

const createFakeRepository = () => {
  const nodes: FakeNode[] = [];
  let sequence = 1;

  const repository = {
    findAll: vi.fn(async () => nodes),
    findById: vi.fn(async (id: string) => nodes.find((node) => node.id === id) ?? null),
    findFirstByParentAndName: vi.fn(
      async (parentId: string | null, name: string, excludeId?: string) =>
        nodes.find(
          (node) =>
            node.parentId === parentId &&
            node.name === name &&
            node.id !== excludeId,
        ) ?? null,
    ),
    countByType: vi.fn(
      async (type: OrganizationNodeType) =>
        nodes.filter((node) => node.type === type).length,
    ),
    create: vi.fn(async (data: Record<string, unknown>) => {
      const parentId =
        (data.parentId as string | null | undefined) ??
        ((data.parent as { connect?: { id: string } } | undefined)?.connect?.id ??
          null);
      const node: FakeNode = {
        id: `node-${sequence++}`,
        parentId,
        type: data.type as OrganizationNodeType,
        name: data.name as string,
        code: data.code as string,
        contactName: (data.contactName as string | null | undefined) ?? null,
        address: (data.address as string | null | undefined) ?? null,
        contactPhone: (data.contactPhone as string | null | undefined) ?? null,
        region: (data.region as string | null | undefined) ?? null,
        province: (data.province as string | null | undefined) ?? null,
        sortOrder: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      nodes.push(node);
      return node;
    }),
    update: vi.fn(),
    countChildren: vi.fn(
      async (parentId: string) =>
        nodes.filter((node) => node.parentId === parentId).length,
    ),
    deleteById: vi.fn(async (id: string) => {
      const index = nodes.findIndex((node) => node.id === id);
      return nodes.splice(index, 1)[0];
    }),
  };

  return { nodes, repository };
};

const details = {
  contactName: '联系人',
  contactPhone: '13800138000',
  address: '测试地址',
};

describe('OrganizationService', () => {
  it('creates the platform, region, agent and store hierarchy', async () => {
    const { repository } = createFakeRepository();
    const service = new OrganizationService(repository as never);

    const root = await service.create({
      name: '天猫精灵',
      code: 'TMALL',
      ...details,
    });
    const region = await service.create({
      parentId: root.id,
      name: '华南',
      code: 'SOUTH',
    });
    const agent = await service.create({
      parentId: region.id,
      name: '森亚计算机',
      code: 'SENYA',
      ...details,
    });
    const store = await service.create({
      parentId: agent.id,
      name: '东莞专卖店',
      code: 'DONGGUAN_STORE',
      ...details,
    });

    expect(root.type).toBe('ROOT');
    expect(region.type).toBe('REGION');
    expect(agent.type).toBe('AGENT');
    expect(store.type).toBe('STORE');
  });

  it('rejects a second platform and store children', async () => {
    const { repository } = createFakeRepository();
    const service = new OrganizationService(repository as never);

    await service.create({
      name: '平台',
      code: 'ROOT',
      ...details,
    });

    await expect(
      service.create({
        name: '另一个平台',
        code: 'ROOT_2',
        ...details,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    const region = await service.create({
      parentId: (await repository.findById('node-1'))!.id,
      name: '华东',
      code: 'EAST',
    });
    const agent = await service.create({
      parentId: region.id,
      name: '代理商',
      code: 'AGENT',
      ...details,
    });
    const store = await service.create({
      parentId: agent.id,
      name: '门店',
      code: 'STORE',
      ...details,
    });

    await expect(
      service.create({
        parentId: store.id,
        name: '越级节点',
        code: 'INVALID',
        ...details,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects deleting a node with children', async () => {
    const { repository } = createFakeRepository();
    const service = new OrganizationService(repository as never);
    const root = await service.create({
      name: '平台',
      code: 'ROOT',
      ...details,
    });
    const region = await service.create({
      parentId: root.id,
      name: '华东',
      code: 'EAST',
    });
    await service.create({
      parentId: region.id,
      name: '代理商',
      code: 'AGENT',
      ...details,
    });

    await expect(service.remove(root.id)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(service.remove(region.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
