# PostgreSQL: 为能上线的 CRUD 打好数据层

本文以本项目的用户认证场景为例，讲清楚一个企业级 CRUD 服务在
PostgreSQL 中该如何设计、查询、迁移和排障。目标不是记住 SQL 语法，而是让
数据约束、索引、并发和 API 行为成为一个整体。

相关教程：

- [Prisma 数据访问](./prisma.md)
- [Node.js 运行时与安全](./nodejs.md)
- [NestJS CRUD API](./nestjs.md)

## 1. 当前项目的数据模型

项目通过 `.env` 的 `DATABASE_URL` 连接本地 PostgreSQL，默认数据库为
`nest_learn`。Prisma 模型位于 `prisma/schema.prisma`，已有三张业务表：

| 表                       | 责任               | 关键约束                            |
| ------------------------ | ------------------ | ----------------------------------- |
| `users`                  | 用户身份与密码哈希 | `id` 主键，`username`、`phone` 唯一 |
| `auth_sessions`          | 可撤销的登录会话   | 关联 `users`，删除用户时级联删除    |
| `sms_verification_codes` | 一次性短信验证码   | 有效期、已消费状态和尝试次数        |

先用 psql 看清当前库中的对象：

```bash
psql -h 127.0.0.1 -U postgres -d nest_learn
```

```sql
\dt
\d users
\d auth_sessions
\d sms_verification_codes
SELECT * FROM "_prisma_migrations" ORDER BY finished_at DESC;
```

也可以运行 `pnpm db:studio`，在浏览器中查看或编辑开发环境的数据。Studio
适合观察数据，不替代迁移文件和代码审查。

## 2. 从业务不变量开始设计表

表结构应先表达不能被绕过的业务规则，再考虑 ORM 和接口。例如当前用户允许
“密码账号”“短信账号”或二者并存，所以 `username`、`phone`、
`password_hash` 都可以为空；但同一个非空用户名或手机号只能归属一个用户。

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  phone TEXT UNIQUE,
  password_hash TEXT,
  phone_verified_at TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP(3) NOT NULL
);
```

这里有几个重要细节：

1. 主键是稳定且不可变的 `id`，不要把用户名、手机号当主键。
2. `UNIQUE` 是数据库级的最后防线。应用层的“先查询、再创建”不能取代它，
   因为并发请求会同时通过预查询。
3. PostgreSQL 的唯一约束允许多个 `NULL`。这正好支持当前“用户名或手机号
   可选”的账号模型；若业务要求两者至少存在一个，应再加 `CHECK` 约束。
4. 密码只保存哈希，不保存明文，也不要把哈希返回到接口响应。
5. `TIMESTAMP(3)` 和 Prisma 的 `DateTime` 对应；所有服务应统一时区约定，
   推荐 API 使用 ISO 8601 UTC 时间。

如果后续要求每个用户至少有用户名或手机号，可以用一次迁移加入：

```sql
ALTER TABLE users
ADD CONSTRAINT users_username_or_phone_required
CHECK (username IS NOT NULL OR phone IS NOT NULL);
```

不要在生产库手工执行后忘记同步迁移历史。正确做法是在 Prisma schema 变更后
生成一条可审查的迁移，再随应用发布。

## 3. CRUD 的 SQL 基础

下面的 SQL 适合在 psql 中学习和排查。业务代码应通过 Prisma 的参数化查询执行，
不能把用户输入拼进 SQL 字符串。

### Create: 创建用户

```sql
INSERT INTO users (
  id,
  username,
  password_hash,
  updated_at
) VALUES (
  'user_demo_001',
  'alice',
  'scrypt$example-salt$example-derived-key',
  CURRENT_TIMESTAMP
)
RETURNING id, username, phone, created_at, updated_at;
```

`RETURNING` 能避免“插入后再按条件查一次”。真实密码哈希由 Node.js 生成，
上面的值仅用于理解 SQL 形状。

唯一冲突会返回 SQLSTATE `23505`。API 层应把它转换为 `409 Conflict`，而不是
返回数据库错误详情。

### Read: 详情、列表与分页

```sql
-- 单条详情：只取响应真正需要的列
SELECT id, username, phone, phone_verified_at, created_at, updated_at
FROM users
WHERE id = 'user_demo_001';

-- 管理后台的浅分页
SELECT id, username, phone, created_at
FROM users
WHERE username ILIKE '%ali%'
ORDER BY created_at DESC, id DESC
LIMIT 20 OFFSET 0;

-- 对大表或无限滚动，使用游标式条件
SELECT id, username, phone, created_at
FROM users
WHERE (created_at, id) < ('2026-09-06T00:00:00.000Z', 'user_demo_001')
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

列表接口必须有稳定排序。只按 `created_at DESC` 排序会在同一毫秒创建的数据上
产生不稳定顺序，因此再用唯一的 `id DESC` 作第二排序键。

`OFFSET` 适合总量不大且产品需要跳转第 N 页的后台列表；页数很深时，数据库仍
要扫描并跳过前面的记录。此时使用 `(created_at, id)` 游标，并为它建立复合索引：

```sql
CREATE INDEX CONCURRENTLY users_created_at_id_desc_idx
ON users (created_at DESC, id DESC);
```

`CONCURRENTLY` 用于生产大表降低建索引时的阻塞风险。它不能放在事务块中；迁移
工具是否支持要先验证。小型开发库则无需复杂化。

### Update: 明确更新边界

```sql
UPDATE users
SET
  phone = '13800138000',
  phone_verified_at = CURRENT_TIMESTAMP,
  updated_at = CURRENT_TIMESTAMP
WHERE id = 'user_demo_001'
RETURNING id, username, phone, phone_verified_at, updated_at;
```

`WHERE id = ...` 是更新的安全边界。更新接口不能把请求体直接映射为任意列，
例如绝不能允许普通用户更新 `password_hash`、身份角色或审计字段。

对于“只在未验证时完成验证”这类并发敏感写入，把前置条件放进同一条 SQL：

```sql
UPDATE users
SET phone_verified_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
WHERE id = 'user_demo_001'
  AND phone_verified_at IS NULL
RETURNING id;
```

若没有返回行，调用方知道请求已被其他请求处理，无需“先查再改”。

### Delete: 先定义删除语义

当前 `auth_sessions.user_id` 是 `ON DELETE CASCADE`，物理删除用户会同时删除其
会话：

```sql
DELETE FROM users
WHERE id = 'user_demo_001'
RETURNING id;
```

物理删除适合测试数据、一次性草稿或法律上必须清除的信息。多数业务用户数据
需要保留审计记录和恢复能力，建议增加软删除字段或明确账户状态：

```sql
ALTER TABLE users
ADD COLUMN status TEXT NOT NULL DEFAULT 'active',
ADD COLUMN deleted_at TIMESTAMP(3),
ADD CONSTRAINT users_status_valid
CHECK (status IN ('active', 'disabled', 'deleted'));
```

之后“删除”应是 `UPDATE users SET status = 'deleted', deleted_at = ...`，并让
全部读查询默认过滤 `status = 'active'`。引入软删除后，要特别检查唯一索引、
后台查询、登录逻辑和数据保留策略，不能只加一个字段就结束。

## 4. 索引是按查询设计的

当前迁移已经建立了这些索引：

```sql
-- users.username 和 users.phone 的唯一索引由 UNIQUE 自动创建
CREATE INDEX auth_sessions_user_id_idx ON auth_sessions(user_id);
CREATE INDEX auth_sessions_expires_at_idx ON auth_sessions(expires_at);
CREATE INDEX sms_verification_codes_phone_purpose_created_at_idx
ON sms_verification_codes(phone, purpose, created_at);
```

它们分别服务于：

- 用用户名或手机号定位账户；
- 用会话 ID、用户 ID、令牌哈希和过期时间校验登录态；
- 查找某手机号最新的一条某用途验证码。

索引不是越多越好：每一个索引都会增加插入、更新、磁盘和维护成本。新增索引前
先拿真实查询执行计划判断：

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, username, phone, created_at
FROM users
WHERE username ILIKE '%ali%'
ORDER BY created_at DESC, id DESC
LIMIT 20;
```

普通 B-tree 不一定能加速任意位置的 `ILIKE '%keyword%'` 搜索。数据量变大后，
再根据产品需求评估前缀搜索、`pg_trgm` 或专用搜索服务；不要未经测量就加索引。

## 5. 事务：把一个业务动作变成原子操作

一个业务动作包含多次写入时，要么全部成功，要么全部回滚。注册后创建初始资料、
创建订单并扣库存、消费验证码并登录，都是事务候选。

```sql
BEGIN;

INSERT INTO users (id, username, password_hash, updated_at)
VALUES ('user_demo_002', 'bob', 'hash', CURRENT_TIMESTAMP);

INSERT INTO auth_sessions (id, user_id, token_hash, expires_at)
VALUES (
  'session_demo_002',
  'user_demo_002',
  'token-hash',
  CURRENT_TIMESTAMP + INTERVAL '1 hour'
);

COMMIT;
```

其中任一语句失败时执行 `ROLLBACK`。在应用中用 Prisma 的 `$transaction`，不要
让多个独立请求或多个独立连接“碰巧”共同完成一个业务动作。

对并发扣减、抢占等场景，需要在事务内使用条件更新、行锁或乐观锁。优先选择可
重试、时间短的事务；不要在事务中调用短信、支付、HTTP 等外部服务。

## 6. 迁移与发布流程

数据库 schema 是代码的一部分。当前项目的迁移文件在
`prisma/migrations/`，生产环境的推荐流程是：

```bash
# 本地开发：修改 schema 后生成迁移并审查 SQL
pnpm db:migrate

# 本地生成 Prisma Client
pnpm db:generate

# 生产部署：只应用已提交、已审核的迁移
pnpm db:deploy
```

发布纪律：

1. 先让 schema 向后兼容，再发布读写新字段的应用代码。
2. 大表新增非空列、回填数据、建立索引要拆成多个可控步骤。
3. 不要在生产执行 `prisma migrate dev`，它是开发工作流。
4. 每次迁移在预发布库演练，并准备备份、回滚或前向修复方案。
5. 用 `_prisma_migrations` 核对生产已应用的版本，禁止“手改库但不留迁移”。

## 7. 最小权限、备份与日常排障

生产应用不要使用 PostgreSQL 超级用户。为应用创建只能访问业务 schema、只能做
所需读写操作的角色；迁移角色与运行时应用角色可以分开。

排障时优先回答四个问题：

```sql
-- 连接和当前身份
SELECT current_database(), current_user, now();

-- 某张表有多少数据
SELECT COUNT(*) FROM users;

-- 最近创建的用户（绝不在日志中输出 password_hash）
SELECT id, username, phone, created_at
FROM users
ORDER BY created_at DESC
LIMIT 20;

-- 检查长事务和等待中的查询
SELECT pid, usename, state, query_start, wait_event_type, query
FROM pg_stat_activity
WHERE datname = current_database()
ORDER BY query_start NULLS LAST;
```

备份不是“配过一次就算完成”。要定期验证恢复：从备份恢复到隔离环境，运行健康
检查、迁移状态检查和关键 CRUD 验证。能恢复的备份才是备份。

## 8. 数据层上线检查清单

- 每张表都有稳定主键、必要的非空、唯一、外键和检查约束。
- 每个列表 API 都有最大 `limit`、稳定排序和适当的分页策略。
- 索引来自真实的 `WHERE`、`JOIN`、`ORDER BY` 查询，而不是猜测。
- 业务唯一性同时存在于数据库约束和 API 错误映射中。
- 多写操作使用短事务；外部副作用不放进长事务。
- 迁移进入版本控制，生产只应用已审核迁移。
- 敏感列不出现在日志、接口响应、分析导出或调试截图中。
- 有最小权限账号、备份、恢复演练、慢查询与连接数监控。
