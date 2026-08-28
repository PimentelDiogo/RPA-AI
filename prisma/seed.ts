/**
 * Seed do portal — massa de dados 100% sintética.
 *
 * O enunciado exige que o portal chegue com dado dentro, não vazio: nenhum
 * acesso real é concedido, então clientes, extratos, certificados e situações
 * fiscais são gerados aqui. Nomes são inventados e o CNPJ é fictício, válido
 * apenas em formato — inclusive nos dígitos verificadores, que são calculados.
 *
 * O seed é determinístico: rodar duas vezes produz a mesma base, porque tudo é
 * declarado ou derivado de um gerador com semente fixa. Isso vale tanto para a
 * demonstração quanto para os testes.
 */
import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "../src/generated/prisma/client";
import {
  Area,
  FaixaVencimento,
  OrgaoConsultado,
  OrigemConsulta,
  Perfil,
  SituacaoApurada,
  TipoCertificado,
} from "../src/generated/prisma/enums";
import { comportamentoDe } from "../src/app/api/fake/orgaos/comportamento";
import { SLUG_ORGAO } from "../src/modules/sc-02/orgaos";
import { gerarHashDeSenha } from "../src/lib/auth/senha";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL não definida. Copie .env.example para .env antes de rodar o seed.",
  );
}

const prisma = new PrismaClient({
  adapter: new PrismaPg(
    { connectionString },
    // O schema vem da própria URL: em produção o portal não vive no `public`.
    { schema: new URL(connectionString).searchParams.get("schema") ?? undefined },
  ),
});

/**
 * Senha única das contas de demonstração. Não é segredo: o enunciado pede que
 * as credenciais sejam entregues junto com a URL pública.
 */
const SENHA_DEMO = "sheep2026";

const USUARIOS = [
  {
    email: "admin@sheepcontabil.com.br",
    nome: "Marina Alencar",
    perfil: Perfil.ADMIN,
    areas: [] as Area[],
  },
  {
    email: "processos@sheepcontabil.com.br",
    nome: "Rafael Queiroz",
    perfil: Perfil.OPERADOR,
    areas: [Area.PROCESSOS],
  },
  {
    email: "contabil@sheepcontabil.com.br",
    nome: "Beatriz Nakamura",
    perfil: Perfil.OPERADOR,
    areas: [Area.CONTABIL],
  },
] as const;

/** Clientes fictícios. Municípios e UFs reais, empresas não. */
const CLIENTES = [
  ["Padaria Trigo de Ouro Ltda", "Trigo de Ouro", "Campinas", "SP"],
  ["Transportadora Rota Sul Ltda", "Rota Sul", "Curitiba", "PR"],
  ["Clínica Vida Plena S/S", "Vida Plena", "Belo Horizonte", "MG"],
  ["Metalúrgica Ferro Forte Ltda", "Ferro Forte", "Joinville", "SC"],
  ["Comercial Bom Preço Ltda", "Bom Preço", "Ribeirão Preto", "SP"],
  ["Agropecuária Campo Verde Ltda", "Campo Verde", "Rio Verde", "GO"],
  ["Construtora Alicerce Ltda", "Alicerce", "Fortaleza", "CE"],
  ["Consultoria Norte Digital ME", "Norte Digital", "Manaus", "AM"],
  ["Restaurante Sabor da Serra Ltda", "Sabor da Serra", "Gramado", "RS"],
  ["Auto Peças Giro Rápido Ltda", "Giro Rápido", "Goiânia", "GO"],
  ["Laboratório Analisa Ltda", "Analisa", "Recife", "PE"],
  ["Escola Semear Educação Ltda", "Semear", "Niterói", "RJ"],
] as const;

/**
 * Calcula os dois dígitos verificadores de um CNPJ. Os doze primeiros dígitos
 * são inventados; os dois últimos precisam fechar, senão o dado sintético não
 * passaria por nenhuma validação de formato — e passar é justamente o ponto.
 */
function completarCnpj(base12: string): string {
  const digito = (numeros: number[]): number => {
    const pesos =
      numeros.length === 12
        ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = numeros.reduce((total, n, i) => total + n * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };

  const numeros = base12.split("").map(Number);
  const primeiro = digito(numeros);
  const segundo = digito([...numeros, primeiro]);
  return `${base12}${primeiro}${segundo}`;
}

async function semearUsuarios() {
  const senhaHash = await gerarHashDeSenha(SENHA_DEMO);

  for (const usuario of USUARIOS) {
    await prisma.usuario.upsert({
      where: { email: usuario.email },
      create: { ...usuario, areas: [...usuario.areas], senhaHash },
      update: { ...usuario, areas: [...usuario.areas], senhaHash },
    });
  }

  console.log(`[seed] ${USUARIOS.length} usuários (senha: ${SENHA_DEMO})`);
}

async function semearClientes() {
  for (const [indice, [razaoSocial, nomeFantasia, municipio, uf]] of CLIENTES.entries()) {
    // Base fixa por índice: o mesmo cliente recebe sempre o mesmo CNPJ.
    const cnpj = completarCnpj(`${(41_000_000 + indice * 137_711).toString().padStart(8, "0")}0001`);

    await prisma.cliente.upsert({
      where: { cnpj },
      create: { cnpj, razaoSocial, nomeFantasia, municipio, uf },
      update: { razaoSocial, nomeFantasia, municipio, uf },
    });
  }

  console.log(`[seed] ${CLIENTES.length} clientes`);
}

/**
 * Agendamento de cada módulo. A frequência sai do SDD do módulo, não do
 * catálogo: o catálogo descreve a rotina manual de hoje ("mensal"), e o que se
 * automatiza costuma valer a pena rodar mais vezes.
 */
const AGENDAMENTOS = [
  { modulo: "SC-01", cron: "0 9 * * *" },
  { modulo: "SC-02", cron: "0 6 * * *" },
  { modulo: "SC-05", cron: "0 7 * * *" },
  { modulo: "SC-20", cron: "0 8 * * *" },
] as const;

async function semearAgendamentos() {
  for (const agendamento of AGENDAMENTOS) {
    await prisma.agendamento.upsert({
      where: { modulo: agendamento.modulo },
      create: agendamento,
      // Não sobrescreve proximaExecucaoEm: rodar o seed de novo não pode
      // reprogramar o que o agendador já calculou.
      update: { cron: agendamento.cron },
    });
  }

  console.log(`[seed] ${AGENDAMENTOS.length} agendamentos`);
}

/**
 * Certificados do SC-20.
 *
 * As datas são **relativas ao dia em que o seed roda**, nunca fixas: o painel
 * dos próximos 60 dias precisa fazer sentido em qualquer dia de demonstração.
 * A massa cobre todas as faixas de propósito, incluindo um caso sem contato
 * cadastrado — que produz uma falha legível e mostra como o portal se comporta
 * quando o dado está incompleto.
 */
const CERTIFICADOS = [
  // [razaoSocial do cliente, titular, tipo, emissor, dias até vencer]
  ["Padaria Trigo de Ouro Ltda", "Marcos Prado", "A1", "Certisign", -12],
  ["Transportadora Rota Sul Ltda", "Helena Bastos", "A3", "Serasa", -3],
  ["Clínica Vida Plena S/S", "Dr. Aurélio Nunes", "A1", "Valid", 4],
  ["Metalúrgica Ferro Forte Ltda", "Cláudia Reis", "A1", "Soluti", 11],
  ["Comercial Bom Preço Ltda", "Jonas Teixeira", "A3", "Certisign", 15],
  ["Agropecuária Campo Verde Ltda", "Sebastião Lopes", "A1", "Valid", 21],
  ["Construtora Alicerce Ltda", "Regina Sampaio", "A1", "Serasa", 27],
  ["Consultoria Norte Digital ME", "Igor Fontes", "A3", "Soluti", 30],
  ["Restaurante Sabor da Serra Ltda", "Marta Wagner", "A1", "Certisign", 38],
  ["Auto Peças Giro Rápido Ltda", "Válter Camargo", "A1", "Valid", 47],
  ["Laboratório Analisa Ltda", "Priscila Amorim", "A3", "Serasa", 52],
  ["Escola Semear Educação Ltda", "Fábio Estrela", "A1", "Soluti", 59],
  // Fora da janela: provam que o filtro funciona.
  ["Padaria Trigo de Ouro Ltda", "Marcos Prado", "A3", "Serasa", 120],
  ["Clínica Vida Plena S/S", "Dra. Sônia Vilela", "A1", "Certisign", 200],
  ["Metalúrgica Ferro Forte Ltda", "Cláudia Reis", "A3", "Valid", 300],
] as const;

/** Clientes que NÃO recebem contato: geram a falha legível de propósito. */
const SEM_CONTATO = new Set(["Escola Semear Educação Ltda"]);

const CONTATOS = [
  ["Rafael Queiroz", "rafael.queiroz@sheepcontabil.com.br"],
  ["Camila Diniz", "camila.diniz@sheepcontabil.com.br"],
] as const;

function emDias(dias: number): Date {
  const hoje = new Date();
  const data = new Date(
    Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate()),
  );
  data.setUTCDate(data.getUTCDate() + dias);
  return data;
}

async function semearCertificados() {
  // Recomeça a massa do módulo a cada seed: datas relativas precisam ser
  // recalculadas, senão o painel envelhece junto com o banco.
  await prisma.avisoCertificado.deleteMany();
  await prisma.certificado.deleteMany();
  await prisma.contatoAviso.deleteMany();

  const clientes = await prisma.cliente.findMany({
    select: { id: true, razaoSocial: true },
  });
  const porRazaoSocial = new Map(clientes.map((c) => [c.razaoSocial, c.id]));

  for (const [indice, cliente] of clientes.entries()) {
    if (SEM_CONTATO.has(cliente.razaoSocial)) continue;

    const [nome, email] = CONTATOS[indice % CONTATOS.length];
    await prisma.contatoAviso.create({
      data: { clienteId: cliente.id, nome, email },
    });
  }

  for (const [razaoSocial, titular, tipo, emissor, dias] of CERTIFICADOS) {
    const clienteId = porRazaoSocial.get(razaoSocial);
    if (!clienteId) continue;

    await prisma.certificado.create({
      data: {
        clienteId,
        titular,
        tipo: tipo as TipoCertificado,
        emissor,
        validade: emDias(dias),
      },
    });
  }

  // Um aviso antigo, numa faixa que já passou: a primeira execução após o seed
  // demonstra os três desfechos de uma vez — aviso novo, aviso por mudança de
  // faixa e supressão.
  const comAvisoAntigo = await prisma.certificado.findFirst({
    where: { cliente: { razaoSocial: "Agropecuária Campo Verde Ltda" } },
    include: { cliente: { select: { contatos: true } } },
  });

  if (comAvisoAntigo) {
    await prisma.avisoCertificado.create({
      data: {
        certificadoId: comAvisoAntigo.id,
        contatoId: comAvisoAntigo.cliente.contatos[0]?.id,
        faixa: FaixaVencimento.ATE_60,
        diasRestantes: 52,
        conteudo:
          "Aviso anterior sobre o certificado, quando ele ainda estava na faixa de 60 dias.",
        registradoEm: emDias(-31),
      },
    });
  }

  console.log(
    `[seed] ${CERTIFICADOS.length} certificados, ${clientes.length - SEM_CONTATO.size} contatos de aviso`,
  );
}

/**
 * Situação fiscal do SC-02.
 *
 * O enunciado exige que o portal chegue com dado dentro, não vazio — e um
 * painel de situação fiscal em branco não demonstra nada. A massa é derivada do
 * **mesmo** comportamento determinístico que o portal simulado usa, então o que
 * o seed grava e o que uma execução real apura coincidem: a demonstração não
 * "muda de assunto" quando alguém clica em Consultar agora.
 *
 * As leituras recebem idades diferentes de propósito: é a idade do dado que
 * mostra que a planilha de hoje "nasce vencida".
 */
async function semearSituacaoFiscal() {
  await prisma.consultaTentativa.deleteMany();
  await prisma.situacaoFiscal.deleteMany();

  const clientes = await prisma.cliente.findMany({
    select: { id: true, cnpj: true },
  });

  const orgaos = Object.values(OrgaoConsultado);
  let leituras = 0;
  let falhas = 0;

  for (const [indiceCliente, cliente] of clientes.entries()) {
    for (const [indiceOrgao, orgao] of orgaos.entries()) {
      const comportamento = comportamentoDe(cliente.cnpj, SLUG_ORGAO[orgao]);
      // Entre 0 e 11 dias atrás: dá ao painel a variação de idade que ele
      // precisa mostrar.
      const idadeDias = (indiceCliente * 3 + indiceOrgao) % 12;
      const quando = new Date(Date.now() - idadeDias * 24 * 60 * 60 * 1000);

      const situacao =
        comportamento.tipo === "regular"
          ? SituacaoApurada.REGULAR
          : comportamento.tipo === "irregular"
            ? SituacaoApurada.IRREGULAR
            : comportamento.tipo === "indisponivel"
              ? SituacaoApurada.INDISPONIVEL
              : null;

      if (situacao) {
        await prisma.situacaoFiscal.create({
          data: {
            clienteId: cliente.id,
            orgao,
            situacao,
            detalhe:
              comportamento.tipo === "irregular" ? comportamento.pendencia : null,
            apuradaEm: quando,
            origem: OrigemConsulta.HTTP,
          },
        });
        await prisma.consultaTentativa.create({
          data: {
            clienteId: cliente.id,
            orgao,
            tentativa: 1,
            sucesso: true,
            situacao,
            origem: OrigemConsulta.HTTP,
            duracaoMs: 120 + idadeDias * 7,
            iniciadaEm: quando,
          },
        });
        leituras += 1;
        continue;
      }

      // Os pares que o portal simulado derruba chegam com a tentativa falhada
      // registrada — a faixa "não conseguimos consultar" nasce preenchida, como
      // acontece na vida real.
      const erro =
        comportamento.tipo === "timeout"
          ? "O portal do órgão não respondeu no tempo esperado."
          : comportamento.tipo === "fora-do-ar"
            ? "O portal do órgão está fora do ar."
            : comportamento.tipo === "sessao-expirada"
              ? "A sessão no portal expirou durante a consulta."
              : "O portal respondeu num formato que não reconhecemos.";

      for (const tentativa of [1, 2, 3]) {
        await prisma.consultaTentativa.create({
          data: {
            clienteId: cliente.id,
            orgao,
            tentativa,
            sucesso: false,
            erro,
            origem: OrigemConsulta.HTTP,
            duracaoMs: 2500,
            iniciadaEm: new Date(quando.getTime() + tentativa * 1000),
          },
        });
      }
      falhas += 1;
    }
  }

  console.log(
    `[seed] ${leituras} situações fiscais lidas, ${falhas} pares sem resposta`,
  );
}

/**
 * Extratos do SC-01.
 *
 * Usa os PDFs versionados em tests/fixtures/sc-01 — os mesmos que os testes
 * exercitam e que a demonstração envia. O portal chega com extratos dentro:
 * dois convertidos, um com lançamento em conferência, um de layout que nenhum
 * parser conhece e um cuja soma não fecha. Os quatro desfechos possíveis, à
 * vista, sem ninguém precisar enviar nada primeiro.
 */
const EXTRATOS_DE_EXEMPLO = [
  "aurora-agosto-2026.pdf",
  "meridiano-agosto-2026.pdf",
  "pampa-agosto-2026.pdf",
  "horizonte-layout-desconhecido.pdf",
  "aurora-soma-nao-fecha.pdf",
] as const;

async function semearExtratos() {
  const { readFileSync, existsSync } = await import("node:fs");
  const { join } = await import("node:path");
  const { receberExtrato, processarExtrato } = await import(
    "../src/modules/sc-01/handler"
  );

  await prisma.lancamento.deleteMany();
  await prisma.extratoImportado.deleteMany();
  await prisma.arquivoArmazenado.deleteMany();

  const clientes = await prisma.cliente.findMany({
    select: { id: true },
    orderBy: { razaoSocial: "asc" },
    take: EXTRATOS_DE_EXEMPLO.length,
  });

  const pasta = join(process.cwd(), "tests", "fixtures", "sc-01");
  let importados = 0;

  for (const [indice, nome] of EXTRATOS_DE_EXEMPLO.entries()) {
    const caminho = join(pasta, nome);

    if (!existsSync(caminho)) {
      console.warn(
        `[seed] ${nome} não existe — rode "npx tsx scripts/gerar-extratos.ts".`,
      );
      continue;
    }

    const cliente = clientes[indice % clientes.length];

    const { extratoId } = await receberExtrato({
      clienteId: cliente.id,
      nome,
      mimeType: "application/pdf",
      conteudo: new Uint8Array(readFileSync(caminho)),
    });

    try {
      await processarExtrato(extratoId);
    } catch (erro) {
      // Dois dos arquivos falham de propósito: layout desconhecido e soma que
      // não fecha. A falha registrada é parte da massa, não um defeito do seed.
      await prisma.extratoImportado.update({
        where: { id: extratoId },
        data: {
          status: "FALHOU",
          erro: erro instanceof Error ? erro.message : "Falha ao processar.",
        },
      });
    }

    importados += 1;
  }

  console.log(`[seed] ${importados} extratos bancários importados`);
}

async function main() {
  await semearUsuarios();
  await semearClientes();
  await semearAgendamentos();
  await semearCertificados();
  await semearSituacaoFiscal();
  await semearExtratos();
}

main()
  .catch((error) => {
    console.error("[seed] falhou:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
