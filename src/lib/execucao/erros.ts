/**
 * Erro que o operador pode ler.
 *
 * O enunciado é direto: execução que falhou mostra o erro de forma legível,
 * não um stack trace cru. Toda falha esperada de um módulo — portal fora do
 * ar, arquivo em formato inesperado, sessão expirada — é lançada como
 * ErroDeNegocio, com uma mensagem escrita para quem opera e, quando ajuda,
 * uma sugestão do que fazer.
 *
 * Qualquer outra exceção é tratada como falha inesperada: o operador vê uma
 * mensagem genérica e o detalhe técnico fica guardado na execução.
 */
export class ErroDeNegocio extends Error {
  readonly sugestao?: string;

  constructor(mensagem: string, opcoes?: { sugestao?: string; causa?: unknown }) {
    super(mensagem, { cause: opcoes?.causa });
    this.name = "ErroDeNegocio";
    this.sugestao = opcoes?.sugestao;
  }
}

export const MENSAGEM_FALHA_INESPERADA =
  "A automação parou por um erro inesperado. O detalhe técnico foi registrado para análise.";

/** Mensagem que vai para a tela. */
export function mensagemLegivel(erro: unknown): string {
  if (erro instanceof ErroDeNegocio) {
    return erro.sugestao ? `${erro.message} ${erro.sugestao}` : erro.message;
  }
  return MENSAGEM_FALHA_INESPERADA;
}

/** Detalhe que fica no banco, nunca na tela como causa. */
export function detalheTecnico(erro: unknown): string {
  if (erro instanceof Error) {
    return erro.stack ?? `${erro.name}: ${erro.message}`;
  }
  return String(erro);
}
