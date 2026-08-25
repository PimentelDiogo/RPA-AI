import "dotenv/config";

import { defineConfig, env } from "prisma/config";

/**
 * Configuração do Prisma CLI (migrate, seed, studio).
 *
 * A partir do Prisma 7 a connection string sai do schema.prisma e vive aqui;
 * o schema fica só com o modelo. Em runtime, o PrismaClient recebe a conexão
 * por driver adapter (ver src/lib/db.ts).
 *
 * O Prisma 7 não lê o .env sozinho — daí o import do dotenv acima.
 */
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
