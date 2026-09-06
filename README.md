# Nest Learn

一个基于 **NestJS + Node.js + PostgreSQL + Prisma** 的企业级后端学习项目。

语言版本：[English README](./README.en.md)

## 项目状态

当前项目已经实现：

- NestJS ESM + TypeScript 应用启动
- PostgreSQL 数据库连接和 Prisma 迁移
- 用户名密码注册和登录
- 短信验证码登录（本地 mock）
- 基于 access token 和数据库会话的 logout
- DTO 全局校验
- 用户、登录会话、短信验证码数据模型
- 单元测试和端到端测试示例

用户 CRUD 的完整企业级实现方式写在 [learn-docs/nestjs.md](./learn-docs/nestjs.md)
中，目前作为学习和扩展指南提供。当前源码中的用户模块主要服务认证流程，尚未默认
开放完整的 `GET /users`、`PATCH /users/:id` 等管理接口。

## 技术栈

- Node.js
- TypeScript
- NestJS
- PostgreSQL
- Prisma ORM
- `class-validator` / `class-transformer`
- Vitest
- pnpm

## 环境要求

- Node.js 24+
- pnpm
- PostgreSQL 17，或可运行 Docker 的环境

## 快速开始

### 1. 安装依赖

```bash
pnpm install
```

### 2. 创建环境文件

```bash
cp .env.example .env
```

根据本机 PostgreSQL 的账号、密码、端口和数据库名修改 `.env` 中的
`DATABASE_URL`。

### 3. 启动 PostgreSQL

如果本机还没有 PostgreSQL，可以使用 Docker：

```bash
docker run --name nest-learn-postgres \
  -e POSTGRES_USER=nest \
  -e POSTGRES_PASSWORD=nest \
  -e POSTGRES_DB=nest_learn \
  -p 5432:5432 \
  -d postgres:17-alpine
```

如果已经存在同名容器，可以启动它：

```bash
docker start nest-learn-postgres
```

### 4. 初始化数据库

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

`db:seed` 会创建或更新演示账号，默认账号为：

```text
用户名：admin
密码：123456
```

可以通过 `AUTH_USERNAME` 和 `AUTH_PASSWORD` 修改演示账号。生产环境必须使用强
密码和独立的密钥。

### 5. 启动应用

```bash
pnpm start:dev
```

应用默认运行在：

```text
http://localhost:3000
```

根路径检查：

```bash
curl http://localhost:3000
```

## 数据库命令

```bash
# 生成 Prisma Client
pnpm db:generate

# 开发环境创建并应用迁移
pnpm db:migrate

# 生产环境应用已经提交的迁移
pnpm db:deploy

# 创建或更新演示用户
pnpm db:seed

# 在浏览器中查看数据库
pnpm db:studio
```

运行 `pnpm db:studio` 后，通常可以访问：

```text
http://localhost:5555
```

当前数据库包含：

- `users`
- `auth_sessions`
- `sms_verification_codes`
- `_prisma_migrations`

数据模型位于 [prisma/schema.prisma](./prisma/schema.prisma)，迁移文件位于
`prisma/migrations/`。

## 认证 API

### 注册

`POST /auth/register`

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"new_user","password":"123456"}'
```

成功返回 `201`，响应包含公开用户信息和 access token，不返回密码哈希。

### 用户名密码登录

`POST /auth/login`

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

典型响应：

```json
{
  "accessToken": "<access-token>",
  "tokenType": "Bearer",
  "expiresIn": 3600,
  "user": {
    "id": "<user-id>",
    "username": "admin",
    "phone": null
  }
}
```

### 发送短信验证码

`POST /auth/sms/send`

```bash
curl -X POST http://localhost:3000/auth/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000"}'
```

### 短信验证码登录

`POST /auth/login/sms`

```bash
curl -X POST http://localhost:3000/auth/login/sms \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","code":"123456"}'
```

本地 `SMS_PROVIDER=mock` 模式下，验证码默认使用 `SMS_FIXED_CODE`；如果没有
配置固定验证码，会随机生成并写入应用日志。生产环境必须替换为真实短信供应商，
不能继续使用 mock。

验证码在数据库中只保存哈希，成功校验后只能消费一次，同时具备有效期、最大尝试
次数和发送频率限制。

### 退出登录

`POST /auth/logout`

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <access-token>"
```

成功返回 `204`。服务端会撤销数据库中的会话，因此同一个 access token 之后不能
继续访问受保护接口。

## 配置项

主要环境变量如下：

| 变量                       | 用途                                 |
| -------------------------- | ------------------------------------ |
| `DATABASE_URL`             | PostgreSQL 连接地址                  |
| `JWT_SECRET`               | access token 签名密钥                |
| `ACCESS_TOKEN_EXPIRES_IN`  | access token 有效期，单位为秒        |
| `AUTH_USERNAME`            | seed 使用的演示用户名                |
| `AUTH_PASSWORD`            | seed 使用的演示密码                  |
| `SMS_PROVIDER`             | 短信供应商，开发环境使用 `mock`      |
| `SMS_CODE_SECRET`          | 短信验证码哈希密钥                   |
| `SMS_CODE_EXPIRES_IN`      | 验证码有效期，单位为秒               |
| `SMS_CODE_RESEND_INTERVAL` | 验证码重发间隔，单位为秒             |
| `SMS_CODE_MAX_ATTEMPTS`    | 验证码最大验证次数                   |
| `SMS_FIXED_CODE`           | 本地测试固定验证码，生产环境禁止使用 |

`.env` 不应提交到 Git。生产环境不要使用示例密钥、默认密码或固定验证码。

## 目录结构

```text
src/
  app/                    # 根模块和基础接口
  common/                 # 通用装饰器、管道和跨模块能力
  config/                 # 环境变量和应用配置
  database/prisma/        # Prisma Client 和数据库基础设施
  modules/auth/           # 注册、登录、短信、token 和会话
  modules/users/          # 用户查询和认证相关用户服务
prisma/
  migrations/             # 数据库迁移
  schema.prisma           # Prisma 数据模型
  seed.mjs                # 开发数据初始化
learn-docs/
  postgresql.md           # PostgreSQL 企业级 CRUD
  prisma.md               # Prisma 企业级 CRUD
  nodejs.md               # Node.js 服务工程实践
  nestjs.md               # NestJS 分层 CRUD 实践
test/                     # e2e 测试
```

## 学习文档

- [PostgreSQL：数据设计、索引、事务和迁移](./learn-docs/postgresql.md)
- [Prisma：类型安全的数据访问和 CRUD](./learn-docs/prisma.md)
- [Node.js：运行时、错误处理和安全边界](./learn-docs/nodejs.md)
- [NestJS：Controller、Service、Repository 和 CRUD API](./learn-docs/nestjs.md)

推荐学习顺序：

```text
PostgreSQL -> Prisma -> Node.js -> NestJS
```

## 开发命令

```bash
# 启动开发服务
pnpm start:dev

# 构建项目
pnpm build

# 启动生产构建
pnpm start:prod

# 代码检查
pnpm lint

# 格式化 TypeScript 和测试文件
pnpm format

# 单元测试
pnpm test

# 监听模式运行测试
pnpm test:watch

# 端到端测试
pnpm test:e2e

# 测试覆盖率
pnpm test:cov
```

## 生产环境注意事项

- 使用独立、强随机的 `JWT_SECRET` 和 `SMS_CODE_SECRET`。
- 不要使用 `SMS_PROVIDER=mock`、`SMS_FIXED_CODE` 或默认演示密码。
- 应用运行账号不要使用 PostgreSQL 超级用户。
- 生产环境使用 `pnpm db:deploy`，不要使用 `pnpm db:migrate`。
- 不要在日志中输出密码、token、数据库连接串、验证码或密码哈希。
- 为管理类 CRUD 接口增加角色、权限和资源归属检查。
- 对数据库进行备份，并定期验证恢复流程。

## License

本项目仅用于学习和本地开发。
