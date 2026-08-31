/**
 * Deixa o portal no estado "antes da primeira execução".
 *
 * O seed entrega o portal **com dado dentro**, como o enunciado exige — o
 * painel de situação fiscal preenchido, os extratos já convertidos, os avisos
 * já comunicados. É o estado correto de entrega, e não muda.
 *
 * Só que, para gravar ou apresentar, esse estado é ruim: não sobra nada para
 * acontecer na tela. Este script recua um passo — mantém a massa, apaga o
 * **resultado** dela — para que executar cada automação produza mudança visível:
 *
 *   SC-20  certificados na janela, nenhum aviso comunicado  → a rodada avisa
 *   SC-02  nenhuma consulta feita, painel vazio             → a rodada preenche
 *   SC-01  os cinco extratos de volta à fila                → a rodada converte
 *   SC-05  todos os clientes livres, sem falha ligada       → o bloqueio acontece
 *
 * E limpa o histórico de execuções, para a primeira que aparecer ser a sua.
 *
 *   npx tsx scripts/preparar-demo.ts              # mostra o que faria
 *   npx tsx scripts/preparar-demo.ts --confirmar  # executa
 *
 * Contra produção, exporte o DATABASE_URL do Supabase antes.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";

const CONFIRMADO = process.argv.includes("--confirmar");
const url = process.env.DATABASE_URL;

if (!url) {
  console.error("DATABASE_URL não definida.");
  process.exit(1);
}

const schema = new URL(url).searchParams.get("schema") ?? "public";
const host = new URL(url).host;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: url }, { schema }),
});

async function estadoAtual() {
  const [
    execucoes,
    avisos,
    situacoes,
    tentativas,
    extratosProcessados,
    lancamentos,
    bloqueados,
    falhasLigadas,
    janela,
    certificados,
  ] = await Promise.all([
    prisma.execucao.count(),
    prisma.avisoCertificado.count(),
    prisma.situacaoFiscal.count(),
    prisma.consultaTentativa.count(),
    prisma.extratoImportado.count({ where: { status: { not: "RECEBIDO" } } }),
    prisma.lancamento.count(),
    prisma.bloqueioCliente.count({ where: { estado: { not: "LIVRE" } } }),
    prisma.falhaSimulada.count({ where: { falhar: true } }),
    prisma.configuracaoSc20.findFirst({ select: { janelaDias: true } }),
    prisma.certificado.count(),
  ]);

  return {
    execucoes,
    avisos,
    situacoes,
    tentativas,
    extratosProcessados,
    lancamentos,
    bloqueados,
    falhasLigadas,
    janelaDias: janela?.janelaDias ?? 60,
    certificados,
  };
}

function imprimir(rotulo: string, e: Awaited<ReturnType<typeof estadoAtual>>) {
  console.log(`\n${rotulo}`);
  console.log(`  execuções no histórico ........ ${e.execucoes}`);
  console.log(`  SC-20 · avisos registrados .... ${e.avisos}   (janela: ${e.janelaDias} dias, ${e.certificados} certificados)`);
  console.log(`  SC-02 · situações apuradas .... ${e.situacoes}   (tentativas: ${e.tentativas})`);
  console.log(`  SC-01 · extratos processados .. ${e.extratosProcessados}   (lançamentos: ${e.lancamentos})`);
  console.log(`  SC-05 · clientes não-livres ... ${e.bloqueados}   (falhas ligadas: ${e.falhasLigadas})`);
}

async function limpar() {
  // SC-20: apaga o que já foi comunicado, para a próxima rodada ter o que dizer.
  // Os certificados ficam — eles são a massa, não o resultado.
  await prisma.avisoCertificado.deleteMany();

  // A janela volta ao padrão do enunciado: 60 dias no painel.
  await prisma.configuracaoSc20.updateMany({ data: { janelaDias: 60 } });

  // SC-02: nenhuma consulta feita. O painel nasce "nunca consultado", e a
  // primeira rodada o preenche na frente de quem assiste.
  await prisma.consultaTentativa.deleteMany();
  await prisma.situacaoFiscal.deleteMany();

  // SC-01: os extratos voltam para a fila, sem lançamentos e sem OFX.
  await prisma.lancamento.deleteMany();
  await prisma.artefato.deleteMany();
  await prisma.extratoImportado.updateMany({
    data: {
      status: "RECEBIDO",
      erro: null,
      banco: null,
      agencia: null,
      conta: null,
      origemLeitura: null,
      parserUsado: null,
      saldoInicial: null,
      saldoFinal: null,
      diferencaSaldo: null,
      competenciaInicio: null,
      competenciaFim: null,
    },
  });

  // SC-05: todo mundo livre, os três sistemas no estado normal e nenhuma falha
  // ligada — o interruptor é você quem liga, na hora.
  await prisma.passoSaga.deleteMany();
  await prisma.sagaBloqueio.deleteMany();
  await prisma.bloqueioCliente.updateMany({
    data: { estado: "LIVRE", motivo: null, bloqueadoEm: null, desbloqueadoEm: null },
  });
  await prisma.registroFinanceiro.updateMany({
    data: { inadimplente: false, marcadoEm: null },
  });
  await prisma.acessoPortalCliente.updateMany({
    data: { ativo: true, revogadoEm: null },
  });
  await prisma.tarefaCliente.updateMany({ data: { responsavelOriginal: null } });
  await restaurarResponsaveis();
  await prisma.falhaSimulada.updateMany({ data: { falhar: false } });

  // O histórico começa limpo: a primeira execução que aparecer é a da demo.
  await prisma.execucaoItem.deleteMany();
  await prisma.execucao.deleteMany();

  // As janelas do agendador voltam a ser calculadas do zero.
  await prisma.agendamento.updateMany({
    data: { proximaExecucaoEm: null, ultimaExecucaoEm: null },
  });
}

/**
 * Devolve os responsáveis das tarefas.
 *
 * Se uma demonstração anterior deixou tarefas com o marcador de bloqueado, elas
 * precisam voltar a ter dono — senão o SC-05 já começaria parecendo bloqueado.
 */
async function restaurarResponsaveis() {
  const PADRAO = [
    "Beatriz Nakamura",
    "Rafael Queiroz",
    "Camila Diniz",
  ] as const;

  const tarefas = await prisma.tarefaCliente.findMany({
    select: { id: true, titulo: true, responsavel: true },
    orderBy: { titulo: "asc" },
  });

  for (const [indice, tarefa] of tarefas.entries()) {
    if (!tarefa.responsavel.includes("Bloqueado")) continue;

    await prisma.tarefaCliente.update({
      where: { id: tarefa.id },
      data: { responsavel: PADRAO[indice % PADRAO.length] },
    });
  }
}

async function main() {
  console.log(`banco: ${host} · schema: ${schema}`);

  const antes = await estadoAtual();
  imprimir("ANTES", antes);

  if (!CONFIRMADO) {
    console.log(
      "\nNada foi alterado. Para executar de verdade:\n" +
        "  npx tsx scripts/preparar-demo.ts --confirmar\n",
    );
    return;
  }

  console.log("\nlimpando…");
  await limpar();

  imprimir("DEPOIS", await estadoAtual());

  console.log(
    [
      "",
      "Pronto para gravar. A ordem que produz mais efeito na tela:",
      "  1. SC-02  Consultar agora   → o painel sai do zero e se preenche",
      "  2. SC-01  Processar fila    → os 5 extratos são convertidos",
      "  3. SC-20  Executar agora    → avisa; e a SEGUNDA rodada suprime tudo",
      "  4. SC-05  bloquear um cliente, com e sem falha ligada",
      "",
    ].join("\n"),
  );
}

main()
  .catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
