import type {
  OrgaoConsultado,
  OrigemConsulta,
  SituacaoApurada,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { ORGAOS_ATIVOS } from "@/modules/sc-02/orgaos";

/**
 * Leituras do painel do SC-02.
 *
 * A regra que o enunciado cobra está aqui: o painel responde de relance quem
 * está irregular, em qual órgão e **há quanto tempo** — e nunca confunde
 * irregularidade com ausência de leitura.
 */

export type Celula =
  | {
      estado: "lido";
      situacao: SituacaoApurada;
      detalhe: string | null;
      apuradaEm: Date;
      diasDeIdade: number;
      origem: OrigemConsulta;
    }
  | { estado: "nunca-consultado" };

export type LinhaCliente = {
  clienteId: string;
  nome: string;
  cnpj: string;
  celulas: Record<OrgaoConsultado, Celula>;
};

export type Irregularidade = {
  clienteId: string;
  nome: string;
  orgao: OrgaoConsultado;
  detalhe: string | null;
  desde: Date;
  diasDeIdade: number;
};

export type FalhaAberta = {
  clienteId: string;
  nome: string;
  orgao: OrgaoConsultado;
  erro: string;
  quando: Date;
  tentativas: number;
  /** O que ainda se sabe, apesar da falha. */
  ultimaSituacaoConhecida: SituacaoApurada | null;
  ultimaLeituraEm: Date | null;
};

export type PainelFiscal = {
  linhas: LinhaCliente[];
  irregulares: Irregularidade[];
  falhas: FalhaAberta[];
  contagem: {
    regular: number;
    irregular: number;
    indisponivel: number;
    nuncaConsultado: number;
  };
  /** Leitura mais antiga do painel: mede quão vencida a informação está. */
  leituraMaisAntiga: Date | null;
};

const UM_DIA = 24 * 60 * 60 * 1000;

function idadeEmDias(momento: Date, agora: Date): number {
  return Math.floor((agora.getTime() - momento.getTime()) / UM_DIA);
}

export async function carregarPainelFiscal(
  agora = new Date(),
): Promise<PainelFiscal> {
  const [clientes, situacoes] = await Promise.all([
    prisma.cliente.findMany({
      where: { ativo: true },
      select: { id: true, cnpj: true, razaoSocial: true, nomeFantasia: true },
      orderBy: { razaoSocial: "asc" },
    }),
    prisma.situacaoFiscal.findMany(),
  ]);

  const porCliente = new Map<string, Map<OrgaoConsultado, (typeof situacoes)[number]>>();
  for (const situacao of situacoes) {
    const mapa = porCliente.get(situacao.clienteId) ?? new Map();
    mapa.set(situacao.orgao, situacao);
    porCliente.set(situacao.clienteId, mapa);
  }

  const contagem = {
    regular: 0,
    irregular: 0,
    indisponivel: 0,
    nuncaConsultado: 0,
  };
  const irregulares: Irregularidade[] = [];
  let leituraMaisAntiga: Date | null = null;

  const linhas: LinhaCliente[] = clientes.map((cliente) => {
    const nome = cliente.nomeFantasia ?? cliente.razaoSocial;
    const mapa = porCliente.get(cliente.id);

    const celulas = Object.fromEntries(
      ORGAOS_ATIVOS.map((orgao) => {
        const situacao = mapa?.get(orgao);

        if (!situacao) {
          contagem.nuncaConsultado += 1;
          return [orgao, { estado: "nunca-consultado" } satisfies Celula];
        }

        if (!leituraMaisAntiga || situacao.apuradaEm < leituraMaisAntiga) {
          leituraMaisAntiga = situacao.apuradaEm;
        }

        const diasDeIdade = idadeEmDias(situacao.apuradaEm, agora);

        if (situacao.situacao === "REGULAR") contagem.regular += 1;
        else if (situacao.situacao === "IRREGULAR") {
          contagem.irregular += 1;
          irregulares.push({
            clienteId: cliente.id,
            nome,
            orgao,
            detalhe: situacao.detalhe,
            desde: situacao.apuradaEm,
            diasDeIdade,
          });
        } else contagem.indisponivel += 1;

        return [
          orgao,
          {
            estado: "lido",
            situacao: situacao.situacao,
            detalhe: situacao.detalhe,
            apuradaEm: situacao.apuradaEm,
            diasDeIdade,
            origem: situacao.origem,
          } satisfies Celula,
        ];
      }),
    ) as Record<OrgaoConsultado, Celula>;

    return { clienteId: cliente.id, nome, cnpj: cliente.cnpj, celulas };
  });

  // Quem está irregular há mais tempo aparece primeiro: é onde dói.
  irregulares.sort((a, b) => b.diasDeIdade - a.diasDeIdade);

  return {
    linhas,
    irregulares,
    falhas: await carregarFalhasAbertas(clientes),
    contagem,
    leituraMaisAntiga,
  };
}

/**
 * A faixa que não pode sumir.
 *
 * Mostra os pares cuja **última** tentativa falhou — independentemente de haver
 * ou não leitura antiga. É a diferença entre "o cliente está irregular" e "o
 * robô não conseguiu perguntar".
 */
async function carregarFalhasAbertas(
  clientes: { id: string; razaoSocial: string; nomeFantasia: string | null }[],
): Promise<FalhaAberta[]> {
  const nomes = new Map(
    clientes.map((c) => [c.id, c.nomeFantasia ?? c.razaoSocial]),
  );

  // Última tentativa de cada par cliente × órgão.
  const ultimas = await prisma.$queryRaw<
    {
      clienteId: string;
      orgao: OrgaoConsultado;
      sucesso: boolean;
      erro: string | null;
      iniciadaEm: Date;
      tentativa: number;
    }[]
  >`
    select distinct on ("clienteId", orgao)
      "clienteId", orgao, sucesso, erro, "iniciadaEm", tentativa
    from consulta_tentativa
    order by "clienteId", orgao, "iniciadaEm" desc
  `;

  const abertas = ultimas.filter((t) => !t.sucesso);
  if (abertas.length === 0) return [];

  const situacoes = await prisma.situacaoFiscal.findMany({
    where: { clienteId: { in: abertas.map((t) => t.clienteId) } },
  });

  const conhecida = new Map(
    situacoes.map((s) => [`${s.clienteId}:${s.orgao}`, s]),
  );

  return abertas
    .map((tentativa) => {
      const anterior = conhecida.get(
        `${tentativa.clienteId}:${tentativa.orgao}`,
      );

      return {
        clienteId: tentativa.clienteId,
        nome: nomes.get(tentativa.clienteId) ?? "—",
        orgao: tentativa.orgao,
        erro: tentativa.erro ?? "Falha sem mensagem registrada.",
        quando: tentativa.iniciadaEm,
        tentativas: tentativa.tentativa,
        ultimaSituacaoConhecida: anterior?.situacao ?? null,
        ultimaLeituraEm: anterior?.apuradaEm ?? null,
      };
    })
    .sort((a, b) => b.quando.getTime() - a.quando.getTime());
}

export type TentativaHistorico = {
  id: string;
  cliente: string;
  orgao: OrgaoConsultado;
  tentativa: number;
  sucesso: boolean;
  situacao: SituacaoApurada | null;
  erro: string | null;
  origem: OrigemConsulta;
  duracaoMs: number;
  iniciadaEm: Date;
};

export async function carregarTentativas(
  limite = 60,
): Promise<TentativaHistorico[]> {
  const tentativas = await prisma.consultaTentativa.findMany({
    orderBy: { iniciadaEm: "desc" },
    take: limite,
    include: {
      cliente: { select: { razaoSocial: true, nomeFantasia: true } },
    },
  });

  return tentativas.map((t) => ({
    id: t.id,
    cliente: t.cliente.nomeFantasia ?? t.cliente.razaoSocial,
    orgao: t.orgao,
    tentativa: t.tentativa,
    sucesso: t.sucesso,
    situacao: t.situacao,
    erro: t.erro,
    origem: t.origem,
    duracaoMs: t.duracaoMs,
    iniciadaEm: t.iniciadaEm,
  }));
}
