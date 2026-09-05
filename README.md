<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## PostgreSQL + Prisma

1. 创建本地环境文件：

```bash
cp .env.example .env
```

2. 启动 PostgreSQL。若尚未有本地实例，可用 Docker：

```bash
docker run --name nest-learn-postgres \
  -e POSTGRES_USER=nest \
  -e POSTGRES_PASSWORD=nest \
  -e POSTGRES_DB=nest_learn \
  -p 5432:5432 \
  -d postgres:17-alpine
```

3. 根据实际 PostgreSQL 账号修改 `.env` 中的 `DATABASE_URL`，然后生成客户端、迁移并创建演示用户：

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

可用 `pnpm db:studio` 在浏览器中查看数据。`AUTH_USERNAME` 和
`AUTH_PASSWORD` 只用于 `pnpm db:seed` 创建或更新初始用户；生产环境请设置
唯一的 `JWT_SECRET`、`SMS_CODE_SECRET` 和强密码。应用启动时会通过
`ConfigModule` 读取分组配置，DTO 由全局 `ValidationPipe` 统一校验。

## 目录结构

```text
src/
  app/                    # 应用根模块和基础健康接口
  common/                 # 跨模块装饰器、管道、守卫等
  config/                 # 环境变量到应用配置的映射
  database/prisma/        # Prisma 客户端和数据库基础设施
  modules/auth/           # 认证控制器、服务、会话、验证码和短信网关
  modules/users/          # 用户领域服务和 repository
```

认证模块通过 `UsersService` 和 `AuthRepository` 访问数据，短信通过
`SmsGateway` 接口隔离供应商。默认 `SMS_PROVIDER=mock` 仅用于本地开发，验证码
会输出到应用日志；生产环境必须替换为真实短信网关实现，不能继续使用 mock。

## 认证接口

### 注册

接口地址：`POST /auth/register`

请求体：

```json
{
  "username": "new_user",
  "password": "123456"
}
```

成功返回 `201`，响应中包含用户公开信息和访问令牌，不会返回密码哈希。

### 用户名密码登录

接口地址：`POST /auth/login`

请求体：

```json
{
  "username": "admin",
  "password": "123456"
}
```

执行 `pnpm db:seed` 后，默认演示账号为 `admin / 123456`，也可以通过
`AUTH_USERNAME` 和 `AUTH_PASSWORD` 环境变量修改。接口会从 PostgreSQL 查询用户并
校验密码哈希，成功后返回 `Bearer` 访问令牌。

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

### 短信验证码登录

先发送验证码：

```bash
curl -X POST http://localhost:3000/auth/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000"}'
```

再登录：

```bash
curl -X POST http://localhost:3000/auth/login/sms \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","code":"123456"}'
```

本地 mock 模式下验证码默认使用 `SMS_FIXED_CODE`，未设置时会随机生成并写入
日志。验证码只在数据库中保存哈希，成功校验后只能消费一次，并限制有效期、重试
次数和发送频率。

### 退出登录

接口地址：`POST /auth/logout`

退出时需要携带登录接口返回的访问令牌：

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <access-token>"
```

接口返回 `204`，服务端会撤销对应会话；同一个令牌再次请求受保护接口会返回
`401`。当前项目使用短时效 access token + 数据库会话撤销模型，后续接入 refresh
token 时可在 `auth_sessions` 上继续扩展轮换策略。

## Project setup

```bash
$ pnpm install
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observer](https://observer.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
