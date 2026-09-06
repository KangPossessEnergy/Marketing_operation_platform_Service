# NestJS: 按企业分层实现可用的用户 CRUD

本项目已经有认证、Prisma、全局 DTO 校验和 `UsersService`。这一篇把它们组织成一
个可真正干活的 CRUD 模块：管理员可创建、分页查询、查看、更新和删除用户；普通
用户只能读取或修改自己获准的资源。示例保持与当前 ESM TypeScript、Prisma 7 和
目录结构一致。

相关教程：

- [PostgreSQL 数据设计](./postgresql.md)
- [Prisma 数据访问](./prisma.md)
- [Node.js 运行时与安全](./nodejs.md)

## 1. 先定义接口合同

不要从 Controller 代码开始。先定义谁能操作什么资源、字段允许怎样变化、成功和
失败时返回什么。

| 操作 | 路由                            | 成功响应                     | 必要策略                       |
| ---- | ------------------------------- | ---------------------------- | ------------------------------ |
| 创建 | `POST /users`                   | `201 Created` + 公共用户字段 | 管理员或受控注册流             |
| 列表 | `GET /users?page=1&pageSize=20` | `200 OK` + 分页数据          | 管理员                         |
| 详情 | `GET /users/:id`                | `200 OK`                     | 管理员或本人                   |
| 更新 | `PATCH /users/:id`              | `200 OK`                     | 管理员或本人，字段白名单       |
| 删除 | `DELETE /users/:id`             | `204 No Content`             | 管理员，先定义软删除或物理删除 |

当前项目的认证路由已经占用了注册、登录和 logout，因此不要把
`POST /users` 当作公开注册接口。公开注册继续使用 `POST /auth/register`；
`/users` 应定位为受保护的用户资源管理接口。

返回用户的统一形状：

```ts
export type PublicUser = {
  id: string;
  username: string | null;
  phone: string | null;
  phoneVerifiedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
```

不包含 `passwordHash`、会话 token、token 哈希和短信验证码。

## 2. 模块边界

推荐目录：

```text
src/modules/users/
  dto/
    create-user.dto.ts
    update-user.dto.ts
    query-users.dto.ts
  repositories/
    users.repository.ts
  services/
    users.service.ts
  users.controller.ts
  users.module.ts
```

请求流保持单向：

```text
UsersController
  -> UsersService
  -> UsersRepository
  -> PrismaService
  -> PostgreSQL
```

Controller 只处理 HTTP 语义；Service 执行授权后的业务规则、密码哈希和异常翻译；
Repository 集中 Prisma 查询。这样数据库替换、单元测试和复杂查询优化都不会蔓延
到每个 Controller。

## 3. 全局 DTO 校验必须保持开启

当前 `src/main.ts` 已调用 `createValidationPipe()`。确认它至少具备如下配置：

```ts
import { ValidationPipe } from '@nestjs/common';

export function createValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    transformOptions: {
      enableImplicitConversion: false,
    },
  });
}
```

- `transform` 让 DTO 转换器和数值转换生效；
- `whitelist` 删除没有装饰器声明的字段；
- `forbidNonWhitelisted` 直接拒绝多余字段，能更早暴露客户端错误；
- 不依赖隐式类型转换，日期、数字和枚举要明确转换和验证。

这只是入口保护。DTO 通过不等于用户有权限修改所有可写字段。

## 4. 编写 DTO：字段白名单与分页上限

创建管理用户的 DTO：

```ts
// src/modules/users/dto/create-user.dto.ts
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Length, Matches } from 'class-validator';

export class CreateUserDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_]+$/, {
    message: 'username 只能包含字母、数字和下划线',
  })
  username?: string;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^1[3-9]\d{9}$/, {
    message: 'phone 必须是有效的中国大陆手机号',
  })
  phone?: string;

  @IsOptional()
  @IsString()
  @Length(6, 128)
  password?: string;
}
```

DTO 允许可选字段不代表任意组合都合法。例如创建账户至少需要一种可登录身份和
对应认证方式，这类跨字段规则应在 Service 中校验。

更新 DTO 只保留允许变更的资料字段。不要使用“把 Create DTO 所有字段 Partial
一下”的习惯性写法，因为创建可写不代表更新可写：

```ts
// src/modules/users/dto/update-user.dto.ts
import { Transform } from 'class-transformer';
import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Matches(/^1[3-9]\d{9}$/, {
    message: 'phone 必须是有效的中国大陆手机号',
  })
  phone?: string;
}
```

分页 DTO 应在服务端限制最大值：

```ts
// src/modules/users/dto/query-users.dto.ts
import { Transform, Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Length, Max, Min } from 'class-validator';

export class QueryUsersDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @Length(1, 64)
  keyword?: string;
}
```

## 5. 扩展 Repository：只放数据访问细节

下例在现有 `UsersRepository` 上增加读取、更新和删除方法。注意公共 `select`
从查询源头隔离敏感字段：

```ts
// src/modules/users/repositories/users.repository.ts
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

  findById(id: string): Promise<PublicUserRecord | null> {
    return this.prisma.user.findUnique({
      where: { id },
      select: publicUserSelect,
    });
  }

  async findPage(params: {
    keyword?: string;
    skip: number;
    take: number;
  }): Promise<{ items: PublicUserRecord[]; total: number }> {
    const where: Prisma.UserWhereInput = params.keyword
      ? {
          OR: [
            { username: { contains: params.keyword, mode: 'insensitive' } },
            { phone: { contains: params.keyword } },
          ],
        }
      : {};

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
```

保留现有的 `findByUsername`、`findByPhone` 和 `create`，因为认证服务仍依赖它们。
不要为了添加 CRUD 而破坏已有登录流程。

## 6. Service：业务规则、错误翻译与权限入口

Service 不接收 `Request`，也不返回 Express `Response`。它接收明确参数，生成
领域结果并翻译数据库异常。下面是把 CRUD 能力**增量合并到当前
`UsersService`** 的完整示例；不要用它删除认证模块已经使用的方法：

```ts
// src/modules/users/services/users.service.ts
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { User } from '@prisma/client';
import type { PublicUserRecord } from '../repositories/users.repository.js';
import { UsersRepository } from '../repositories/users.repository.js';
import { hashPassword } from '../../auth/security/password.js';
import type { CreateUserDto } from '../dto/create-user.dto.js';
import type { QueryUsersDto } from '../dto/query-users.dto.js';
import type { UpdateUserDto } from '../dto/update-user.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly usersRepository: UsersRepository) {}

  // 认证流程已有的方法必须保留。
  findByUsername(username: string): Promise<User | null> {
    return this.usersRepository.findByUsername(username);
  }

  findByPhone(phone: string): Promise<User | null> {
    return this.usersRepository.findByPhone(phone);
  }

  async register(username: string, passwordHash: string): Promise<User> {
    try {
      return await this.usersRepository.create({ username, passwordHash });
    } catch (error) {
      this.rethrowDatabaseError(error);
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
      keyword: dto.keyword,
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
      throw new ConflictException('username 或 phone 至少提供一个');
    }
    if (dto.username && !dto.password) {
      throw new ConflictException('用户名账号必须设置密码');
    }

    try {
      const user = await this.usersRepository.create({
        username: dto.username,
        phone: dto.phone,
        passwordHash: dto.password
          ? await hashPassword(dto.password)
          : undefined,
      });

      return {
        id: user.id,
        username: user.username,
        phone: user.phone,
        phoneVerifiedAt: user.phoneVerifiedAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  async updateProfile(
    id: string,
    dto: UpdateUserDto,
  ): Promise<PublicUserRecord> {
    try {
      return await this.usersRepository.updatePublicProfile(id, {
        ...(dto.phone === undefined ? {} : { phone: dto.phone }),
        ...(dto.phone === undefined ? {} : { phoneVerifiedAt: null }),
      });
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.usersRepository.deleteById(id);
    } catch (error) {
      this.rethrowDatabaseError(error);
    }
  }

  private rethrowDatabaseError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    ) {
      throw new ConflictException('用户名或手机号已存在');
    }
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('用户不存在');
    }
    throw error;
  }

  private isUniqueConstraintViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
```

上例沿用当前同步密码哈希函数的调用形状；如果按
[Node.js 教程](./nodejs.md) 改成异步 `hashPassword`，这里的 `await` 已经能适配。

真实企业项目不要用 `ConflictException` 表达“缺少字段”这种请求校验错误。更好的
做法是通过 class-level validator 或在 Service 抛出 `BadRequestException`。为减少
示例噪声，上例聚焦了跨字段不变量；落地时请改成最贴合接口语义的异常。

“管理员还是本人”的授权检查也放在 Service 或专用 policy guard 中。例如：

```ts
function assertCanReadUser(
  actor: { id: string; isAdmin: boolean },
  targetId: string,
) {
  if (!actor.isAdmin && actor.id !== targetId) {
    throw new ForbiddenException('无权访问该用户');
  }
}
```

当前 schema 尚未包含角色字段，因此不要假装已经有 `isAdmin`。先把角色、权限和
数据迁移一起设计，再启用管理 API。

## 7. Controller：让 HTTP 语义清楚而薄

```ts
// src/modules/users/users.controller.ts
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
  Query,
  UseGuards,
} from '@nestjs/common';
import { AccessTokenGuard } from '../auth/guards/access-token.guard.js';
import { CreateUserDto } from './dto/create-user.dto.js';
import { QueryUsersDto } from './dto/query-users.dto.js';
import { UpdateUserDto } from './dto/update-user.dto.js';
import { UsersService } from './services/users.service.js';

@Controller('users')
@UseGuards(AccessTokenGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateUserDto) {
    return this.usersService.createByAdmin(dto);
  }

  @Get()
  list(@Query() dto: QueryUsersDto) {
    return this.usersService.list(dto);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.usersService.getById(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.updateProfile(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Param('id') id: string): Promise<void> {
    await this.usersService.remove(id);
  }
}
```

把 Controller 加入模块：

```ts
@Module({
  imports: [PrismaModule],
  controllers: [UsersController],
  providers: [UsersRepository, UsersService],
  exports: [UsersService],
})
export class UsersModule {}
```

`AuthModule` 当前已经导入 `UsersModule`，因此 `UsersModule` 的 Controller 会随
模块图加载，不需要在 `AppModule` 再重复导入。若以后用户模块不再被
`AuthModule` 使用，再把它直接加入 `AppModule` 的 `imports`；关键是它必须存在于
最终的 NestJS 模块图中。

示例中的 `AccessTokenGuard` 只认证登录状态。上线前必须为所有管理路由补齐角色
或权限 Guard，不能让任意已登录用户枚举和删除全部账户。

## 8. API 调用与预期结果

先启动服务：

```bash
pnpm start:dev
```

登录获取 token：

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

带上返回的 `accessToken` 再调用用户资源：

```bash
curl "http://localhost:3000/users?page=1&pageSize=20&keyword=admin" \
  -H "Authorization: Bearer <access-token>"
```

一个规范的分页响应可以是：

```json
{
  "items": [
    {
      "id": "cm...",
      "username": "admin",
      "phone": null,
      "phoneVerifiedAt": null,
      "createdAt": "2026-09-06T00:00:00.000Z",
      "updatedAt": "2026-09-06T00:00:00.000Z"
    }
  ],
  "page": 1,
  "pageSize": 20,
  "total": 1
}
```

不要把 `total` 当作所有场景的硬性要求。大表的实时 `COUNT(*)` 可能昂贵；无限
滚动可返回 `items`、`nextCursor` 和 `hasNextPage`，详见
[Prisma 分页章节](./prisma.md)。

## 9. 测试：验证真正容易出错的行为

最少覆盖这些单元测试：

- 用户名、手机号唯一冲突映射为 `409`；
- 查询不存在用户映射为 `404`；
- `pageSize=101`、未知字段、空字符串被 DTO 拒绝；
- 用户响应没有 `passwordHash`；
- 更新手机号会清除之前的验证时间；
- 普通用户无法读取、修改或删除其他用户；
- 删除用户后的会话级联行为符合设计。

e2e 测试用真实的隔离数据库验证 API 合同，而不只 mock Prisma：

```ts
await request(app.getHttpServer())
  .get('/users?page=1&pageSize=20')
  .set('Authorization', `Bearer ${accessToken}`)
  .expect(200)
  .expect(({ body }) => {
    expect(body.items).toBeInstanceOf(Array);
    expect(body.items[0]).not.toHaveProperty('passwordHash');
  });
```

当前项目已有 `test/app.e2e-spec.ts` 和 `AuthService` 单元测试；把新 CRUD 覆盖接在
同一套测试约定上。测试产生的数据要使用专用测试库或每次测试后清理，绝不能指向
真实开发、更不能指向生产数据库。

## 10. 从教程到上线的最后一步

在真正开放 `/users` CRUD 前，逐项确认：

- 角色/权限模型已设计、迁移并由服务端 Guard 强制执行。
- 删除语义明确：物理删除、禁用或软删除不会相互矛盾。
- DTO 有字段白名单、格式校验、跨字段规则和分页上限。
- 统一响应不泄漏敏感字段；错误响应不泄漏数据库细节。
- 所有列表查询有稳定排序，深分页策略经过数据量评估。
- 唯一冲突、记录不存在、并发更新和会话级联都有真实数据库测试。
- 迁移已审查，预发布环境完成回归与发布演练。
- 日志、指标、审计和告警能回答“谁在何时对哪条数据做了什么”。

做到这些，CRUD 才不只是四个 HTTP 动词，而是一套能在多人协作、数据增长和生产
故障中继续站得住的业务能力。
