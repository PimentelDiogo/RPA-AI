/**
 * Contrato de um parser de extrato.
 *
 * A armadilha que o enunciado registra neste processo: *"cada banco imprime o
 * extrato de um jeito. Solução que só funciona com um layout resolve pouco.
 * Pense em como aceitar um formato novo sem reescrever tudo."*
 *
 * A resposta é este contrato. Aceitar um banco novo é **acrescentar um
 * arquivo** que o implementa e registrá-lo na lista — nenhum outro ponto do
 * módulo muda, e não existe `if (banco === ...)` espalhado.
 */

export type LancamentoLido = {
  /** Data do lançamento, como data pura. */
  data: Date;
  historico: string;
  /** Negativo é débito. O sinal é parte do dado. */
  valor: number;
  /**
   * Preenchido quando o parser leu a linha mas ficou em dúvida sobre algo —
   * histórico truncado, valor ambíguo. Vira motivo de conferência.
   */
  ressalva?: string;
};

export type ExtratoLido = {
  banco: string;
  agencia?: string;
  conta?: string;
  /** Saldos declarados no extrato. São eles que validam a leitura. */
  saldoInicial?: number;
  saldoFinal?: number;
  competenciaInicio?: Date;
  competenciaFim?: Date;
  lancamentos: LancamentoLido[];
};

export interface ParserDeExtrato {
  /** Nome do banco, como aparece na tela e no histórico. */
  readonly banco: string;

  /**
   * Reconhece o layout pelo texto do arquivo. Precisa ser específico: um
   * `detect` frouxo rouba extratos de outro banco e produz leitura errada, que
   * é pior do que não ler.
   */
  detect(texto: string): boolean;

  parse(texto: string): ExtratoLido;
}

/** Erro de leitura que o operador consegue entender. */
export class ExtratoIlegivel extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ExtratoIlegivel";
  }
}

// ---------------------------------------------------------------------------
// Utilidades compartilhadas pelos parsers
// ---------------------------------------------------------------------------

/** `1.234,56` → `1234.56` · `(1.234,56)` e `1.234,56-` → negativo. */
export function valorBrasileiro(bruto: string): number {
  const texto = bruto.trim();
  const negativo =
    texto.startsWith("-") ||
    texto.endsWith("-") ||
    (texto.startsWith("(") && texto.endsWith(")"));

  const numero = Number(
    texto
      .replace(/[()\s]/g, "")
      .replace(/^-|-$/g, "")
      .replace(/\./g, "")
      .replace(",", "."),
  );

  if (Number.isNaN(numero)) {
    throw new ExtratoIlegivel(`Valor não reconhecido no extrato: "${bruto}".`);
  }

  return negativo ? -numero : numero;
}

/** Data pura em UTC — vencimento e lançamento são data, não instante. */
export function dataPura(ano: number, mes: number, dia: number): Date {
  return new Date(Date.UTC(ano, mes - 1, dia));
}

/** `31/08/2026` ou `31/08` com o ano vindo de fora. */
export function dataBrasileira(bruto: string, anoPadrao?: number): Date {
  const partes = bruto.trim().match(/^(\d{2})\/(\d{2})(?:\/(\d{2,4}))?$/);

  if (!partes) {
    throw new ExtratoIlegivel(`Data não reconhecida no extrato: "${bruto}".`);
  }

  const [, dia, mes, anoBruto] = partes;
  const ano = anoBruto
    ? Number(anoBruto.length === 2 ? `20${anoBruto}` : anoBruto)
    : anoPadrao;

  if (!ano) {
    throw new ExtratoIlegivel(
      `A data "${bruto}" não traz o ano e o extrato não informa a competência.`,
    );
  }

  return dataPura(ano, Number(mes), Number(dia));
}

/** `2026-08-31` */
export function dataIso(bruto: string): Date {
  const partes = bruto.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);

  if (!partes) {
    throw new ExtratoIlegivel(`Data não reconhecida no extrato: "${bruto}".`);
  }

  return dataPura(Number(partes[1]), Number(partes[2]), Number(partes[3]));
}

export function linhasUteis(texto: string): string[] {
  return texto
    .split(/\r?\n/)
    .map((linha) => linha.trim())
    .filter((linha) => linha.length > 0);
}
