import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { randomBytes, scryptSync } from 'node:crypto';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL must be set before seeding the database');
}

const username = process.env.AUTH_USERNAME ?? 'admin';
const password = process.env.AUTH_PASSWORD ?? '123456';
const salt = randomBytes(16).toString('hex');
const passwordHash = `scrypt$${salt}$${scryptSync(password, salt, 64).toString('hex')}`;
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

try {
  await prisma.user.upsert({
    where: { username },
    update: { passwordHash },
    create: { username, passwordHash },
  });

  const root = await prisma.organizationNode.upsert({
    where: { code: 'TMALL' },
    update: {
      name: '天猫精灵',
      type: 'ROOT',
      parentId: null,
      contactName: '小爱',
      address: '浙江省杭州市滨江区',
      contactPhone: '19920807755',
      region: '华东',
      province: '浙江省',
    },
    create: {
      name: '天猫精灵',
      code: 'TMALL',
      type: 'ROOT',
      contactName: '小爱',
      address: '浙江省杭州市滨江区',
      contactPhone: '19920807755',
      region: '华东',
      province: '浙江省',
    },
  });

  const regions = [
    { name: '华南', code: 'SOUTH_CHINA' },
    { name: '华东', code: 'EAST_CHINA' },
    { name: '华北', code: 'NORTH_CHINA' },
  ];

  for (const region of regions) {
    await prisma.organizationNode.upsert({
      where: { code: region.code },
      update: { name: region.name, parentId: root.id, type: 'REGION' },
      create: { ...region, parentId: root.id, type: 'REGION' },
    });
  }
} finally {
  await prisma.$disconnect();
}
