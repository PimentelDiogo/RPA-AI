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
    // Migrations usam a conexão direta quando ela existe. Em produção o
    // DATABASE_URL aponta para o pooler de transações, que não aceita DDL:
    // migrar por ele falha no meio, com o schema pela metade.
    url: process.env.DIRECT_URL || env("DATABASE_URL"),
  },
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
