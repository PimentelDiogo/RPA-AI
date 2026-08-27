/**
 * Mostra a agenda como ela está no banco, em UTC e no fuso da operação.
 *
 * Existe porque horário é onde agendador erra em silêncio: o número no banco
 * parece certo e a automação roda três horas fora.
 *
 *   npx tsx scripts/verificar-agenda.ts
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const url = process.env.DATABASE_URL!;

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString: url },
    { schema: new URL(url).searchParams.get("schema") ?? undefined },
  ),
});

async function main() {
  const agendamentos = await prisma.agendamento.findMany({
    orderBy: { modulo: "asc" },
  });

  for (const agendamento of agendamentos) {
    const emSaoPaulo = agendamento.proximaExecucaoEm?.toLocaleString("pt-BR", {
      timeZone: "America/Sao_Paulo",
    });

    console.log(
      [
        agendamento.modulo,
        `cron=${agendamento.cron}`,
        `utc=${agendamento.proximaExecucaoEm?.toISOString() ?? "—"}`,
        `sao_paulo=${emSaoPaulo ?? "—"}`,
      ].join("  "),
    );
  }
}

main()
  .catch((erro) => {
    console.error(erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
