# 数据库表常见操作

本文以 PostgreSQL 为例，整理数据库表在日常开发中最常用的操作。内容分为两类：

- **DDL（Data Definition Language）**：定义和修改数据库对象，例如建表、改表、建索引。
- **DML（Data Manipulation Language）**：操作表中的数据，例如新增、查询、修改、删除。

本项目使用 Prisma 连接 PostgreSQL。学习时可以先在 `psql` 中执行 SQL，再使用
Prisma migration 管理正式的表结构变更。

## 1. 连接数据库

```bash
psql -h 127.0.0.1 -U postgres -d nest_learn
```

进入 `psql` 后，常用命令如下：

```sql
-- 查看所有数据库
\l

-- 切换数据库
\c nest_learn

-- 查看当前数据库中的表
\dt

-- 查看表结构
\d users

-- 查看更详细的表结构、索引和约束
\d+ users

-- 退出
\q
```

`psql` 命令以反斜杠开头，不属于标准 SQL，只能在 `psql` 客户端中执行。

## 2. 创建表

### 2.1 基本建表

```sql
CREATE TABLE users (
  id BIGSERIAL PRIMARY KEY,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

常用字段类型：

| 类型 | 适用场景 |
| --- | --- |
| `SMALLINT`、`INTEGER`、`BIGINT` | 整数 |
| `NUMERIC(10, 2)` | 金额、精确小数 |
| `VARCHAR(255)` | 长度有限的字符串 |
| `TEXT` | 不限制长度的文本 |
| `BOOLEAN` | `true` / `false` |
| `DATE` | 日期 |
| `TIMESTAMP` | 不带时区的时间 |
| `TIMESTAMPTZ` | 带时区的时间，通常更适合服务端 |
| `JSONB` | 需要查询的 JSON 数据 |
| `UUID` | UUID 主键或业务标识 |

### 2.2 使用 UUID 或字符串主键

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id BIGINT NOT NULL REFERENCES users(id),
  name VARCHAR(50) NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

主键应当稳定、唯一且尽量不承载业务含义。不要使用手机号、用户名等可能变化的
业务字段作为主键。

### 2.3 外键和级联删除

```sql
CREATE TABLE user_profiles (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL UNIQUE,
  nickname VARCHAR(50),
  CONSTRAINT user_profiles_user_id_fkey
    FOREIGN KEY (user_id)
    REFERENCES users(id)
    ON DELETE CASCADE
);
```

常见的外键删除策略：

- `ON DELETE CASCADE`：删除主表记录时自动删除从表记录。
- `ON DELETE SET NULL`：主表删除后，从表外键设置为 `NULL`。
- `ON DELETE RESTRICT`：从表存在关联记录时，禁止删除主表记录。
- 不指定：使用数据库默认行为，通常会阻止破坏关联关系的删除。

只有在确认业务语义后才使用 `CASCADE`，否则一次误删可能影响大量数据。

## 3. 查看表和表结构

```sql
-- 查看表中的全部数据
SELECT * FROM users;

-- 查看字段、数据类型和是否允许为空
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- 查看表上的约束
SELECT
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'users';

-- 查看表上的索引
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'users';
```

生产环境不要习惯性执行 `SELECT *`。明确列名可以避免返回密码哈希、令牌等敏感
字段，也能避免增加字段后接口响应意外变化。

## 4. 修改表结构

### 4.1 新增字段

```sql
ALTER TABLE users
ADD COLUMN phone VARCHAR(30);
```

新增必填字段时，建议分步骤执行，避免大表长时间锁表：

```sql
-- 第一步：先允许为空
ALTER TABLE users ADD COLUMN status VARCHAR(20);

-- 第二步：回填旧数据
UPDATE users
SET status = 'active'
WHERE status IS NULL;

-- 第三步：设置默认值和非空约束
ALTER TABLE users
ALTER COLUMN status SET DEFAULT 'active',
ALTER COLUMN status SET NOT NULL;
```

### 4.2 修改字段

```sql
-- 修改字段类型
ALTER TABLE users
ALTER COLUMN username TYPE VARCHAR(100);

-- 设置默认值
ALTER TABLE users
ALTER COLUMN phone SET DEFAULT NULL;

-- 删除默认值
ALTER TABLE users
ALTER COLUMN phone DROP DEFAULT;

-- 设置为允许为空
ALTER TABLE users
ALTER COLUMN phone DROP NOT NULL;

-- 设置为不允许为空
ALTER TABLE users
ALTER COLUMN phone SET NOT NULL;
```

### 4.3 重命名和删除字段

```sql
ALTER TABLE users
RENAME COLUMN username TO login_name;

ALTER TABLE users
DROP COLUMN phone;
```

删除字段通常不可逆。生产环境应先确认代码、报表、任务和其他服务都不再使用该
字段，并提前备份或采用分阶段下线方案。

### 4.4 重命名和删除表

```sql
ALTER TABLE users
RENAME TO app_users;

DROP TABLE IF EXISTS app_users;
```

`DROP TABLE` 会删除表结构和其中的数据。除非明确确认，否则不要在生产环境直接
执行。

## 5. 约束：让数据库保证数据正确

### 5.1 非空约束

```sql
CREATE TABLE products (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0)
);
```

### 5.2 唯一约束

```sql
ALTER TABLE users
ADD CONSTRAINT users_email_key UNIQUE (email);
```

也可以在建表时声明：

```sql
CREATE TABLE departments (
  id BIGSERIAL PRIMARY KEY,
  code VARCHAR(30) NOT NULL UNIQUE,
  name VARCHAR(100) NOT NULL
);
```

唯一约束必须由数据库保证。应用层先查询再插入不能解决并发请求同时写入的问题。

### 5.3 检查约束

```sql
ALTER TABLE products
ADD CONSTRAINT products_price_positive
CHECK (price >= 0);

ALTER TABLE users
ADD CONSTRAINT users_status_valid
CHECK (status IN ('active', 'disabled', 'deleted'));
```

### 5.4 外键约束

```sql
ALTER TABLE orders
ADD CONSTRAINT orders_user_id_fkey
FOREIGN KEY (user_id)
REFERENCES users(id);
```

约束命名清晰后，排查迁移失败和数据库错误会更容易。

## 6. 新增数据：INSERT

### 6.1 插入一条数据

```sql
INSERT INTO users (username, email, password_hash)
VALUES ('alice', 'alice@example.com', 'hashed-password')
RETURNING id, username, email, created_at;
```

`RETURNING` 可以直接拿到新增记录，不需要再执行一次查询。

### 6.2 批量插入

```sql
INSERT INTO products (name, price)
VALUES
  ('Keyboard', 299.00),
  ('Mouse', 99.00),
  ('Monitor', 1299.00);
```

### 6.3 忽略唯一冲突

```sql
INSERT INTO users (username, email, password_hash)
VALUES ('alice', 'alice@example.com', 'hashed-password')
ON CONFLICT (email) DO NOTHING;
```

### 6.4 冲突时更新：UPSERT

```sql
INSERT INTO user_profiles (user_id, nickname)
VALUES (1, 'Alice')
ON CONFLICT (user_id)
DO UPDATE SET nickname = EXCLUDED.nickname;
```

`EXCLUDED` 表示本次准备插入但发生冲突的那一行。

## 7. 查询数据：SELECT

### 7.1 条件查询

```sql
SELECT id, username, email
FROM users
WHERE id = 1;

SELECT id, username, email
FROM users
WHERE status = 'active'
  AND created_at >= CURRENT_DATE - INTERVAL '30 days';
```

常见条件操作符：

```sql
-- 范围
WHERE id BETWEEN 1 AND 100

-- 集合
WHERE status IN ('active', 'disabled')

-- 空值
WHERE phone IS NULL
WHERE phone IS NOT NULL

-- 模糊匹配
WHERE username LIKE 'ali%'
WHERE username ILIKE '%ALI%'
```

`NULL` 不能使用 `= NULL` 判断，必须使用 `IS NULL` 或 `IS NOT NULL`。

### 7.2 排序和限制

```sql
SELECT id, username, created_at
FROM users
WHERE status = 'active'
ORDER BY created_at DESC, id DESC
LIMIT 20
OFFSET 0;
```

分页查询应当使用稳定排序。只按非唯一字段排序，遇到相同时间的数据时可能出现
重复或漏数据。

### 7.3 去重

```sql
SELECT DISTINCT status
FROM users;
```

### 7.4 统计和分组

```sql
-- 总记录数
SELECT COUNT(*) AS total
FROM users;

-- 按状态统计
SELECT status, COUNT(*) AS total
FROM users
GROUP BY status
ORDER BY total DESC;

-- 只保留数量大于 10 的分组
SELECT status, COUNT(*) AS total
FROM users
GROUP BY status
HAVING COUNT(*) > 10;
```

`WHERE` 在分组前过滤行，`HAVING` 在分组后过滤统计结果。

## 8. 多表查询：JOIN

假设订单表中有 `user_id`：

```sql
CREATE TABLE orders (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id),
  amount NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

订单明细表通常保存订单和商品之间的多对多关系：

```sql
CREATE TABLE order_items (
  id BIGSERIAL PRIMARY KEY,
  order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(10, 2) NOT NULL
);
```

### 8.1 INNER JOIN

只返回两张表都能匹配上的数据：

```sql
SELECT
  orders.id,
  users.username,
  orders.amount
FROM orders
INNER JOIN users ON users.id = orders.user_id
WHERE users.status = 'active';
```

### 8.2 LEFT JOIN

保留左表全部数据，即使右表没有匹配记录：

```sql
SELECT
  users.id,
  users.username,
  COUNT(orders.id) AS order_count
FROM users
LEFT JOIN orders ON orders.user_id = users.id
GROUP BY users.id, users.username
ORDER BY order_count DESC;
```

### 8.3 EXISTS

判断是否存在关联数据时，`EXISTS` 通常比先关联再去重更直观：

```sql
SELECT id, username
FROM users
WHERE EXISTS (
  SELECT 1
  FROM orders
  WHERE orders.user_id = users.id
);
```

## 9. 修改数据：UPDATE

### 9.1 修改一条或多条数据

```sql
UPDATE users
SET
  email = 'new-alice@example.com',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1
RETURNING id, username, email, updated_at;
```

### 9.2 条件更新

把业务前置条件写进 `WHERE`，可以减少并发下的覆盖问题：

```sql
UPDATE users
SET
  status = 'disabled',
  updated_at = CURRENT_TIMESTAMP
WHERE id = 1
  AND status = 'active'
RETURNING id;
```

如果没有返回记录，说明目标不存在，或者状态已经被其他请求修改。

执行 `UPDATE` 前应先确认 `WHERE` 条件。没有 `WHERE` 的更新会修改整张表：

```sql
-- 高风险：会把所有用户都禁用
UPDATE users SET status = 'disabled';
```

## 10. 删除数据：DELETE

### 10.1 删除指定数据

```sql
DELETE FROM users
WHERE id = 1
RETURNING id;
```

### 10.2 按条件批量删除

```sql
DELETE FROM sms_verification_codes
WHERE expires_at < CURRENT_TIMESTAMP
  AND consumed_at IS NOT NULL;
```

### 10.3 清空表

```sql
TRUNCATE TABLE users;
```

`TRUNCATE` 比逐行 `DELETE` 更快，但风险更高。需要同时清空关联表时，可以使用：

```sql
TRUNCATE TABLE users, user_profiles RESTART IDENTITY CASCADE;
```

`CASCADE` 会影响关联表，开发环境使用前也要确认目标数据库。

生产业务通常更适合软删除：

```sql
ALTER TABLE users
ADD COLUMN deleted_at TIMESTAMPTZ;

UPDATE users
SET deleted_at = CURRENT_TIMESTAMP
WHERE id = 1;

SELECT id, username
FROM users
WHERE deleted_at IS NULL;
```

软删除后，所有业务查询都必须统一过滤已删除数据；唯一索引和恢复策略也要一并
设计。

## 11. 索引

### 11.1 创建和删除索引

```sql
CREATE INDEX users_created_at_idx
ON users (created_at DESC);

CREATE INDEX orders_user_id_created_at_idx
ON orders (user_id, created_at DESC);

DROP INDEX IF EXISTS users_created_at_idx;
```

索引应服务于真实的 `WHERE`、`JOIN` 和 `ORDER BY` 查询。索引越多，写入成本、磁盘
占用和维护成本越高。

### 11.2 查看执行计划

```sql
EXPLAIN
SELECT id, username
FROM users
WHERE email = 'alice@example.com';

EXPLAIN (ANALYZE, BUFFERS)
SELECT id, username
FROM users
WHERE status = 'active'
ORDER BY created_at DESC
LIMIT 20;
```

`EXPLAIN` 只查看计划；`EXPLAIN ANALYZE` 会真正执行 SQL。对 `UPDATE`、`DELETE`
使用 `EXPLAIN ANALYZE` 前必须特别小心。

## 12. 事务

事务保证一组操作要么全部成功，要么全部回滚：

```sql
BEGIN;

-- 假设用户 id=1、商品 id=10 已经存在
INSERT INTO orders (user_id, amount)
VALUES (1, 299.00)
RETURNING id;

UPDATE users
SET updated_at = CURRENT_TIMESTAMP
WHERE id = 1;

COMMIT;
```

发生错误时回滚：

```sql
ROLLBACK;
```

典型场景是扣减库存：

```sql
BEGIN;

UPDATE products
SET stock = stock - 1
WHERE id = 10
  AND stock > 0;

-- 应用层检查上面的 UPDATE 受影响行数是否为 1
-- 下面的 order_id 应使用 INSERT orders RETURNING 返回的订单 id
INSERT INTO order_items (order_id, product_id, quantity)
VALUES (100, 10, 1);

COMMIT;
```

如果库存更新影响行数为 `0`，应用层应回滚事务，不应继续创建订单明细。
示例中的 `100` 只是演示用订单 id。

事务应尽量短小。不要在事务中调用短信、支付、远程 HTTP 等外部服务。

## 13. Prisma 中的对应操作

正式项目不要让业务代码到处拼接 SQL。当前项目应优先通过
`src/database/prisma/prisma.service.ts` 提供的 Prisma Client 访问数据库。

```ts
// Create
const user = await prisma.user.create({
  data: {
    username: 'alice',
    passwordHash: 'hashed-password',
  },
});

// Read
const users = await prisma.user.findMany({
  where: { username: { contains: 'ali' } },
  select: {
    id: true,
    username: true,
    phone: true,
  },
  orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  take: 20,
});

// Update
await prisma.user.update({
  where: { id: user.id },
  data: { phone: '13800138000' },
});

// Delete
await prisma.user.delete({
  where: { id: user.id },
});
```

多条数据库操作需要保持原子性时：

```ts
await prisma.$transaction(async (tx) => {
  const user = await tx.user.create({
    data: {
      username: 'alice',
      passwordHash: 'hashed-password',
    },
  });

  await tx.authSession.create({
    data: {
      id: 'session-id',
      userId: user.id,
      tokenHash: 'token-hash',
      expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
});
```

修改 `prisma/schema.prisma` 后，使用 Prisma migration 管理表结构：

```bash
pnpm db:migrate
pnpm db:generate
pnpm db:deploy
```

开发环境使用 `db:migrate` 创建迁移；生产环境只使用 `db:deploy` 应用已经提交和
审核过的迁移。

如果确实需要 PostgreSQL 特有语法，可以使用参数化原生 SQL：

```ts
const users = await prisma.$queryRaw<
  Array<{ id: string; username: string | null }>
>`
  SELECT id, username
  FROM users
  WHERE username = ${username}
`;
```

不要把用户输入通过字符串拼接到 SQL 中，也不要默认使用
`$queryRawUnsafe`。

## 14. 常见风险

### 14.1 忘记 WHERE

```sql
-- 可能修改或删除整张表
UPDATE users SET status = 'disabled';
DELETE FROM users;
```

执行修改和删除前，先用同样的条件执行 `SELECT` 确认目标数据：

```sql
SELECT id, username
FROM users
WHERE status = 'active';
```

### 14.2 把密码和令牌当普通字段返回

查询时只选择接口需要的字段：

```sql
SELECT id, username, phone, created_at
FROM users;
```

密码应保存哈希，令牌应保存哈希或不可逆摘要，原始值不能写入日志或响应。

### 14.3 只依赖应用层校验

应用层校验负责友好提示，数据库约束负责最终一致性。唯一性、非空、外键和关键
范围规则应尽量写入数据库。

### 14.4 直接手工修改生产表

表结构变更应通过迁移文件进入版本控制。当前项目的推荐流程：

1. 修改 `prisma/schema.prisma`。
2. 执行 `pnpm db:migrate`。
3. 审查生成的 SQL。
4. 提交迁移文件。
5. 生产环境执行 `pnpm db:deploy`。

## 15. 常用速查表

| 需求 | SQL |
| --- | --- |
| 创建表 | `CREATE TABLE ...` |
| 查看所有表 | `\dt` |
| 查看表结构 | `\d table_name` |
| 新增字段 | `ALTER TABLE ... ADD COLUMN ...` |
| 修改字段 | `ALTER TABLE ... ALTER COLUMN ...` |
| 删除字段 | `ALTER TABLE ... DROP COLUMN ...` |
| 新增数据 | `INSERT INTO ...` |
| 查询数据 | `SELECT ... FROM ...` |
| 修改数据 | `UPDATE ... SET ... WHERE ...` |
| 删除数据 | `DELETE FROM ... WHERE ...` |
| 清空表 | `TRUNCATE TABLE ...` |
| 创建索引 | `CREATE INDEX ...` |
| 开始事务 | `BEGIN` |
| 提交事务 | `COMMIT` |
| 回滚事务 | `ROLLBACK` |

## 16. 学习建议

建议按下面顺序练习：

1. 创建 `users` 和 `orders` 两张表。
2. 插入多条用户和订单数据。
3. 使用 `SELECT`、`WHERE`、`ORDER BY`、`LIMIT` 查询。
4. 使用 `JOIN` 查询用户及订单。
5. 使用 `UPDATE` 和 `DELETE`，观察受影响的行数。
6. 增加唯一约束、外键约束和检查约束。
7. 为常用查询建立索引，并使用 `EXPLAIN` 对比执行计划。
8. 用事务实现一个“创建订单并扣减库存”的操作。
9. 再用 Prisma 实现同样的 CRUD。
