import { Area } from "@/generated/prisma/enums";

/**
 * Catálogo dos módulos implementados no portal.
 *
 * Vive em código, não em tabela: é o registro do que existe no sistema, não um
 * dado que a operação edita. Cada módulo é identificado pelo código do catálogo
 * do enunciado (SC-XX), que é como a tela dele se apresenta.
 */

/** As três naturezas do enunciado. */
export type Natureza = "RPA" | "AGENTE_IA" | "CONTROLE";

export const ROTULO_NATUREZA: Record<Natureza, string> = {
  RPA: "RPA",
  AGENTE_IA: "Agente de IA",
  CONTROLE: "Controle sistematizado",
};

export const ROTULO_AREA: Record<Area, string> = {
  CONTABIL: "Contábil",
  FISCAL: "Fiscal",
  PROCESSOS: "Processos",
  DEPARTAMENTO_PESSOAL: "Departamento Pessoal",
  SOCIETARIO: "Societário",
  TECNOLOGIA: "Tecnologia",
  ATENDIMENTO: "Atendimento",
  BPO_SAUDE: "BPO Saúde",
};

export type Modulo = {
  /** Código do catálogo — identifica o módulo na tela e no histórico. */
  codigo: string;
  nome: string;
  natureza: Natureza;
  /** Área dona do processo: define quais operadores enxergam o módulo. */
  area: Area;
  /** Frequência que o catálogo indica, em texto, para exibição. */
  frequencia: string;
  /** Uma linha sobre a dor que o processo resolve. */
  resumo: string;
  /** Horas por mês que o mapeamento interno cronometrou, quando houve medição. */
  horasMes?: number;
  /** Falso enquanto o módulo ainda não foi implementado. */
  disponivel: boolean;
};

export const MODULOS: readonly Modulo[] = [
  {
    codigo: "SC-01",
    nome: "Conversão de extrato bancário para OFX",
    natureza: "AGENTE_IA",
    area: Area.CONTABIL,
    frequencia: "Mensal",
    resumo:
      "Recebe o extrato em PDF ou foto, identifica os lançamentos e gera um OFX válido, separando o que não foi lido com confiança.",
    horasMes: 110,
    disponivel: true,
  },
  {
    codigo: "SC-02",
    nome: "Painel de situação fiscal dos clientes",
    natureza: "RPA",
    area: Area.PROCESSOS,
    frequencia: "Mensal",
    resumo:
      "Consulta os órgãos por cliente, guarda cada tentativa e mostra quem está irregular, em qual órgão e há quanto tempo.",
    horasMes: 54,
    disponivel: true,
  },
  {
    codigo: "SC-05",
    nome: "Bloqueio e desbloqueio de clientes inadimplentes",
    natureza: "RPA",
    area: Area.TECNOLOGIA,
    frequencia: "Sob demanda",
    resumo:
      "Executa a sequência de bloqueio nos sistemas que não se integram, mostra o que foi feito em cada um e sabe desfazer.",
    horasMes: 11,
    disponivel: true,
  },
  {
    codigo: "SC-20",
    nome: "Vencimento de certificado digital",
    natureza: "CONTROLE",
    area: Area.PROCESSOS,
    frequencia: "Mensal",
    resumo:
      "Base de certificados por cliente, painel dos próximos 60 dias e aviso que só repete o que mudou desde a última vez.",
    horasMes: 2,
    disponivel: true,
  },
] as const;

export function buscarModulo(codigo: string): Modulo | undefined {
  return MODULOS.find((modulo) => modulo.codigo === codigo);
}
