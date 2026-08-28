import { ConfiancaLancamento, OrigemLeitura } from "@/generated/prisma/enums";
import type { ExtratoLido, LancamentoLido } from "@/modules/sc-01/parsers";

/**
 * A validação do que foi lido — o mesmo código para o que veio de parser e para
 * o que veio de IA.
 *
 * O modelo extrai; **quem aprova é aqui**. Um extrato lido errado e importado
 * em silêncio é pior do que um extrato não lido: o erro entra na contabilidade
 * e só aparece na conciliação, quando corrigir custa mais.
 */

/** Centavos, para não somar dinheiro em ponto flutuante. */
function centavos(valor: number): number {
  return Math.round(valor * 100);
}

export type LancamentoAvaliado = LancamentoLido & {
  ordem: number;
  confianca: ConfiancaLancamento;
  motivoConferencia?: string;
};

export type Conferencia = {
  lancamentos: LancamentoAvaliado[];
  /** `saldoInicial + Σ lançamentos − saldoFinal`, em reais. */
  diferencaSaldo: number | null;
  /** O saldo fecha? Só então o OFX é gerado. */
  saldoConfere: boolean;
  /** Impedimentos de gerar o OFX, em português. */
  impedimentos: string[];
  /** Observações que não impedem, mas mandam itens para conferência. */
  ressalvas: string[];
};

/**
 * Avalia o extrato lido e decide, lançamento a lançamento, o que pode entrar
 * direto no OFX e o que precisa de olho humano antes.
 */
export function conferir(
  extrato: ExtratoLido,
  origem: OrigemLeitura,
): Conferencia {
  const impedimentos: string[] = [];
  const ressalvas: string[] = [];

  const lancamentos = extrato.lancamentos.map((lancamento, indice) =>
    avaliar(lancamento, indice, extrato, origem, ressalvas),
  );

  const { diferencaSaldo, saldoConfere } = verificarSaldo(extrato);

  if (diferencaSaldo === null) {
    // Sem saldo declarado não há como afirmar que a leitura está completa —
    // um lançamento perdido no meio passaria despercebido.
    ressalvas.push(
      "O extrato não declara saldo inicial e final, então não foi possível conferir se algum lançamento ficou de fora.",
    );
  } else if (!saldoConfere) {
    impedimentos.push(
      `A soma dos lançamentos não fecha com o saldo do extrato: diferença de ${formatarReais(diferencaSaldo)}. O OFX não foi gerado.`,
    );
  }

  if (lancamentos.length === 0) {
    impedimentos.push("Nenhum lançamento foi encontrado no arquivo.");
  }

  return {
    lancamentos,
    diferencaSaldo,
    saldoConfere,
    impedimentos,
    ressalvas,
  };
}

function avaliar(
  lancamento: LancamentoLido,
  indice: number,
  extrato: ExtratoLido,
  origem: OrigemLeitura,
  ressalvas: string[],
): LancamentoAvaliado {
  const motivos: string[] = [];

  if (!lancamento.historico || lancamento.historico.trim().length < 3) {
    motivos.push("histórico ausente ou curto demais para identificar a operação");
  }

  if (centavos(lancamento.valor) === 0) {
    motivos.push("valor zerado");
  }

  if (Number.isNaN(lancamento.data.getTime())) {
    motivos.push("data inválida");
  } else if (foraDaCompetencia(lancamento.data, extrato)) {
    motivos.push("data fora da competência do extrato");
  }

  if (lancamento.ressalva) motivos.push(lancamento.ressalva);

  // A origem decide o piso de confiança: parser reconheceu um layout conhecido;
  // IA interpretou, e interpretação sempre passa por conferência.
  const confianca =
    motivos.length > 0
      ? ConfiancaLancamento.BAIXA
      : origem === OrigemLeitura.PARSER
        ? ConfiancaLancamento.ALTA
        : ConfiancaLancamento.MEDIA;

  if (confianca !== ConfiancaLancamento.ALTA && motivos.length > 0) {
    ressalvas.push(`Linha ${indice + 1}: ${motivos.join("; ")}.`);
  }

  return {
    ...lancamento,
    ordem: indice + 1,
    confianca,
    motivoConferencia:
      motivos.length > 0
        ? capitalizar(motivos.join("; "))
        : origem === OrigemLeitura.IA
          ? "Lido por interpretação de imagem ou layout desconhecido — confira antes de importar."
          : undefined,
  };
}

function verificarSaldo(extrato: ExtratoLido): {
  diferencaSaldo: number | null;
  saldoConfere: boolean;
} {
  if (extrato.saldoInicial === undefined || extrato.saldoFinal === undefined) {
    return { diferencaSaldo: null, saldoConfere: false };
  }

  const soma = extrato.lancamentos.reduce(
    (total, lancamento) => total + centavos(lancamento.valor),
    centavos(extrato.saldoInicial),
  );

  const diferenca = soma - centavos(extrato.saldoFinal);

  return { diferencaSaldo: diferenca / 100, saldoConfere: diferenca === 0 };
}

function foraDaCompetencia(data: Date, extrato: ExtratoLido): boolean {
  const { competenciaInicio, competenciaFim } = extrato;
  if (!competenciaInicio || !competenciaFim) return false;

  // Uma folga de um dia em cada ponta: extrato costuma trazer o saldo do dia
  // anterior como primeira linha, e isso não é erro.
  const umDia = 24 * 60 * 60 * 1000;
  return (
    data.getTime() < competenciaInicio.getTime() - umDia ||
    data.getTime() > competenciaFim.getTime() + umDia
  );
}

export function formatarReais(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Só o que tem confiança alta, ou o que alguém conferiu, compõe o OFX. */
export function podeEntrarNoOfx(lancamento: {
  confianca: ConfiancaLancamento;
  conferido: boolean;
}): boolean {
  return lancamento.confianca === ConfiancaLancamento.ALTA || lancamento.conferido;
}
