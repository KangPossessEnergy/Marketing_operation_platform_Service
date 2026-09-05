import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import { UsersRepository } from '../repositories/users.repository.js';

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
      if (this.isUniqueConstraintViolation(error)) {
        throw new ConflictException('用户名已存在');
      }
      throw error;
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

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
