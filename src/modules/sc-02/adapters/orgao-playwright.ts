import {
  OrigemConsulta,
  type OrgaoConsultado,
} from "@/generated/prisma/enums";
import { interpretar } from "@/modules/sc-02/adapters/orgao-http";
import { baseDosOrgaos, SLUG_ORGAO } from "@/modules/sc-02/orgaos";
import type {
  ConsultaOrgao,
  ResultadoConsulta,
} from "@/modules/sc-02/ports/consulta-orgao";

/**
 * Adapter de navegador: um robô que **usa o portal** como uma pessoa usaria.
 *
 * Abre a página do órgão, digita o CNPJ no campo, clica em consultar, espera a
 * página carregar e lê o resultado. É o RPA no sentido literal do enunciado —
 * "robô que opera sistema, portal ou planilha no lugar da pessoa".
 *
 * Não roda na hospedagem: função serverless não tem navegador. Roda na máquina
 * de quem desenvolve e no CI, contra o mesmo portal simulado que o adapter HTTP
 * consome — a mesma fronteira, o mesmo contrato, duas maneiras de atravessá-la.
 *
 * Num ambiente com acesso real, é este o adapter que faria o trabalho: portal
 * de órgão costuma exigir navegador, certificado digital e sessão. **A
 * credencial entraria aqui**, no `contextoDoNavegador`.
 *
 * Como prova do que aconteceu, captura a tela da página de resultado. A imagem
 * vira artefato da execução: deixa de ser "o robô diz que consultou" e passa a
 * ser a página que ele viu.
 */
export type OpcoesPlaywright = {
  /** `false` mostra o navegador na tela — é assim que se demonstra ao vivo. */
  headless?: boolean;
  /** Captura a página de resultado como PNG em base64. */
  capturarTela?: boolean;
  timeoutMs?: number;
};

export type ResultadoComProva = ResultadoConsulta & {
  /** PNG em base64 da página que o robô leu, quando a captura está ligada. */
  telaCapturada?: string;
};

export class OrgaoPlaywright implements ConsultaOrgao {
  readonly origem = OrigemConsulta.PLAYWRIGHT;

  constructor(
    private readonly opcoes: OpcoesPlaywright = {},
    private readonly base: string = baseDosOrgaos(),
  ) {}

  async consultar(
    cnpj: string,
    orgao: OrgaoConsultado,
  ): Promise<ResultadoComProva> {
    const inicio = Date.now();
    const timeout = this.opcoes.timeoutMs ?? 10_000;

    // Import dinâmico: o Playwright é dependência de desenvolvimento e não pode
    // ser exigido pelo bundle que vai para a hospedagem.
    const { chromium } = await import("playwright");

    const navegador = await chromium.launch({
      headless: this.opcoes.headless ?? true,
    });

    try {
      const contexto = await navegador.newContext();
      const pagina = await contexto.newPage();

      await pagina.goto(`${this.base}/${SLUG_ORGAO[orgao]}`, {
        timeout,
        waitUntil: "domcontentloaded",
      });

      // O robô faz o que a pessoa faria: preenche o campo e clica no botão.
      await pagina.fill("#cnpj", cnpj, { timeout });
      await Promise.all([
        pagina.waitForLoadState("domcontentloaded", { timeout }),
        pagina.click("button[type=submit]", { timeout }),
      ]);

      const html = await pagina.content();
      const duracaoMs = Date.now() - inicio;

      const telaCapturada = this.opcoes.capturarTela
        ? (await pagina.screenshot({ fullPage: true })).toString("base64")
        : undefined;

      // A leitura é a MESMA do adapter HTTP: o que muda é como se chegou até a
      // página, não como se entende o que ela diz.
      return { ...interpretar(html, this.origem, duracaoMs), telaCapturada };
    } catch (erro) {
      const duracaoMs = Date.now() - inicio;
      const expirou = erro instanceof Error && /Timeout/i.test(erro.message);

      return {
        sucesso: false,
        erro: expirou
          ? "O portal do órgão não respondeu no tempo esperado."
          : "Não foi possível operar o portal do órgão.",
        origem: this.origem,
        duracaoMs,
      };
    } finally {
      await navegador.close();
    }
  }
}
