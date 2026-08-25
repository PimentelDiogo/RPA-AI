/**
 * Seed do portal — massa de dados 100% sintética.
 *
 * O enunciado exige que o portal chegue com dado dentro, não vazio: nenhum
 * acesso real é concedido, então clientes, extratos, certificados e situações
 * fiscais são gerados aqui. CNPJ é fictício, mas válido em formato.
 *
 * O seed é determinístico: rodar duas vezes produz a mesma base. Isso vale
 * tanto para a demonstração quanto para os testes.
 *
 * Bootstrap: ainda não há modelos no schema. Cada módulo adiciona sua massa
 * aqui conforme entra.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não definida. Copie .env.example para .env antes de rodar o seed.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  console.log("[seed] nenhum modelo no schema ainda — nada a semear.");
}

main()
  .catch((error) => {
    console.error("[seed] falhou:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
