import type { ExtratoLido } from "@/modules/sc-01/parsers";

/**
 * Fronteira da leitura assistida.
 *
 * É o caminho de exceção do SC-01: existe para o extrato que **nenhum parser
 * reconhece** e para o arquivo que não tem texto — foto, digitalização. O
 * caminho normal continua sendo determinístico.
 *
 * Ser um port tem uma razão prática além da arquitetura: o portal precisa
 * funcionar sem chave de IA. Sem ela não há adapter, e o módulo recusa o
 * arquivo com mensagem legível em vez de quebrar.
 */
export interface LeitorAssistido {
  /** Como a leitura foi feita, para o histórico e para a tela. */
  readonly descricao: string;

  ler(arquivo: {
    conteudo: Uint8Array;
    mimeType: string;
    /** Texto já extraído, quando existe. Ajuda o modelo e reduz o custo. */
    texto?: string;
  }): Promise<ExtratoLido>;
}

/** Falha da leitura assistida, com mensagem que o operador entende. */
export class LeituraAssistidaIndisponivel extends Error {
  constructor(mensagem: string, opcoes?: { causa?: unknown }) {
    super(mensagem, { cause: opcoes?.causa });
    this.name = "LeituraAssistidaIndisponivel";
  }
}
