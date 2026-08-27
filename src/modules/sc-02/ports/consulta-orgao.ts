import type {
  OrgaoConsultado,
  OrigemConsulta,
  SituacaoApurada,
} from "@/generated/prisma/enums";

/**
 * Fronteira com os portais dos órgãos.
 *
 * **Aqui entra a credencial e o certificado digital.** Hoje há duas
 * implementações, e as duas conversam com o portal simulado do próprio
 * projeto:
 *
 *   - `orgao-http`       cliente HTTP que raspa a página. É o que roda na nuvem.
 *   - `orgao-playwright` navegador de verdade preenchendo o formulário. Roda
 *                        local e no CI, e é a peça que mostra o RPA acontecendo.
 *
 * Um adapter real trocaria a URL do portal simulado pela do órgão e receberia a
 * credencial por variável de ambiente. O resto do módulo não mudaria: a fila, o
 * retry, o registro de tentativa e o painel não sabem quem responde.
 */

export type ResultadoConsulta =
  | {
      sucesso: true;
      situacao: SituacaoApurada;
      detalhe?: string;
      respostaBruta: string;
      origem: OrigemConsulta;
      duracaoMs: number;
    }
  | {
      sucesso: false;
      /** Mensagem escrita para o operador, sem jargão e sem stack trace. */
      erro: string;
      respostaBruta?: string;
      origem: OrigemConsulta;
      duracaoMs: number;
    };

export interface ConsultaOrgao {
  readonly origem: OrigemConsulta;
  consultar(cnpj: string, orgao: OrgaoConsultado): Promise<ResultadoConsulta>;
}
