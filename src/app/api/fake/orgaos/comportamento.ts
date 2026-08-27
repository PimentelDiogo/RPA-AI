/**
 * Comportamento simulado dos portais de órgão.
 *
 * O enunciado não concede acesso a portal nenhum, então os órgãos são
 * simulados pelo próprio projeto. O ponto não é fingir que tudo funciona: é
 * reproduzir o mundo real, onde portal cai, demora, expira a sessão e responde
 * num formato inesperado. É contra isso que o RPA precisa se defender, e é o
 * que o enunciado avalia em "falha com dignidade".
 *
 * O comportamento é **determinístico**: derivado de um hash do par
 * (CNPJ × órgão). O mesmo cliente no mesmo órgão se comporta sempre igual, para
 * a demonstração ser repetível — mas ninguém precisa configurar nada.
 */

export const ORGAOS = [
  "receita-federal",
  "fgts",
  "previdencia",
  "fazenda-estadual",
] as const;

export type OrgaoSlug = (typeof ORGAOS)[number];

export const NOME_ORGAO: Record<OrgaoSlug, string> = {
  "receita-federal": "Receita Federal",
  fgts: "FGTS — Caixa Econômica",
  previdencia: "Previdência Social",
  "fazenda-estadual": "Secretaria da Fazenda Estadual",
};

export type Comportamento =
  | { tipo: "regular" }
  | { tipo: "irregular"; pendencia: string }
  | { tipo: "indisponivel" }
  | { tipo: "timeout" }
  | { tipo: "fora-do-ar" }
  | { tipo: "sessao-expirada" }
  | { tipo: "formato-inesperado" };

/** Hash estável e pequeno — não precisa ser criptográfico, precisa ser igual sempre. */
function semente(cnpj: string, orgao: string): number {
  const texto = `${cnpj}:${orgao}`;
  let hash = 2166136261;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

const PENDENCIAS = [
  "Débito de tributo federal em cobrança administrativa",
  "Guia de recolhimento do FGTS em atraso — competência anterior",
  "Contribuição previdenciária declarada e não recolhida",
  "Divergência entre a apuração declarada e o recolhido",
];

/**
 * Distribuição escolhida para a demonstração ter os três estados que o painel
 * precisa distinguir, e falhas suficientes para a faixa de "não conseguimos
 * consultar" nunca ficar vazia:
 *
 *   ~55% regular · ~20% irregular · ~5% indisponível · ~20% falha de acesso
 */
export function comportamentoDe(cnpj: string, orgao: string): Comportamento {
  const s = semente(cnpj, orgao);
  const faixa = s % 100;

  if (faixa < 55) return { tipo: "regular" };
  if (faixa < 75) {
    return { tipo: "irregular", pendencia: PENDENCIAS[s % PENDENCIAS.length] };
  }
  if (faixa < 80) return { tipo: "indisponivel" };
  if (faixa < 87) return { tipo: "timeout" };
  if (faixa < 92) return { tipo: "fora-do-ar" };
  if (faixa < 97) return { tipo: "sessao-expirada" };
  return { tipo: "formato-inesperado" };
}

/**
 * Latência do portal. Pequena de propósito: o objetivo é exercitar o
 * tratamento de erro, não gastar o tempo da função serverless esperando.
 */
export function latenciaMs(cnpj: string, orgao: string): number {
  return 40 + (semente(cnpj, orgao) % 160);
}

/** Espera longa o bastante para o adapter desistir e registrar o timeout. */
export const ESPERA_DE_TIMEOUT_MS = 5_000;

/** Permite forçar um comportamento pela URL, para a demo não depender de sorte. */
export function comportamentoForcado(valor: string | null): Comportamento | null {
  switch (valor) {
    case "regular":
      return { tipo: "regular" };
    case "irregular":
      return { tipo: "irregular", pendencia: PENDENCIAS[0] };
    case "indisponivel":
      return { tipo: "indisponivel" };
    case "timeout":
      return { tipo: "timeout" };
    case "fora-do-ar":
      return { tipo: "fora-do-ar" };
    case "sessao-expirada":
      return { tipo: "sessao-expirada" };
    case "formato-inesperado":
      return { tipo: "formato-inesperado" };
    default:
      return null;
  }
}
