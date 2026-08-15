import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    // Client generation and static validation should not require a live secret.
    // Runtime and migration commands still receive DATABASE_URL from the environment.
    url: process.env.DATABASE_URL ?? 'postgresql://scaleforge:scaleforge@localhost:5432/scaleforge',
  },
});
