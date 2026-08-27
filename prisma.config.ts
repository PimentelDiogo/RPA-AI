import "dotenv/config";

import { defineConfig } from "prisma/config";

/**
 * Configuração do Prisma CLI (migrate, seed, studio).
 *
 * A partir do Prisma 7 a connection string sai do schema.prisma e vive aqui;
 * o schema fica só com o modelo. Em runtime, o PrismaClient recebe a conexão
 * por driver adapter (ver src/lib/db.ts).
 *
 * O Prisma 7 não lê o .env sozinho — daí o import do dotenv acima.
 *
 * Migrations usam a conexão direta quando ela existe: em produção o
 * DATABASE_URL aponta para o pooler de transações, que não aceita DDL, e
 * migrar por ele falharia no meio, com o schema pela metade.
 */
const url = process.env.DIRECT_URL || process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  // A URL só entra quando existe. Este arquivo é avaliado em todo comando do
  // Prisma, inclusive `generate`, que não precisa de banco: exigir a variável
  // aqui quebra o CI e quem clona o repositório antes de criar o .env.
  // Faltando a URL, quem reclama é o comando que de fato precisa dela.
  ...(url ? { datasource: { url } } : {}),
  migrations: {
    seed: "tsx prisma/seed.ts",
  },
});
