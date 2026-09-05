import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { hashPassword } from '../src/auth/password.js';
import { AppModule } from '../src/learn/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;
  const admin = {
    id: 'user-admin',
    username: 'admin',
    passwordHash: hashPassword('123456'),
  };
  const prisma = {
    user: {
      findUnique: vi.fn(),
    },
  };

  beforeEach(async () => {
    prisma.user.findUnique.mockResolvedValue(admin);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('/auth/login (POST) returns an access token', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'admin', password: '123456' })
      .expect(200);

    expect(response.body.accessToken.split('.')).toHaveLength(3);
    expect(response.body.tokenType).toBe('Bearer');
    expect(response.body.expiresIn).toBe(3600);
    expect(response.body.user).toEqual({ id: 'user-admin', username: 'admin' });
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

  afterEach(async () => {
    await app.close();
  });
});
