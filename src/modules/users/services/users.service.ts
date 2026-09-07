import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import { hashPassword } from '../../auth/security/password.js';
import type { CreateUserDto } from '../dto/create-user.dto.js';
import type { QueryUsersDto } from '../dto/query-users.dto.js';
import type { UpdateUserDto } from '../dto/update-user.dto.js';
import {
  UsersRepository,
  type PublicUserRecord,
} from '../repositories/users.repository.js';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findByUsername(username);
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findByPhone(phone);
  }

  async register(username: string, passwordHash: string): Promise<User> {
    try {
      return await this.usersRepository.create({
        username,
        passwordHash,
      });
    } catch (error) {
      this.rethrowDatabaseError(error, '用户名已存在');
    }
  }

  async createSmsUser(phone: string): Promise<User> {
    try {
      return await this.usersRepository.create({
        phone,
        phoneVerifiedAt: new Date(),
      });
    } catch (error) {
      if (this.isUniqueConstraintViolation(error)) {
        const existingUser = await this.findByPhone(phone);
        if (existingUser) {
          return existingUser;
        }
      }
      throw error;
    }
  }

  async list(dto: QueryUsersDto) {
    const { items, total } = await this.usersRepository.findPage({
      username: dto.username,
      phone: dto.phone,
      skip: (dto.page - 1) * dto.pageSize,
      take: dto.pageSize,
    });

    return {
      items,
      page: dto.page,
      pageSize: dto.pageSize,
      total,
    };
  }

  async getById(id: string): Promise<PublicUserRecord> {
    const user = await this.usersRepository.findById(id);

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }

  async createByAdmin(dto: CreateUserDto): Promise<PublicUserRecord> {
    if (!dto.username && !dto.phone) {
      throw new BadRequestException('username 或 phone 至少提供一个');
    }

    if (dto.username && !dto.password) {
      throw new BadRequestException('用户名账号必须设置密码');
    }

    if (!dto.username && dto.password) {
      throw new BadRequestException('password 只能用于用户名账号');
    }

    try {
      const user = await this.usersRepository.create({
        ...(dto.username === undefined ? {} : { username: dto.username }),
        ...(dto.phone === undefined ? {} : { phone: dto.phone }),
        ...(dto.password === undefined
          ? {}
          : { passwordHash: hashPassword(dto.password) }),
      });

      return this.toPublicUser(user);
    } catch (error) {
      this.rethrowDatabaseError(error, '用户名或手机号已存在');
    }
  }

  async updateProfile(
    id: string,
    dto: UpdateUserDto,
  ): Promise<PublicUserRecord> {
    if (dto.phone === undefined) {
      throw new BadRequestException('至少提供一个可更新字段');
    }

    try {
      return await this.usersRepository.updatePublicProfile(id, {
        phone: dto.phone,
        phoneVerifiedAt: null,
      });
    } catch (error) {
      this.rethrowDatabaseError(error, '用户名或手机号已存在');
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.usersRepository.deleteById(id);
    } catch (error) {
      this.rethrowDatabaseError(error, '用户不存在');
    }
  }

  private toPublicUser(user: User): PublicUserRecord {
    return {
      id: user.id,
      username: user.username,
      phone: user.phone,
      phoneVerifiedAt: user.phoneVerifiedAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private rethrowDatabaseError(
    error: unknown,
    uniqueMessage: string,
  ): never {
    if (this.isUniqueConstraintViolation(error)) {
      throw new ConflictException(uniqueMessage);
    }

    if (this.isRecordNotFound(error)) {
      throw new NotFoundException('用户不存在');
    }

    throw error;
  }

  private isRecordNotFound(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    );
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
