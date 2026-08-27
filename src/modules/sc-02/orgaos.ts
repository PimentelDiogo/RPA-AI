import { OrgaoConsultado } from "@/generated/prisma/enums";
import { ErroDeNegocio } from "@/lib/execucao/erros";

/**
 * Os órgãos consultados e como chegar a cada um.
 *
 * O enunciado cita "vários órgãos por cliente, o FGTS entre eles" e não lista o
 * resto — estes quatro são a suposição registrada.
 */

export const ORGAOS_ATIVOS: OrgaoConsultado[] = [
  OrgaoConsultado.RECEITA_FEDERAL,
  OrgaoConsultado.FGTS,
  OrgaoConsultado.PREVIDENCIA,
  OrgaoConsultado.FAZENDA_ESTADUAL,
];

export const ROTULO_ORGAO: Record<OrgaoConsultado, string> = {
  RECEITA_FEDERAL: "Receita Federal",
  FGTS: "FGTS",
  PREVIDENCIA: "Previdência",
  FAZENDA_ESTADUAL: "Fazenda Estadual",
};

/** Caminho do órgão no portal simulado — e, no adapter real, no portal de verdade. */
export const SLUG_ORGAO: Record<OrgaoConsultado, string> = {
  RECEITA_FEDERAL: "receita-federal",
  FGTS: "fgts",
  PREVIDENCIA: "previdencia",
  FAZENDA_ESTADUAL: "fazenda-estadual",
};

/**
 * Base dos portais. Aponta para o simulado deste projeto; num ambiente com
 * acesso real, cada órgão teria a sua própria URL e a sua própria credencial.
 */
export function baseDosOrgaos(): string {
  const configurada = process.env.ORGAOS_BASE_URL;

  if (configurada) {
    // Erro de configuração que já aconteceu: a variável ficou na hospedagem com
    // o valor de exemplo, apontando para localhost. Sem esta checagem, as 48
    // consultas falhavam uma a uma por quase um minuto antes de alguém
    // entender o motivo. Falhar na primeira linha, com o motivo escrito, custa
    // menos.
    const local = /localhost|127\.0\.0\.1/.test(configurada);

    if (local && process.env.VERCEL) {
      throw new ErroDeNegocio(
        "A URL dos portais dos órgãos aponta para a máquina local, o que não funciona em produção.",
        {
          sugestao:
            "Remova a variável de ambiente ORGAOS_BASE_URL: sem ela, o portal usa o endereço do próprio deploy.",
        },
      );
    }

    return configurada;
  }

  // Na Vercel a aplicação não conhece a própria URL pública por padrão.
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/fake/orgaos`;
  }

  return "http://127.0.0.1:3000/api/fake/orgaos";
}
