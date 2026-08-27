/**
 * Antecipa a janela de um módulo para agora, para o próximo tick do agendador
 * executá-lo sem esperar o horário.
 *
 * Existe para demonstração e teste: provar que a automação roda sozinha não
 * pode depender de esperar até as 8h da manhã.
 *
 *   npx tsx scripts/forcar-agendamento.ts SC-20
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const modulo = process.argv[2];

if (!modulo) {
  console.error("Informe o código do módulo. Exemplo: SC-20");
  process.exit(1);
}

const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: url },
    { schema: new URL(url).searchParams.get("schema") ?? undefined },
  ),
});

async function main() {
  const agora = new Date();

  const agendamento = await prisma.agendamento.update({
    where: { modulo },
    // Um minuto no passado: o tick considera vencido o que já passou da hora.
    data: { proximaExecucaoEm: new Date(agora.getTime() - 60_000) },
  });

  console.log(
    `${agendamento.modulo}: janela antecipada para ${agendamento.proximaExecucaoEm?.toISOString()} — o próximo tick vai executá-lo.`,
  );
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
