import argon2 from 'argon2';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, Role } from '../src/generated/prisma/client.js';

const databaseUrl = process.env.DATABASE_URL;
const adminEmail = process.env.SEED_ADMIN_EMAIL;
const adminPassword = process.env.SEED_ADMIN_PASSWORD;

if (!databaseUrl) {
  throw new Error('DATABASE_URL is required to seed the database');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main(): Promise<void> {
  if (!adminEmail || !adminPassword) {
    console.info('Skipping admin seed: set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD explicitly.');
    return;
  }

  const passwordHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email: adminEmail.trim().toLowerCase() },
    create: {
      email: adminEmail.trim().toLowerCase(),
      displayName: 'ScaleForge Admin',
      passwordHash,
      role: Role.ADMIN,
    },
    update: { passwordHash, role: Role.ADMIN, active: true },
  });
}

main()
  .finally(async () => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
