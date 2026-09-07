import { Injectable } from '@nestjs/common';
import type { Prisma, User } from '@prisma/client';
import { PrismaService } from '../../../database/prisma/prisma.service.js';

export const publicUserSelect = {
  id: true,
  username: true,
  phone: true,
  phoneVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export type PublicUserRecord = Prisma.UserGetPayload<{
  select: typeof publicUserSelect;
}>;

@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { phone },
    });
  }

  findById(id: string): Promise<PublicUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  async findPage(params: {
    keyword?: string;
    username?: string;
    phone?: string;
    skip: number;
    take: number;
  }): Promise<{ items: PublicUserRecord[]; total: number }> {
    const andConditions: Prisma.UserWhereInput[] = [];

    if (params.username) {
      andConditions.push({
        username: {
          contains: params.username,
          mode: 'insensitive',
        },
      });
    }

    if (params.phone) {
      andConditions.push({
        phone: {
          contains: params.phone,
        },
      });
    }

    if (params.keyword) {
      andConditions.push({
        OR: [
          {
            username: {
              contains: params.keyword,
              mode: 'insensitive',
            },
          },
          { phone: { contains: params.keyword } },
        ],
      });
    }

    const where: Prisma.UserWhereInput =
      andConditions.length > 0 ? { AND: andConditions } : {};

    const [items, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: publicUserSelect,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: params.skip,
        take: params.take,
      }),
      this.prisma.user.count({ where }),
    ]);

    return { items, total };
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }

  updatePublicProfile(
    id: string,
    data: Prisma.UserUpdateInput,
  ): Promise<PublicUserRecord> {
    return this.prisma.user.update({
      where: { id },
      data,
      select: publicUserSelect,
    });
  }

  deleteById(id: string): Promise<User> {
    return this.prisma.user.delete({
      where: { id },
    });
  }
}
