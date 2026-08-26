import type { StatusExecucao, StatusItem } from "@/generated/prisma/enums";

/**
 * Estado de execução na tela.
 *
 * Carmim é exclusivo de falha — a paleta do enunciado é explícita nisso.
 * Sucesso parcial usa âmbar, porque é pendência, não erro: alguma coisa
 * precisa de atenção, mas a rodada não foi perdida.
 */
const ESTILO_EXECUCAO: Record<StatusExecucao, { rotulo: string; classe: string }> = {
  EM_EXECUCAO: {
    rotulo: "Em execução",
    classe: "border-grafite/40 bg-nevoa text-grafite",
  },
  SUCESSO: {
    rotulo: "Sucesso",
    classe: "border-turquesa/40 bg-turquesa/10 text-turquesa",
  },
  SUCESSO_PARCIAL: {
    rotulo: "Sucesso parcial",
    classe: "border-ambar/50 bg-ambar/10 text-ambar",
  },
  FALHA: {
    rotulo: "Falha",
    classe: "border-carmim/40 bg-carmim/10 text-carmim",
  },
};

const ESTILO_ITEM: Record<StatusItem, { rotulo: string; classe: string }> = {
  SUCESSO: {
    rotulo: "Sucesso",
    classe: "border-turquesa/40 bg-turquesa/10 text-turquesa",
  },
  FALHA: {
    rotulo: "Falha",
    classe: "border-carmim/40 bg-carmim/10 text-carmim",
  },
  CONFERENCIA: {
    rotulo: "Conferência",
    classe: "border-ambar/50 bg-ambar/10 text-ambar",
  },
  IGNORADO: {
    rotulo: "Ignorado",
    classe: "border-grafite/40 bg-nevoa text-grafite",
  },
};

function Etiqueta({ rotulo, classe }: { rotulo: string; classe: string }) {
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap ${classe}`}
    >
      {rotulo}
    </span>
  );
}

export function EtiquetaExecucao({ status }: { status: StatusExecucao }) {
  return <Etiqueta {...ESTILO_EXECUCAO[status]} />;
}

export function EtiquetaItem({ status }: { status: StatusItem }) {
  return <Etiqueta {...ESTILO_ITEM[status]} />;
}
