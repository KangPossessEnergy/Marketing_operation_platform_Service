# Node.js: CRUD 服务的运行时、边界与安全

数据库 CRUD 看起来像“接收请求、读写数据、返回 JSON”，但上线后真正出问题的
往往是输入边界、环境配置、错误处理、阻塞调用、日志泄密和进程退出。本文用当前
NestJS 项目作为运行环境，补齐 Node.js 层必须掌握的工程基础。

相关教程：

- [PostgreSQL 数据设计](./3_postgresql.md)
- [Prisma 数据访问](./4_prisma.md)
- [NestJS CRUD API](.2_/nestjs.md)

## 1. 一次请求穿过的边界

一个可维护的 CRUD 请求应该经历以下边界：

```text
HTTP 请求
  -> Controller: 路由、DTO 接收、HTTP 状态码
  -> Service: 授权后的业务规则、事务边界、错误翻译
  -> Repository: 查询形状和持久化
  -> Prisma / PostgreSQL: 约束、索引、原子写入
  -> 响应 DTO: 只输出被允许公开的数据
```

每层都在缩小不可信输入的能力：

- 客户端可以发送任意 JSON，DTO 只接受符合规则的字段。
- Controller 不决定数据库查询细节。
- Service 不相信“先查过了”可以取代数据库唯一约束。
- Repository 不把 `passwordHash`、token 哈希等敏感列默认返回。
- 数据库用约束抵挡绕过应用代码的写入。

这不是形式主义。清楚的边界能让测试、审计、性能调优和事故排查有明确落点。

## 2. 环境变量必须尽早校验

当前入口 `src/main.ts` 先执行 `import 'dotenv/config'`，再启动 Nest 应用；
`ConfigModule.forRoot` 则将环境变量映射到 `src/config/configuration.ts`。这是一个
好起点，但生产服务还应在启动时校验必填变量和格式。

常见错误：

- 以为 `process.env.PORT` 是 number，实际上环境变量总是字符串或 `undefined`；
- 把 `JWT_SECRET`、数据库 URL、短信密钥提交到 Git；
- 开发环境允许默认密钥，生产环境也悄悄继续使用；
- 把 `true`、`false`、`0` 当 JavaScript boolean 使用而不解析。

当前项目的 `readPositiveInteger` 已经示范了安全数值解析：

```ts
function readPositiveInteger(
  value: string | undefined,
  fallback: number,
): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
```

对生产密钥，失败优于回退：

```ts
function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} must be set`);
  }

  return value;
}

if (process.env.NODE_ENV === 'production') {
  requiredEnv('DATABASE_URL');
  requiredEnv('JWT_SECRET');
  requiredEnv('SMS_CODE_SECRET');
}
```

`.env.example` 只能包含变量名和无害示例；`.env` 必须在 `.gitignore` 中，并通过
部署平台的 secret 管理能力提供生产值。

## 3. 异步 I/O 与事件循环

Node.js 使用事件循环处理大量 I/O。数据库、网络、文件等操作应使用异步 API 并
`await`，这样等待期间能够处理其他请求：

```ts
const user = await this.usersRepository.findByUsername(username);
```

要警惕 CPU 密集型或同步 API。当前项目密码工具为了教学清晰使用了
`scryptSync`；高并发生产服务应该避免在请求路径中同步派生密码哈希，因为它会阻塞
事件循环。可以使用异步 `scrypt`：

```ts
import { randomBytes, scrypt } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derivedKey = await scryptAsync(password, salt, 64);

  return `scrypt$${salt}$${Buffer.from(derivedKey).toString('hex')}`;
}
```

改成异步后，调用点也必须写成 `await hashPassword(dto.password)`。这类变更应有
登录、注册和错误处理测试，不要只改一个函数。

密码验证仍要使用恒定时间比较，且先检查字节长度。当前
`src/modules/auth/security/password.ts` 的 `timingSafeEqual` 用法表达了这个原则。

## 4. 输入、输出与 JSON 的边界

Node.js 不会自动相信请求体是你希望的结构。以下输入都可能到达你的服务：

```json
{
  "username": " alice ",
  "password": "123456",
  "role": "super-admin",
  "passwordHash": "attacker-value"
}
```

企业级 CRUD 不能写成：

```ts
// 不要这样做：客户端可以影响所有可赋值字段。
await prisma.user.create({ data: request.body });
```

应该由 DTO 白名单、转换和 Service 映射决定允许字段：

```ts
await this.usersRepository.create({
  username: dto.username,
  passwordHash: await hashPassword(dto.password),
});
```

输出也要当作安全边界。返回用户信息时创建 `PublicUser` 类型或 Prisma `select`，
不要用 `return user` 猜测未来新增字段是否安全。典型禁止响应字段包括：

- `passwordHash`
- JWT、session token 原文或 `tokenHash`
- 短信验证码、验证码哈希、重置令牌
- 内部审计信息和供应商凭证

## 5. 可预测的错误处理

错误分为三类，处理方式不同：

| 类别       | 示例                                 | API 行为                    |
| ---------- | ------------------------------------ | --------------------------- |
| 客户端错误 | DTO 不合法、记录不存在、唯一冲突     | 稳定的 4xx 状态和可读消息   |
| 业务拒绝   | 验证码已使用、账户被禁用、无权限     | 业务定义的 4xx 状态         |
| 系统错误   | 数据库不可用、未捕获异常、第三方超时 | 5xx、通用消息、保留诊断日志 |

不要把 `error.message` 原样返回给客户端。它可能暴露 SQL、路径、连接信息或内部
依赖细节。NestJS 的异常类型会映射为 HTTP 响应；未知错误交给全局异常过滤器
记录请求上下文并返回统一的 500 响应。

异步错误必须被 `await` 或明确捕获：

```ts
try {
  await this.smsGateway.send(phone, code);
} catch (error) {
  this.logger.error('Failed to send SMS', {
    phone: maskPhone(phone),
    error,
  });
  throw new ServiceUnavailableException('短信服务暂不可用');
}
```

日志里只记录掩码后的手机号和可关联的请求 ID。不要记录验证码。

## 6. 认证不是授权

当前 `AccessTokenGuard` 做了两层工作：

1. 验证 Bearer token 的签名、过期时间和载荷格式；
2. 使用 token 哈希、session ID、用户 ID 和有效期查询 `auth_sessions`。

第二层使 logout 可以撤销会话，而不是只能等待 JWT 自然过期。这是“身份验证”
（authentication）。

用户通过验证不代表能执行任意 CRUD。管理用户列表、删除用户、导出数据等操作还
需要“授权”（authorization）。典型策略是：

```text
认证通过
  -> 加载用户角色或权限
  -> 资源归属检查
  -> 操作级策略检查
  -> 执行 Service 方法
```

不要把“前端不会显示删除按钮”当作权限控制。权限必须在服务端、接近业务操作的
位置强制执行。

## 7. 日志、追踪和可观测性

线上排障需要回答：哪个请求、哪个用户、哪个路由、失败在哪一层、耗时多久。建议
每个请求生成或透传一个 request ID，并在日志和错误响应中带上它：

```ts
type RequestContext = {
  requestId: string;
  userId?: string;
  route: string;
};
```

日志应是结构化 JSON 或至少稳定的键值形式。重点指标：

- 请求数、状态码比例、P50/P95/P99 延迟；
- 数据库查询耗时、连接池等待、慢查询；
- 认证失败、验证码发送频率、限流命中；
- 进程内存、CPU、事件循环延迟、未处理拒绝。

敏感信息永远不进入日志：密码、`Authorization` header、token、连接串、验证码、
完整手机号、密码哈希。日志采集系统通常比主数据库拥有更广泛的访问者，因此这里
尤其不能心存侥幸。

## 8. 超时、重试与幂等

一个 CRUD 服务会依赖数据库、短信、缓存、对象存储等外部资源。要为跨网络调用
设置超时，并只对明确安全的操作重试。

- `GET` 通常天然幂等，重试风险较低。
- 普通 `POST /users` 可能重复创建，应使用唯一约束或幂等键。
- 发送短信、扣款、发券等副作用不能因为网络超时盲目重试。
- `PUT` / `PATCH` 是否幂等取决于具体语义，例如“设置状态”为幂等，“余额加一”
  不是。

对于需要严格“只创建一次”的接口，可要求客户端传 `Idempotency-Key`，在数据库
中存储请求摘要、处理状态和响应；同一键的重复请求返回原结果。实现前要定义键的
有效期、并发请求的竞争处理和失败恢复。

## 9. 优雅关闭与部署

应用被滚动发布、容器停止或进程重启时，应该停止接受新流量，等待短时间内正在
处理的请求结束，再关闭数据库连接。NestJS 可以启用 shutdown hooks：

```ts
const app = await NestFactory.create(AppModule);
app.enableShutdownHooks();
await app.listen(port);
```

`PrismaService.onModuleDestroy()` 会调用 `$disconnect()`，但这不等于完整的
发布方案。部署层还应有：

- readiness probe：服务已完成配置、数据库可用才接收流量；
- liveness probe：进程卡死或不可恢复时重启；
- 合理的终止宽限期；
- 迁移与应用发布的顺序；
- 资源限制和告警。

不要在未处理异常发生后继续维持一个未知状态的进程。记录错误、让进程管理器或
编排系统重启，通常比“吞掉异常继续跑”更可靠。

## 10. Node.js 层检查清单

- 环境变量经解析和校验；生产机密没有开发默认值。
- 所有不可信输入都经过 DTO 校验、白名单映射和长度限制。
- CPU 密集任务不阻塞事件循环；外部 I/O 有超时与错误处理。
- 敏感数据不进入响应、日志、指标标签和错误消息。
- 认证、授权、资源归属检查彼此独立且均在服务端执行。
- 写操作有清晰的事务、幂等或唯一约束策略。
- 日志可用 request ID 串联，关键错误有告警。
- 进程支持优雅关闭、健康检查和可重复部署。
