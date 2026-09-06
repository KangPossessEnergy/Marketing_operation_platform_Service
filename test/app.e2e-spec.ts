import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app/app.module.js';
import { createValidationPipe } from '../src/common/pipes/create-validation-pipe.js';
import { PrismaService } from '../src/database/prisma/prisma.service.js';
import { hashPassword } from '../src/modules/auth/security/password.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const users: Array<{
    id: string;
    username: string | null;
    phone: string | null;
    passwordHash: string | null;
    phoneVerifiedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }> = [];
  const sessions: Array<{
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    createdAt: Date;
  }> = [];
  const smsCodes: Array<{
    id: string;
    phone: string;
    purpose: string;
    codeHash: string;
    expiresAt: Date;
    consumedAt: Date | null;
    attempts: number;
    createdAt: Date;
  }> = [];
  const toPublicUser = (user: (typeof users)[number]) => ({
    id: user.id,
    username: user.username,
    phone: user.phone,
    phoneVerifiedAt: user.phoneVerifiedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  });
  let userSequence = 1;
  let smsCodeSequence = 1;

  const prisma = {
    user: {
      findUnique: vi.fn(
        async ({
          where,
          select,
        }: {
          where: Record<string, string>;
          select?: object;
        }) => {
          const user = users.find(
            (item) =>
              (where.id !== undefined && item.id === where.id) ||
              (where.username !== undefined && item.username === where.username) ||
              (where.phone !== undefined && item.phone === where.phone),
          );

          return user ? (select ? toPublicUser(user) : user) : null;
        },
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            username?: string | null;
            phone?: string | null;
            passwordHash?: string | null;
            phoneVerifiedAt?: Date | null;
          };
        }) => {
          const user = {
            id: `user-${userSequence++}`,
            username: data.username ?? null,
            phone: data.phone ?? null,
            passwordHash: data.passwordHash ?? null,
            phoneVerifiedAt: data.phoneVerifiedAt ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          users.push(user);
          return user;
        },
      ),
      findMany: vi.fn(
        async ({
          where,
          skip,
          take,
          select,
        }: {
          where: {
            OR?: Array<{
              username?: { contains: string };
              phone?: { contains: string };
            }>;
          };
          skip: number;
          take: number;
          select?: object;
        }) => {
          const keyword =
            where.OR?.[0]?.username?.contains ?? where.OR?.[1]?.phone?.contains;
          const matchingUsers = keyword
            ? users.filter(
                (user) =>
                  user.username?.toLowerCase().includes(keyword.toLowerCase()) ||
                  user.phone?.includes(keyword),
              )
            : users;

          return matchingUsers
            .slice()
            .sort(
              (left, right) =>
                right.createdAt.getTime() - left.createdAt.getTime() ||
                right.id.localeCompare(left.id),
            )
            .slice(skip, skip + take)
            .map((user) => (select ? toPublicUser(user) : user));
        },
      ),
      count: vi.fn(
        async ({
          where,
        }: {
          where: {
            OR?: Array<{
              username?: { contains: string };
              phone?: { contains: string };
            }>;
          };
        }) => {
          const keyword =
            where.OR?.[0]?.username?.contains ?? where.OR?.[1]?.phone?.contains;

          return keyword
            ? users.filter(
                (user) =>
                  user.username?.toLowerCase().includes(keyword.toLowerCase()) ||
                  user.phone?.includes(keyword),
              ).length
            : users.length;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
          select,
        }: {
          where: { id: string };
          data: { phone?: string; phoneVerifiedAt?: Date | null };
          select?: object;
        }) => {
          const user = users.find((item) => item.id === where.id);

          if (!user) {
            throw new Error('User not found');
          }

          if (data.phone !== undefined) {
            user.phone = data.phone;
          }
          if (data.phoneVerifiedAt !== undefined) {
            user.phoneVerifiedAt = data.phoneVerifiedAt;
          }
          user.updatedAt = new Date();

          return select ? toPublicUser(user) : user;
        },
      ),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const index = users.findIndex((user) => user.id === where.id);

        if (index === -1) {
          throw new Error('User not found');
        }

        return users.splice(index, 1)[0];
      }),
    },
    $transaction: vi.fn(async (operations: Array<Promise<unknown>>) =>
      Promise.all(operations),
    ),
    authSession: {
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            id: string;
            userId: string;
            tokenHash: string;
            expiresAt: Date;
          };
        }) => {
          const session = {
            ...data,
            revokedAt: null,
            createdAt: new Date(),
          };
          sessions.push(session);
          return session;
        },
      ),
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: {
            id: string;
            userId: string;
            tokenHash: string;
            revokedAt: null;
            expiresAt: { gt: Date };
          };
        }) =>
          sessions.find(
            (session) =>
              session.id === where.id &&
              session.userId === where.userId &&
              session.tokenHash === where.tokenHash &&
              session.revokedAt === where.revokedAt &&
              session.expiresAt > where.expiresAt.gt,
          ) ?? null,
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string; userId: string; revokedAt: null };
          data: { revokedAt: Date };
        }) => {
          const matchingSessions = sessions.filter(
            (session) =>
              session.id === where.id &&
              session.userId === where.userId &&
              session.revokedAt === where.revokedAt,
          );
          matchingSessions.forEach((session) => {
            session.revokedAt = data.revokedAt;
          });
          return { count: matchingSessions.length };
        },
      ),
    },
    smsVerificationCode: {
      findFirst: vi.fn(
        async ({
          where,
        }: {
          where: { phone: string; purpose: string };
          orderBy: { createdAt: 'desc' };
        }) =>
          smsCodes
            .filter(
              (code) =>
                code.phone === where.phone && code.purpose === where.purpose,
            )
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ??
          null,
      ),
      create: vi.fn(
        async ({
          data,
        }: {
          data: {
            phone: string;
            purpose: string;
            codeHash: string;
            expiresAt: Date;
          };
        }) => {
          const code = {
            id: `sms-code-${smsCodeSequence++}`,
            ...data,
            consumedAt: null,
            attempts: 0,
            createdAt: new Date(),
          };
          smsCodes.push(code);
          return code;
        },
      ),
      update: vi.fn(
        async ({
          where,
          data,
        }: {
          where: { id: string };
          data: { attempts: { increment: number } };
        }) => {
          const code = smsCodes.find((item) => item.id === where.id);
          if (!code) {
            throw new Error('SMS code not found');
          }
          code.attempts += data.attempts.increment;
          return code;
        },
      ),
      updateMany: vi.fn(
        async ({
          where,
          data,
        }: {
          where: {
            id: string;
            consumedAt: null;
            expiresAt: { gt: Date };
          };
          data: { consumedAt: Date };
        }) => {
          const code = smsCodes.find(
            (item) =>
              item.id === where.id &&
              item.consumedAt === where.consumedAt &&
              item.expiresAt > where.expiresAt.gt,
          );
          if (code) {
            code.consumedAt = data.consumedAt;
          }
          return { count: code ? 1 : 0 };
        },
      ),
    },
  };

  beforeEach(async () => {
    process.env.SMS_FIXED_CODE = '123456';
    users.length = 0;
    sessions.length = 0;
    smsCodes.length = 0;
    userSequence = 1;
    smsCodeSequence = 1;
    users.push({
      id: 'user-admin',
      username: 'admin',
      phone: null,
      passwordHash: hashPassword('123456'),
      phoneVerifiedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/auth/register (POST) creates an account and returns an access token', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ username: 'new_user', password: '123456' })
      .expect(201);

    expect(response.body.accessToken.split('.')).toHaveLength(3);
    expect(response.body.tokenType).toBe('Bearer');
    expect(response.body.expiresIn).toBe(3600);
    expect(response.body.user).toEqual({
      id: 'user-1',
      username: 'new_user',
      phone: null,
    });
    expect(response.body.user).not.toHaveProperty('passwordHash');
  });

  it('/auth/login (POST) returns an access token for valid credentials', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: '123456' })
      .expect(200);

    expect(response.body.accessToken.split('.')).toHaveLength(3);
    expect(response.body.user).toEqual({
      id: 'user-admin',
      username: 'admin',
      phone: null,
    });
  });

  it('/auth/login (POST) validates required fields', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin' })
      .expect(400);
  });

  it('/auth/login (POST) rejects invalid credentials', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: 'wrong-password' })
      .expect(401);
  });

  it('manages protected user records without exposing password hashes', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: '123456' })
      .expect(200);
    const token = loginResponse.body.accessToken as string;

    await request(app.getHttpServer()).get('/users').expect(401);

    const createResponse = await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'managed_user', password: '123456' })
      .expect(201);
    const userId = createResponse.body.id as string;

    expect(createResponse.body).toMatchObject({
      id: userId,
      username: 'managed_user',
      phone: null,
    });
    expect(createResponse.body).not.toHaveProperty('passwordHash');

    const listResponse = await request(app.getHttpServer())
      .get('/users?page=1&pageSize=20&keyword=managed')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(listResponse.body).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
    });
    expect(listResponse.body.items).toHaveLength(1);
    expect(listResponse.body.items[0]).toMatchObject({
      id: userId,
      username: 'managed_user',
    });
    expect(listResponse.body.items[0]).not.toHaveProperty('passwordHash');

    await request(app.getHttpServer())
      .patch(`/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ phone: '13800138000' })
      .expect(200)
      .expect(({ body }) => {
        expect(body.phone).toBe('13800138000');
        expect(body.phoneVerifiedAt).toBeNull();
      });

    await request(app.getHttpServer())
      .get(`/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        expect(body.phone).toBe('13800138000');
        expect(body).not.toHaveProperty('passwordHash');
      });

    await request(app.getHttpServer())
      .delete(`/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app.getHttpServer())
      .get(`/users/${userId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('validates user CRUD input', async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: '123456' })
      .expect(200);
    const token = loginResponse.body.accessToken as string;

    await request(app.getHttpServer())
      .post('/users')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'missing_password' })
      .expect(400);

    await request(app.getHttpServer())
      .get('/users?page=1&pageSize=101')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(app.getHttpServer())
      .patch('/users/user-admin')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(400);
  });

  it('supports SMS login and revokes the session at logout', async () => {
    const phone = '13800138000';
    await request(app.getHttpServer())
      .post('/auth/sms/send')
      .send({ phone })
      .expect(200)
      .expect({ message: '验证码已发送', expiresIn: 300 });

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login/sms')
      .send({ phone, code: '123456' })
      .expect(200);
    const token = loginResponse.body.accessToken as string;

    expect(loginResponse.body.user).toEqual({
      id: 'user-1',
      username: null,
      phone,
    });

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${token}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login/sms')
      .send({ phone, code: '123456' })
      .expect(401);
  });

  it('limits SMS code resend frequency', async () => {
    const phone = '13800138000';
    await request(app.getHttpServer())
      .post('/auth/sms/send')
      .send({ phone })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/sms/send')
      .send({ phone })
      .expect(429);
  });

  afterEach(async () => {
    await app.close();
  });
});
