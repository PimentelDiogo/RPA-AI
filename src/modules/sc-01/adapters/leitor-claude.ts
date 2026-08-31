import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

import type { ExtratoLido, LancamentoLido } from "@/modules/sc-01/parsers";
import {
  LeituraAssistidaIndisponivel,
  type LeitorAssistido,
} from "@/modules/sc-01/ports/leitor-assistido";

/**
 * Leitura assistida do extrato, com Claude.
 *
 * **É a única IA de runtime do projeto**, e ela é deliberadamente estreita:
 * entra só quando nenhum parser reconhece o layout ou quando o arquivo não tem
 * texto. Não decide nada — extrai campos, e o que ela devolve passa pela
 * **mesma validação** que a saída dos parsers: soma × saldo, competência,
 * sinal, confiança por lançamento.
 *
 * Três decisões que valem explicação:
 *
 * 1. **Saída estruturada por schema** (`output_config.format`), não texto livre
 *    para depois interpretar. O modelo devolve o formato ou a chamada falha —
 *    não existe "quase certo" a ser adivinhado por regex.
 * 2. **`effort: "low"`.** Extrair campo de extrato é tarefa mecânica, não
 *    raciocínio. Esforço alto aqui só gastaria token de saída, que é o mais
 *    caro.
 * 3. **O texto extraído vai junto quando existe.** Para layout desconhecido com
 *    texto nativo, mandar o texto é mais barato e mais preciso do que mandar o
 *    modelo ler a imagem da página.
 */
const MODELO = "claude-opus-5";

/** Schema do que se espera de volta. É ele que define a resposta possível. */
const EsquemaExtrato = z.object({
  banco: z
    .string()
    .describe("Nome do banco ou instituição, como aparece no documento"),
  agencia: z.string().nullable().describe("Agência, se o documento informar"),
  conta: z.string().nullable().describe("Conta, se o documento informar"),
  saldoInicial: z
    .number()
    .nullable()
    .describe("Saldo anterior/inicial declarado no extrato, com sinal"),
  saldoFinal: z
    .number()
    .nullable()
    .describe("Saldo final declarado no extrato, com sinal"),
  lancamentos: z
    .array(
      z.object({
        data: z
          .string()
          .describe("Data do lançamento no formato AAAA-MM-DD"),
        historico: z
          .string()
          .describe("Descrição do lançamento, como está no documento"),
        valor: z
          .number()
          .describe(
            "Valor do lançamento. NEGATIVO para débito/saída, positivo para crédito/entrada",
          ),
      }),
    )
    .describe("Todos os lançamentos, na ordem em que aparecem no extrato"),
});

const INSTRUCAO = [
  "Você está lendo um extrato de conta bancária para conversão em OFX.",
  "",
  "Extraia todos os lançamentos, na ordem em que aparecem, e os saldos declarados.",
  "",
  "Regras:",
  "- O sinal do valor é parte do dado: débito, saída, pagamento e resgate são NEGATIVOS; crédito, entrada e recebimento são POSITIVOS.",
  "- Não invente lançamento, não agrupe e não arredonde. Se um valor estiver ilegível, use 0 — a validação posterior vai sinalizar.",
  "- Não inclua linhas de saldo entre os lançamentos: saldo vai nos campos próprios.",
  "- Se o documento não declarar saldo inicial ou final, devolva null nesse campo, em vez de calcular.",
  "- Datas com ano ausente devem usar o ano da competência do documento.",
].join("\n");

export class LeitorClaude implements LeitorAssistido {
  readonly descricao = `leitura assistida (${MODELO})`;

  private readonly cliente: Anthropic;

  constructor(apiKey = process.env.ANTHROPIC_API_KEY) {
    if (!apiKey) {
      throw new LeituraAssistidaIndisponivel(
        "A leitura assistida não está habilitada neste ambiente.",
      );
    }

    this.cliente = new Anthropic({ apiKey });
  }

  /** Existe chave configurada? A tela usa isto para não prometer o que não há. */
  static habilitada(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY);
  }

  async ler(arquivo: {
    conteudo: Uint8Array;
    mimeType: string;
    texto?: string;
  }): Promise<ExtratoLido> {
    const conteudoDaMensagem: Anthropic.ContentBlockParam[] = [];

    // Com texto nativo, manda o texto: mais barato e mais exato do que pedir ao
    // modelo para ler a imagem da página.
    if (arquivo.texto && arquivo.texto.trim().length > 0) {
      conteudoDaMensagem.push({
        type: "text",
        text: `Conteúdo textual extraído do arquivo:\n\n${arquivo.texto}`,
      });
    } else if (arquivo.mimeType === "application/pdf") {
      conteudoDaMensagem.push({
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: Buffer.from(arquivo.conteudo).toString("base64"),
        },
      });
    } else if (arquivo.mimeType.startsWith("image/")) {
      conteudoDaMensagem.push({
        type: "image",
        source: {
          type: "base64",
          media_type: arquivo.mimeType as "image/png" | "image/jpeg",
          data: Buffer.from(arquivo.conteudo).toString("base64"),
        },
      });
    } else {
      throw new LeituraAssistidaIndisponivel(
        `Não sei ler arquivo do tipo ${arquivo.mimeType}.`,
      );
    }

    conteudoDaMensagem.push({ type: "text", text: INSTRUCAO });

    let resposta;

    try {
      resposta = await this.cliente.messages.parse({
        model: MODELO,
        max_tokens: 16_000,
        output_config: {
          format: zodOutputFormat(EsquemaExtrato),
          // Extração de campo é mecânica: esforço alto só gastaria token.
          effort: "low",
        },
        messages: [{ role: "user", content: conteudoDaMensagem }],
      });
    } catch (causa) {
      throw new LeituraAssistidaIndisponivel(
        "A leitura assistida não conseguiu processar este arquivo agora.",
        { causa },
      );
    }

    const lido = resposta.parsed_output;

    if (!lido) {
      // O modelo respondeu fora do schema. Não há o que interpretar: falhar é
      // melhor do que adivinhar dado contábil.
      throw new LeituraAssistidaIndisponivel(
        "A leitura assistida devolveu um resultado que não pôde ser interpretado.",
      );
    }

    return converter(lido);
  }
}

/**
 * Converte a resposta para o mesmo formato que os parsers produzem.
 *
 * A partir daqui o módulo não sabe mais de onde veio a leitura — e é isso que
 * permite a validação ser a mesma.
 */
export function converter(
  lido: z.infer<typeof EsquemaExtrato>,
): ExtratoLido {
  const lancamentos: LancamentoLido[] = lido.lancamentos.map((lancamento) => ({
    data: dataDoIso(lancamento.data),
    historico: lancamento.historico.trim(),
    valor: lancamento.valor,
  }));

  const datas = lancamentos
    .map((lancamento) => lancamento.data.getTime())
    .filter((tempo) => !Number.isNaN(tempo));

  return {
    banco: lido.banco.trim() || "Banco não identificado",
    agencia: lido.agencia ?? undefined,
    conta: lido.conta ?? undefined,
    saldoInicial: lido.saldoInicial ?? undefined,
    saldoFinal: lido.saldoFinal ?? undefined,
    competenciaInicio: datas.length ? new Date(Math.min(...datas)) : undefined,
    competenciaFim: datas.length ? new Date(Math.max(...datas)) : undefined,
    lancamentos,
  };
}

/** `AAAA-MM-DD` como data pura, sem passar por fuso. */
function dataDoIso(valor: string): Date {
  const partes = valor.trim().match(/^(\d{4})-(\d{2})-(\d{2})/);

  if (!partes) return new Date(Number.NaN);

  return new Date(
    Date.UTC(Number(partes[1]), Number(partes[2]) - 1, Number(partes[3])),
  );
}
