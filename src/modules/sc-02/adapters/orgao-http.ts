import {
  OrigemConsulta,
  SituacaoApurada,
  type OrgaoConsultado,
} from "@/generated/prisma/enums";
import type {
  ConsultaOrgao,
  ResultadoConsulta,
} from "@/modules/sc-02/ports/consulta-orgao";
import { baseDosOrgaos, SLUG_ORGAO } from "@/modules/sc-02/orgaos";

/**
 * Adapter HTTP: submete o formulário do portal e lê o resultado da página.
 *
 * É o que roda na URL pública, porque hospedagem serverless não tem navegador.
 * Faz o mesmo que uma pessoa faria — manda o CNPJ, espera, lê a resposta — e
 * sofre os mesmos problemas: demora, 503, sessão expirada, formato que mudou.
 *
 * Num adapter real, é aqui que entraria a credencial e o certificado digital.
 */
const TIMEOUT_MS = 2_500;

export class OrgaoHttp implements ConsultaOrgao {
  readonly origem = OrigemConsulta.HTTP;

  constructor(private readonly base: string = baseDosOrgaos()) {}

  async consultar(
    cnpj: string,
    orgao: OrgaoConsultado,
  ): Promise<ResultadoConsulta> {
    const inicio = Date.now();
    const url = `${this.base}/${SLUG_ORGAO[orgao]}`;

    try {
      const resposta = await fetch(url, {
        method: "POST",
        body: new URLSearchParams({ cnpj }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
        cache: "no-store",
      });

      const corpo = await resposta.text();
      const duracaoMs = Date.now() - inicio;

      if (resposta.status === 503) {
        return {
          sucesso: false,
          erro: "O portal do órgão está fora do ar.",
          respostaBruta: corpo,
          origem: this.origem,
          duracaoMs,
        };
      }

      if (!resposta.ok) {
        return {
          sucesso: false,
          erro: `O portal do órgão respondeu com erro ${resposta.status}.`,
          respostaBruta: corpo,
          origem: this.origem,
          duracaoMs,
        };
      }

      return interpretar(corpo, this.origem, duracaoMs);
    } catch (erro) {
      const duracaoMs = Date.now() - inicio;
      const expirou =
        erro instanceof Error &&
        (erro.name === "TimeoutError" || erro.name === "AbortError");

      return {
        sucesso: false,
        erro: expirou
          ? "O portal do órgão não respondeu no tempo esperado."
          : "Não foi possível alcançar o portal do órgão.",
        origem: this.origem,
        duracaoMs,
      };
    }
  }
}

/**
 * Leitura da página. Separada do transporte de propósito: é o pedaço que muda
 * quando o portal muda de layout, e é o pedaço que tem teste.
 */
export function interpretar(
  corpo: string,
  origem: OrigemConsulta,
  duracaoMs: number,
): ResultadoConsulta {
  if (/data-erro="SESSAO_EXPIRADA"/.test(corpo)) {
    return {
      sucesso: false,
      erro: "A sessão no portal expirou durante a consulta.",
      respostaBruta: corpo,
      origem,
      duracaoMs,
    };
  }

  const situacao = corpo.match(/data-situacao="(REGULAR|IRREGULAR|INDISPONIVEL)"/);

  if (!situacao) {
    // O portal respondeu, mas não do jeito que conhecemos. Guardar a resposta
    // bruta é o que permite alguém entender depois o que mudou.
    return {
      sucesso: false,
      erro: "O portal respondeu num formato que não reconhecemos.",
      respostaBruta: corpo.slice(0, 2_000),
      origem,
      duracaoMs,
    };
  }

  const detalhe = corpo.match(/data-detalhe>([^<]*)</);

  return {
    sucesso: true,
    situacao: situacao[1] as SituacaoApurada,
    detalhe: detalhe?.[1]?.trim(),
    respostaBruta: corpo.slice(0, 2_000),
    origem,
    duracaoMs,
  };
}
