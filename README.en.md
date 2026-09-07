# Nest Learn

A backend learning project built with **NestJS + Node.js + PostgreSQL + Prisma**.

Language: [中文 README](./README.md)

## Project Status

The project currently includes:

- A NestJS ESM + TypeScript application
- PostgreSQL connectivity and Prisma migrations
- Username/password registration and login
- SMS verification-code login with a local mock provider
- Logout backed by access tokens and revocable database sessions
- Global DTO validation
- Data models for users, authentication sessions, and SMS verification codes
- Data models for conversations and chat messages
- Full conversation CRUD (list, details, create, rename, delete) and message storage APIs
- Unit-test and end-to-end test examples

The complete enterprise CRUD implementation guide is available in
[learn-docs/nestjs.md](./learn-docs/nestjs.md). It is currently provided as a learning
and extension guide. The source users module primarily supports authentication and does
not yet expose full management endpoints such as `GET /users` or `PATCH /users/:id` by
default.

## Tech Stack

- Node.js
- TypeScript
- NestJS
- PostgreSQL
- Prisma ORM
- `class-validator` / `class-transformer`
- Vitest
- pnpm

## Requirements

- Node.js 24+
- pnpm
- PostgreSQL 17, or Docker

## Quick Start

### 1. Install dependencies

```bash
pnpm install
```

### 2. Create the environment file

```bash
cp .env.example .env
```

Update `DATABASE_URL` in `.env` to match your local PostgreSQL username, password,
port, and database name.

### 3. Start PostgreSQL

If PostgreSQL is not already running locally, start it with Docker:

```bash
docker run --name nest-learn-postgres \
  -e POSTGRES_USER=nest \
  -e POSTGRES_PASSWORD=nest \
  -e POSTGRES_DB=nest_learn \
  -p 5432:5432 \
  -d postgres:17-alpine
```

If the container already exists, start it with:

```bash
docker start nest-learn-postgres
```

### 4. Initialize the database

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

`db:seed` creates or updates the demo account. The default credentials are:

```text
Username: admin
Password: 123456
```

Use `AUTH_USERNAME` and `AUTH_PASSWORD` to change the seeded account. Always use a
strong password and unique secrets in production.

### 5. Start the application

```bash
pnpm start:dev
```

The application runs at:

```text
http://localhost:3000
```

Check the root endpoint:

```bash
curl http://localhost:3000
```

## Database Commands

```bash
# Generate Prisma Client
pnpm db:generate

# Create and apply migrations in development
pnpm db:migrate

# Apply committed migrations in production
pnpm db:deploy

# Create or update the demo user
pnpm db:seed

# Inspect the database in a browser
pnpm db:studio
```

After running `pnpm db:studio`, the browser interface is usually available at:

```text
http://localhost:5555
```

The current database contains:

- `users`
- `auth_sessions`
- `sms_verification_codes`
- `_prisma_migrations`

The data model is defined in [prisma/schema.prisma](./prisma/schema.prisma), and
migrations are stored in `prisma/migrations/`.

## Authentication API

### Register

`POST /auth/register`

```bash
curl -X POST http://localhost:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"new_user","password":"123456"}'
```

The endpoint returns `201` with public user information and an access token. Password
hashes are never returned.

### Username/password login

`POST /auth/login`

```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"123456"}'
```

Typical response:

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

### Send an SMS verification code

`POST /auth/sms/send`

```bash
curl -X POST http://localhost:3000/auth/sms/send \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000"}'
```

### SMS login

`POST /auth/login/sms`

```bash
curl -X POST http://localhost:3000/auth/login/sms \
  -H "Content-Type: application/json" \
  -d '{"phone":"13800138000","code":"123456"}'
```

With the local `SMS_PROVIDER=mock` configuration, the code defaults to
`SMS_FIXED_CODE`. Without a fixed code, a random code is generated and written to the
application log. Replace the mock provider with a real SMS provider in production.

Verification codes are stored only as hashes, can be consumed once, and are protected
by expiration, maximum-attempt, and resend-frequency limits.

### Logout

`POST /auth/logout`

```bash
curl -X POST http://localhost:3000/auth/logout \
  -H "Authorization: Bearer <access-token>"
```

The endpoint returns `204` and revokes the corresponding database session. The same
access token can no longer access protected endpoints.

## Conversations & Messages API

### Get Conversation List

`GET /conversations`

```bash
curl http://localhost:3000/conversations
```

Returns conversations ordered by `updatedAt` in descending order, including `id`, `title`, `createdAt`, `updatedAt`, and message count `_count`.

### Create New Conversation

`POST /conversations`

```bash
curl -X POST http://localhost:3000/conversations \
  -H "Content-Type: application/json" \
  -d '{"title":"New Chat"}'
```

`title` is optional (defaults to `"新对话"`). Returns the newly created conversation object.

### Get Conversation Details & Message History

`GET /conversations/:id`

```bash
curl http://localhost:3000/conversations/<conversation-id>
```

Returns the conversation details along with all associated messages ordered chronologically (`messages`).

### Update Conversation Title

`PATCH /conversations/:id`

```bash
curl -X PATCH http://localhost:3000/conversations/<conversation-id> \
  -H "Content-Type: application/json" \
  -d '{"title":"Product Launch Campaign Strategy"}'
```

### Append Message

`POST /conversations/:id/messages`

```bash
curl -X POST http://localhost:3000/conversations/<conversation-id>/messages \
  -H "Content-Type: application/json" \
  -d '{"role":"user","content":"Help me plan a marketing strategy"}'
```

Saves the message and automatically refreshes the conversation's `updatedAt`.

### Delete Conversation

`DELETE /conversations/:id`

```bash
curl -X DELETE http://localhost:3000/conversations/<conversation-id>
```

Deletes the conversation and cascades to all its associated messages (with fault-tolerant handling for mock IDs or already-deleted records).

## Configuration

| Variable                   | Purpose                                        |
| -------------------------- | ---------------------------------------------- |
| `DATABASE_URL`             | PostgreSQL connection string                   |
| `JWT_SECRET`               | Access-token signing secret                    |
| `ACCESS_TOKEN_EXPIRES_IN`  | Access-token lifetime in seconds               |
| `AUTH_USERNAME`            | Demo username used by the seed script          |
| `AUTH_PASSWORD`            | Demo password used by the seed script          |
| `SMS_PROVIDER`             | SMS provider; use `mock` only for development  |
| `SMS_CODE_SECRET`          | Secret used to hash SMS codes                  |
| `SMS_CODE_EXPIRES_IN`      | SMS-code lifetime in seconds                   |
| `SMS_CODE_RESEND_INTERVAL` | Minimum resend interval in seconds             |
| `SMS_CODE_MAX_ATTEMPTS`    | Maximum verification attempts                  |
| `SMS_FIXED_CODE`           | Fixed local/test code; never use in production |

Do not commit `.env` to Git. Never use example secrets, default passwords, or fixed
verification codes in production.

## Project Structure

```text
src/
  app/                    # Root module and basic endpoint
  common/                 # Shared decorators, pipes, and utilities
  config/                 # Environment and application configuration
  database/prisma/        # Prisma Client and database infrastructure
  modules/auth/           # Registration, login, SMS, tokens, and sessions
  modules/users/          # User queries and authentication-related user services
prisma/
  migrations/             # Database migrations
  schema.prisma           # Prisma data model
  seed.mjs                # Development data seed
learn-docs/
  postgresql.md           # Enterprise PostgreSQL CRUD
  prisma.md               # Enterprise Prisma CRUD
  nodejs.md               # Node.js service engineering
  nestjs.md               # NestJS layered CRUD implementation
test/                     # End-to-end tests
```

## Learning Guides

- [PostgreSQL: data design, indexes, transactions, and migrations](./learn-docs/postgresql.md)
- [Prisma: type-safe data access and CRUD](./learn-docs/prisma.md)
- [Node.js: runtime, error handling, and security boundaries](./learn-docs/nodejs.md)
- [NestJS: Controllers, Services, Repositories, and CRUD APIs](./learn-docs/nestjs.md)

Recommended order:

```text
PostgreSQL -> Prisma -> Node.js -> NestJS
```

## Development Commands

```bash
# Start the development server
pnpm start:dev

# Build the project
pnpm build

# Start the production build
pnpm start:prod

# Lint the source and tests
pnpm lint

# Format TypeScript and test files
pnpm format

# Run unit tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run end-to-end tests
pnpm test:e2e

# Generate test coverage
pnpm test:cov
```

## Production Notes

- Use strong, randomly generated `JWT_SECRET` and `SMS_CODE_SECRET` values.
- Do not use `SMS_PROVIDER=mock`, `SMS_FIXED_CODE`, or the default demo password.
- Do not run the application with a PostgreSQL superuser.
- Use `pnpm db:deploy` in production instead of `pnpm db:migrate`.
- Never log passwords, tokens, connection strings, verification codes, or password hashes.
- Add role, permission, and resource-ownership checks before exposing management CRUD APIs.
- Back up the database and regularly test the restore procedure.

## License

This project is intended for learning and local development.
