# Prisma: 类型安全地实现数据 CRUD

Prisma 在本项目中的职责是把 PostgreSQL schema、迁移和 TypeScript 数据访问连
起来。它能减少很多重复代码，但不会替你设计索引、处理权限或定义业务规则。
企业级 CRUD 的关键是：让 Prisma 只负责持久化，让 Service 负责业务，让数据库
仍然保存最终约束。

相关教程：

- [PostgreSQL 数据设计](./postgresql.md)
- [Node.js 运行时与安全](./nodejs.md)
- [NestJS CRUD API](./nestjs.md)

## 1. 先读懂本项目的 Prisma 配置

当前项目固定使用 Prisma `7.10.0`。配置分为三处：

| 位置                                    | 作用                                  |
| --------------------------------------- | ------------------------------------- |
| `prisma/schema.prisma`                  | 数据模型、字段映射、关系、索引        |
| `prisma.config.ts`                      | schema 路径、迁移目录、`DATABASE_URL` |
| `src/database/prisma/prisma.service.ts` | NestJS 中唯一的 Prisma Client 实例    |

`prisma/schema.prisma` 的 datasource 只声明数据库类型：

```prisma
datasource db {
  provider = "postgresql"
}
```

连接地址在 `prisma.config.ts` 读取，运行时则由
`PrismaPg({ connectionString: process.env.DATABASE_URL })` 注入客户端。不要把
密码或完整连接串写进 schema、源代码或提交到 Git。

常用命令：

```bash
# schema 变化后生成 TypeScript Client
pnpm db:generate

# 开发环境创建并应用迁移
pnpm db:migrate

# 生产环境只应用仓库中已有的迁移
pnpm db:deploy

# 填充开发数据
pnpm db:seed

# 图形化查看本地数据
pnpm db:studio
```

## 2. Schema 是数据库合同，不是 TypeScript 接口

当前用户模型利用 `@map` 与 `@@map` 同时保持 TypeScript 命名和 SQL 命名清晰：

```prisma
model User {
  id              String        @id @default(cuid())
  username        String?       @unique
  phone           String?       @unique
  passwordHash    String?       @map("password_hash")
  phoneVerifiedAt DateTime?     @map("phone_verified_at")
  createdAt       DateTime      @default(now()) @map("created_at")
  updatedAt       DateTime      @updatedAt @map("updated_at")
  authSessions    AuthSession[]

  @@map("users")
}
```

这意味着：

- 应用写 `user.passwordHash`，数据库列是 `password_hash`；
- Prisma model 名叫 `User`，物理表是 `users`；
- `@unique` 会生成数据库唯一约束，仍必须在 API 层把冲突变成可理解的 `409`；
- `@updatedAt` 由 Prisma 在更新时维护，手工 SQL 更新则需自行维护
  `updated_at`；
- `authSessions` 是关系字段，不是 `users` 表里的真实列。

修改 schema 的顺序应始终是：

1. 先写明业务不变量和数据回填计划。
2. 修改 `schema.prisma`。
3. 运行 `pnpm db:migrate`，审查生成的 SQL。
4. 运行 `pnpm db:generate`，修复 TypeScript 编译错误。
5. 补充 migration、Service 和 e2e 测试。

不要只运行 `db:generate`。它只更新客户端类型，不会改变数据库。

## 3. 一个连接池，一个 PrismaService

NestJS 服务里不应该为每个请求 `new PrismaClient()`。本项目已经封装好单例：

```ts
import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL must be set');
    }

    super({
      adapter: new PrismaPg({ connectionString: databaseUrl }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
```

将它通过 `PrismaModule` 导出后，Repository 注入 `PrismaService` 即可。这样能集中
管理连接生命周期、日志策略和未来的健康检查。

生产环境还应根据部署模型确认连接数：每个 Node.js 进程、每个 worker、每个
serverless 实例都可能占用连接。应用并发数增加时，先看 PostgreSQL 连接池和
数据库上限，不要无条件扩大连接数。

## 4. Repository: 让查询形状可复用、可测试

本项目的 `UsersRepository` 是一个合适的起点：

```ts
@Injectable()
export class UsersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByUsername(username: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  create(data: Prisma.UserCreateInput): Promise<User> {
    return this.prisma.user.create({ data });
  }
}
```

企业 CRUD 继续扩展时，Repository 应接收已经验证和授权后的查询参数，返回清晰
的持久化对象；Controller 不直接拼 Prisma 查询，Service 也不要把 HTTP DTO
原样透传到数据库。

例如，管理员读取用户列表时绝不能默认返回 `passwordHash`：

```ts
import type { Prisma } from '@prisma/client';

const publicUserSelect = {
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
```

`select` 是敏感字段防泄漏的有效边界。不要先 `findMany()` 取全字段，再寄希望于
某一层记得删除密码哈希。

## 5. CRUD 查询与正确的错误映射

### Create

```ts
try {
  return await this.prisma.user.create({
    data: {
      username,
      passwordHash,
    },
    select: publicUserSelect,
  });
} catch (error) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException('用户名或手机号已存在');
  }
  throw error;
}
```

`P2002` 是唯一约束冲突。不要只在创建前 `findUnique` 判断，数据库冲突捕获仍然
必需。

### Read

```ts
const user = await this.prisma.user.findUnique({
  where: { id },
  select: publicUserSelect,
});

if (!user) {
  throw new NotFoundException('用户不存在');
}
return user;
```

从“存储不存在”到“HTTP 404”的翻译应在 Service 完成。Repository 可继续返回
`null`，避免它绑定到 HTTP 框架。

### Update

```ts
try {
  return await this.prisma.user.update({
    where: { id },
    data: {
      phone,
      phoneVerifiedAt: new Date(),
    },
    select: publicUserSelect,
  });
} catch (error) {
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2025'
  ) {
    throw new NotFoundException('用户不存在');
  }
  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  ) {
    throw new ConflictException('手机号已被使用');
  }
  throw error;
}
```

`update` 不存在的记录通常对应 `P2025`。若需要“仅当符合额外条件才更新”，使用
`updateMany` 并检查 `count === 1`，它更适合表达并发安全的条件写入。

### Delete

```ts
const result = await this.prisma.user.deleteMany({
  where: { id },
});

if (result.count !== 1) {
  throw new NotFoundException('用户不存在');
}
```

`deleteMany` 适合需要统一检查受影响行数的场景。实际用户业务应先决定物理删除、
禁用还是软删除，并在所有读取和唯一性策略中一致落实，详见
[PostgreSQL 数据设计](./postgresql.md)。

## 6. 分页：限制必须在服务端

DTO 中把 `pageSize` 限制在一个合理范围，例如 `1..100`。不能接受客户端传
`take: 1000000`。

### 偏移分页

```ts
const page = 1;
const pageSize = 20;

const result = await this.prisma.user.findMany({
  skip: (page - 1) * pageSize,
  take: pageSize,
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  select: publicUserSelect,
});
```

它适合后台跳页；深页访问会越来越慢。

### 游标分页

```ts
const items = await this.prisma.user.findMany({
  take: pageSize + 1,
  ...(cursor
    ? {
        cursor: { id: cursor },
        skip: 1,
      }
    : {}),
  orderBy: { id: 'asc' },
  select: publicUserSelect,
});

const hasNextPage = items.length > pageSize;
const data = hasNextPage ? items.slice(0, pageSize) : items;
const nextCursor = hasNextPage ? data.at(-1)?.id : undefined;
```

游标必须基于唯一且稳定的排序键。若按 `createdAt DESC, id DESC` 排序，游标应
使用能表达这两个边界的 schema 设计和查询；不要只把非唯一 `createdAt` 当游标，
否则可能漏数据或重复数据。

## 7. 事务与并发

本项目的登录发 token 后还要写 `auth_sessions`。如果将来要求“创建用户和创建
首个会话必须一起成功”，用交互式事务：

```ts
const result = await this.prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: { username, passwordHash },
    select: publicUserSelect,
  });

  await tx.authSession.create({
    data: {
      id: sessionId,
      userId: user.id,
      tokenHash,
      expiresAt,
    },
  });

  return user;
});
```

事务体只做数据库读写，保持短小。事务内不要发送短信、调用支付接口、等待远程
HTTP 或执行耗时计算。外部副作用需要事件表（outbox）、队列或失败重试策略。

当前验证码消费使用 `updateMany` 加上 `consumedAt: null` 和过期条件，再检查
`count === 1`。这是一个很好的“条件原子更新”例子：两个并发请求无法同时消费同
一条验证码。

## 8. 关系、批量操作与原生 SQL

关系查询要显式选择所需字段，避免无意中加载庞大集合：

```ts
const user = await this.prisma.user.findUnique({
  where: { id },
  select: {
    ...publicUserSelect,
    authSessions: {
      where: { revokedAt: null, expiresAt: { gt: new Date() } },
      select: { id: true, expiresAt: true, createdAt: true },
      take: 20,
      orderBy: { createdAt: 'desc' },
    },
  },
});
```

批量任务用 `createMany`、`updateMany`、`deleteMany`，并让调用方确认过滤条件。
对于原生 SQL，优先使用 Prisma 查询 API；确实需要数据库特性或极限性能时，使用
带参数的 tagged template：

```ts
const users = await this.prisma.$queryRaw<
  Array<{ id: string; username: string | null }>
>`
  SELECT id, username
  FROM users
  WHERE username = ${username}
`;
```

绝不使用字符串拼接 SQL。`$queryRawUnsafe` 只应出现在经过严格审查且没有用户
输入的极少数基础设施代码中。

## 9. Prisma 测试与可观测性

测试至少分两层：

1. Service 单元测试：mock Repository，验证错误映射、权限分支、分页参数和业务
   不变量。
2. Repository 或 e2e 测试：连接隔离测试库，验证唯一约束、关系级联、迁移和真实
   SQL 行为。

生产排障需要足够的上下文，但日志中不能出现 `DATABASE_URL`、密码、token 原文、
`passwordHash`、短信验证码。记录请求 ID、查询耗时、模型操作名和受影响行数，
把敏感值完全排除。

## 10. Prisma 层检查清单

- 每次 schema 改动都有已审查的 migration SQL。
- 全局只创建一个 `PrismaService`，应用退出时断开连接。
- Repository 用 `select` 限制列，默认不返回密码哈希和 token 哈希。
- `P2002`、`P2025` 等数据库错误被转换为稳定的领域或 HTTP 错误。
- 每个列表查询都有服务端最大条数、稳定排序和分页策略。
- 跨多表写入使用短事务，条件更新检查受影响行数。
- 原生 SQL 始终参数化，用户输入绝不拼接。
- 真实数据库测试覆盖约束、迁移、并发关键路径和级联行为。
