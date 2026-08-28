/**
 * Roda o SC-02 com um navegador de verdade.
 *
 * O adapter HTTP é o que roda na nuvem, porque função serverless não tem
 * navegador. Este script existe para a outra metade da história: um robô que
 * **opera o portal** — abre a página, digita o CNPJ, clica em consultar e lê o
 * resultado — que é o que o enunciado chama de RPA.
 *
 * A execução entra no mesmo histórico do portal, com o mesmo item a item, e
 * cada consulta anexa **a captura da tela que o robô viu**. A prova deixa de
 * ser "o robô diz que consultou".
 *
 *   npm run rpa:sc-02              # navegador invisível
 *   npm run rpa:sc-02 -- --ver     # navegador na tela, para demonstrar
 *
 * Antes: o portal precisa estar no ar (npm run dev), porque é ele quem serve
 * os portais simulados dos órgãos.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  Disparo,
  OrgaoConsultado,
  StatusItem,
  TipoArtefato,
} from "../src/generated/prisma/enums";

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

const MOSTRAR_NAVEGADOR = process.argv.includes("--ver");

/**
 * Poucos clientes de propósito: abrir um navegador por consulta é caro, e o
 * objetivo aqui é provar que o robô opera o portal — não varrer a base, que é
 * o que o adapter HTTP faz todo dia.
 */
const QUANTOS_CLIENTES = 3;
const ORGAOS: OrgaoConsultado[] = [
  OrgaoConsultado.RECEITA_FEDERAL,
  OrgaoConsultado.FGTS,
];

async function main() {
  const { OrgaoPlaywright } = await import(
    "../src/modules/sc-02/adapters/orgao-playwright"
  );
  const { ROTULO_ORGAO, baseDosOrgaos } = await import(
    "../src/modules/sc-02/orgaos"
  );

  const base = baseDosOrgaos();
  console.log(`[rpa] portais dos órgãos: ${base}`);
  console.log(
    `[rpa] navegador ${MOSTRAR_NAVEGADOR ? "visível" : "invisível"} · ${QUANTOS_CLIENTES} clientes × ${ORGAOS.length} órgãos`,
  );

  const clientes = await prisma.cliente.findMany({
    where: { ativo: true },
    select: { id: true, cnpj: true, razaoSocial: true, nomeFantasia: true },
    orderBy: { razaoSocial: "asc" },
    take: QUANTOS_CLIENTES,
  });

  if (clientes.length === 0) {
    console.error("Nenhum cliente na base. Rode o seed antes.");
    process.exitCode = 1;
    return;
  }

  const robo = new OrgaoPlaywright(
    { headless: !MOSTRAR_NAVEGADOR, capturarTela: true },
    base,
  );

  const inicio = Date.now();
  const execucao = await prisma.execucao.create({
    data: { modulo: "SC-02", disparo: Disparo.MANUAL, status: "EM_EXECUCAO" },
    select: { id: true },
  });

  let sucessos = 0;
  let falhas = 0;

  for (const cliente of clientes) {
    for (const orgao of ORGAOS) {
      const nome = cliente.nomeFantasia ?? cliente.razaoSocial;
      const referencia = `${nome} — ${ROTULO_ORGAO[orgao]}`;
      process.stdout.write(`[rpa] ${referencia} … `);

      const resultado = await robo.consultar(cliente.cnpj, orgao);

      await prisma.consultaTentativa.create({
        data: {
          clienteId: cliente.id,
          orgao,
          execucaoId: execucao.id,
          tentativa: 1,
          sucesso: resultado.sucesso,
          situacao: resultado.sucesso ? resultado.situacao : null,
          erro: resultado.sucesso ? null : resultado.erro,
          respostaBruta: resultado.respostaBruta ?? null,
          origem: resultado.origem,
          duracaoMs: resultado.duracaoMs,
        },
      });

      if (resultado.sucesso) {
        await prisma.situacaoFiscal.upsert({
          where: { clienteId_orgao: { clienteId: cliente.id, orgao } },
          create: {
            clienteId: cliente.id,
            orgao,
            situacao: resultado.situacao,
            detalhe: resultado.detalhe ?? null,
            apuradaEm: new Date(),
            origem: resultado.origem,
          },
          update: {
            situacao: resultado.situacao,
            detalhe: resultado.detalhe ?? null,
            apuradaEm: new Date(),
            origem: resultado.origem,
          },
        });
      }

      await prisma.execucaoItem.create({
        data: {
          execucaoId: execucao.id,
          referencia,
          status: resultado.sucesso ? StatusItem.SUCESSO : StatusItem.FALHA,
          mensagem: resultado.sucesso
            ? `Consultado pelo navegador: ${resultado.situacao}.`
            : resultado.erro,
          dados: { origem: "PLAYWRIGHT", duracaoMs: resultado.duracaoMs },
        },
      });

      // A prova: a página que o robô leu, anexada à execução.
      if (resultado.telaCapturada) {
        await prisma.artefato.create({
          data: {
            execucaoId: execucao.id,
            tipo: TipoArtefato.ARQUIVO,
            nome: `${referencia} — tela do portal`,
            mimeType: "image/png",
            conteudo: { base64: resultado.telaCapturada },
          },
        });
      }

      if (resultado.sucesso) {
        sucessos += 1;
        console.log(resultado.situacao);
      } else {
        falhas += 1;
        console.log(`falhou (${resultado.erro})`);
      }
    }
  }

  const duracaoMs = Date.now() - inicio;

  await prisma.execucao.update({
    where: { id: execucao.id },
    data: {
      status: falhas === 0 ? "SUCESSO" : sucessos === 0 ? "FALHA" : "SUCESSO_PARCIAL",
      finalizadaEm: new Date(),
      duracaoMs,
      resumo: `${sucessos + falhas} consultas pelo navegador · ${sucessos} respondidas · ${falhas} sem resposta · telas anexadas`,
    },
  });

  console.log(
    `\n[rpa] execução ${execucao.id} concluída em ${Math.round(duracaoMs / 1000)}s`,
  );
  console.log(`[rpa] abra /execucoes/${execucao.id} para ver as telas capturadas`);
}

main()
  .catch((erro) => {
    console.error("[rpa] falhou:", erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
