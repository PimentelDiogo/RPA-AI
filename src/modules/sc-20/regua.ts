import { FaixaVencimento } from "@/generated/prisma/enums";

/**
 * A régua de avisos do SC-20.
 *
 * Tudo aqui é função pura: nenhuma ida ao banco, nenhum relógio implícito. É a
 * parte que o enunciado chama de miolo — a que não pode ser falsa — e por isso
 * é a que tem teste.
 *
 * A regra que o processo pede: *"aviso repetido vira ruído e para de ser lido.
 * Registre o que já foi comunicado e a quem, e mostre o que mudou desde o
 * último aviso em vez de repetir a lista inteira."*
 */

export const JANELA_PADRAO_DIAS = 60;

const FUSO = "America/Sao_Paulo";

/**
 * Vencimento é data, não instante. Comparar `Date` cru erra por um dia sempre
 * que o fuso do servidor não é o da operação — e um dia importa quando se está
 * contando quanto falta para um certificado vencer.
 */
function apenasData(momento: Date, fuso = FUSO): number {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: fuso,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(momento);

  const valor = (tipo: string) =>
    Number(partes.find((parte) => parte.type === tipo)?.value);

  return Date.UTC(valor("year"), valor("month") - 1, valor("day"));
}

const UM_DIA = 24 * 60 * 60 * 1000;

/**
 * Dias restantes até o vencimento. Negativo quando já venceu.
 *
 * A validade vem do banco como data pura (meia-noite UTC) e não deve ser
 * reinterpretada no fuso local — por isso ela é lida em UTC e o "hoje" é lido
 * em São Paulo.
 */
export function diasRestantes(validade: Date, agora: Date): number {
  const vence = apenasData(validade, "UTC");
  const hoje = apenasData(agora);
  return Math.round((vence - hoje) / UM_DIA);
}

/**
 * Em que faixa o certificado está. `null` significa fora da janela de alerta:
 * não entra no painel nem gera aviso.
 */
export function classificar(
  dias: number,
  janelaDias: number = JANELA_PADRAO_DIAS,
): FaixaVencimento | null {
  if (dias < 0) return FaixaVencimento.VENCIDO;
  if (dias <= 15) return FaixaVencimento.ATE_15;
  if (dias <= 30) return FaixaVencimento.ATE_30;
  if (dias <= janelaDias) return FaixaVencimento.ATE_60;
  return null;
}

export type Decisao =
  | { acao: "avisar"; motivo: string }
  | { acao: "suprimir"; motivo: string };

/**
 * O coração da régua: avisar ou calar.
 *
 * O gatilho é **mudança de faixa**, não passagem de tempo. Um certificado que
 * ontem estava a 45 dias e hoje está a 44 não gera nada; quando cruzar para
 * ≤30, gera. Assim o aviso diz sempre algo novo, e continua sendo lido.
 *
 * `faixaDoUltimoAviso` é a faixa do último aviso **efetivamente comunicado** —
 * supressões não contam, porque ninguém as recebeu.
 */
export function decidir(
  faixaAtual: FaixaVencimento,
  faixaDoUltimoAviso: FaixaVencimento | null,
): Decisao {
  if (faixaDoUltimoAviso === null) {
    return { acao: "avisar", motivo: "primeiro aviso deste certificado" };
  }

  if (faixaDoUltimoAviso !== faixaAtual) {
    return {
      acao: "avisar",
      motivo: `mudou de ${ROTULO_FAIXA[faixaDoUltimoAviso]} para ${ROTULO_FAIXA[faixaAtual]}`,
    };
  }

  return {
    acao: "suprimir",
    motivo: `nada mudou desde o último aviso (${ROTULO_FAIXA[faixaAtual]})`,
  };
}

export const ROTULO_FAIXA: Record<FaixaVencimento, string> = {
  VENCIDO: "vencido",
  ATE_15: "vence em até 15 dias",
  ATE_30: "vence em até 30 dias",
  ATE_60: "vence em até 60 dias",
};

/** Ordem de urgência, para o painel listar o que dói primeiro. */
export const ORDEM_FAIXA: FaixaVencimento[] = [
  FaixaVencimento.VENCIDO,
  FaixaVencimento.ATE_15,
  FaixaVencimento.ATE_30,
  FaixaVencimento.ATE_60,
];

/** Texto do aviso. Fica aqui, junto da regra, porque é conteúdo, não layout. */
export function redigirAviso(dados: {
  cliente: string;
  titular: string;
  tipo: string;
  emissor: string;
  validade: Date;
  dias: number;
  destinatario: string;
}): string {
  const validade = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "UTC",
    dateStyle: "short",
  }).format(dados.validade);

  const prazo =
    dados.dias < 0
      ? `venceu há ${Math.abs(dados.dias)} dia(s), em ${validade}`
      : dados.dias === 0
        ? `vence hoje, ${validade}`
        : `vence em ${dados.dias} dia(s), em ${validade}`;

  return [
    `Olá, ${dados.destinatario}.`,
    "",
    `O certificado digital de ${dados.cliente} ${prazo}.`,
    `Titular: ${dados.titular} · Tipo: ${dados.tipo} · Emissor: ${dados.emissor}`,
    "",
    "A renovação depende do cliente agir, então convém acioná-lo com antecedência.",
    "Certificado vencido trava transmissão de obrigação, acesso a portal de órgão e emissão de nota.",
  ].join("\n");
}
