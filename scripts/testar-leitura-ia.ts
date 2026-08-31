/**
 * Reprocessa um extrato pela leitura assistida e mostra o resultado.
 *
 * Existe para provar o caminho de IA de ponta a ponta — leitura, validação,
 * confiança e fila de conferência — sem depender da tela, e para medir o custo
 * antes de uma apresentação.
 *
 *   npx tsx scripts/testar-leitura-ia.ts horizonte
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const filtro = process.argv[2] ?? "horizonte";
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
  const { processarExtrato } = await import("../src/modules/sc-01/handler");

  const extrato = await prisma.extratoImportado.findFirst({
    where: { arquivoNome: { contains: filtro } },
    select: { id: true, arquivoNome: true, status: true },
  });

  if (!extrato) {
    console.error(`Nenhum extrato com "${filtro}" no nome. Rode o seed antes.`);
    process.exitCode = 1;
    return;
  }

  console.log(`arquivo: ${extrato.arquivoNome} (estado atual: ${extrato.status})`);

  const inicio = Date.now();
  const resultado = await processarExtrato(extrato.id);
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1);

  console.log(
    `\nlido em ${segundos}s · ${resultado.banco} · ${resultado.lancamentos} lançamentos · ` +
      `${resultado.emConferencia} em conferência · OFX ${resultado.ofxGerado ? "gerado" : "não gerado"}`,
  );

  const lancamentos = await prisma.lancamento.findMany({
    where: { extratoId: extrato.id },
    orderBy: { ordem: "asc" },
  });

  for (const lancamento of lancamentos) {
    console.log(
      `   ${lancamento.data.toISOString().slice(0, 10)}  ` +
        `${lancamento.historico.slice(0, 34).padEnd(34)} ` +
        `${Number(lancamento.valor).toFixed(2).padStart(10)}  ${lancamento.confianca}`,
    );
  }

  const atualizado = await prisma.extratoImportado.findUniqueOrThrow({
    where: { id: extrato.id },
    select: { origemLeitura: true, erro: true, diferencaSaldo: true },
  });

  console.log(`\norigem da leitura: ${atualizado.origemLeitura}`);
  if (atualizado.diferencaSaldo) {
    console.log(`diferença de saldo: ${atualizado.diferencaSaldo}`);
  }
  if (atualizado.erro) console.log(`observação: ${atualizado.erro}`);
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
