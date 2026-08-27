import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "@/generated/prisma/client";

/**
 * Cliente Prisma do portal.
 *
 * No Prisma 7 a conexão chega por driver adapter, não pela URL no schema.
 * Em desenvolvimento o cliente é guardado no escopo global para que o
 * hot reload do Next não abra um pool novo a cada recompilação.
 */
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

/**
 * O schema vem no `?schema=` da connection string, como o Prisma documenta.
 * Em produção o portal divide o banco com outra aplicação e vive num schema
 * próprio; o adapter precisa saber disso, senão as consultas iriam para o
 * `public` — que é de outro sistema.
 */
function lerConfiguracao(url: string) {
  const schema = new URL(url).searchParams.get("schema") ?? undefined;
  return { connectionString: url, schema };
}

function createPrismaClient() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    throw new Error(
      "DATABASE_URL não definida. Copie .env.example para .env antes de subir o portal.",
    );
  }

  const { connectionString, schema } = lerConfiguracao(url);

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }, { schema }),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
