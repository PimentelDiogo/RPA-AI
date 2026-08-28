import Link from "next/link";

import { EtiquetaExecucao } from "@/components/execucao-badges";
import type { StatusExecucao, Disparo } from "@/generated/prisma/enums";
import { formatarDataHora, formatarDuracao } from "@/lib/formato";

export type LinhaHistorico = {
  id: string;
  modulo: string;
  status: StatusExecucao;
  disparo: Disparo;
  iniciadaEm: Date;
  duracaoMs: number | null;
  resumo: string | null;
  erro: string | null;
  disparadoPor: { nome: string } | null;
};

/**
 * Histórico de execução, exatamente o que o enunciado cobra: data, duração,
 * quem disparou e resultado. Falha aparece com o erro legível na própria linha
 * — o operador não precisa abrir nada para saber o que houve.
 */
export function HistoricoExecucoes({
  execucoes,
  mostrarModulo = false,
}: {
  execucoes: LinhaHistorico[];
  mostrarModulo?: boolean;
}) {
  if (execucoes.length === 0) {
    return (
      <p className="rounded border border-border bg-surface p-6 text-sm text-text-muted">
        Nenhuma execução registrada ainda.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[42rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs tracking-wide text-text-muted uppercase">
            {mostrarModulo ? <th className="px-4 py-3 font-medium">Módulo</th> : null}
            <th className="px-4 py-3 font-medium">Quando</th>
            <th className="px-4 py-3 font-medium">Duração</th>
            <th className="px-4 py-3 font-medium">Disparo</th>
            <th className="px-4 py-3 font-medium">Quem disparou</th>
            <th className="px-4 py-3 font-medium">Resultado</th>
          </tr>
        </thead>
        <tbody>
          {execucoes.map((execucao, indice) => (
            <tr
              key={execucao.id}
              className={`border-b border-border/60 last:border-0 ${
                indice % 2 === 1 ? "bg-nevoa/50" : ""
              }`}
            >
              {mostrarModulo ? (
                <td className="px-4 py-3">
                  <Link
                    href={`/modulos/${execucao.modulo.toLowerCase()}`}
                    className="font-mono text-xs text-petroleo hover:text-turquesa"
                  >
                    {execucao.modulo}
                  </Link>
                </td>
              ) : null}

              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                {/* A data é o caminho para a prova: abre o item a item. */}
                <Link
                  href={`/execucoes/${execucao.id}`}
                  className="text-petroleo hover:text-turquesa hover:underline"
                >
                  {formatarDataHora(execucao.iniciadaEm)}
                </Link>
              </td>
              <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                {formatarDuracao(execucao.duracaoMs)}
              </td>
              <td className="px-4 py-3 text-xs">
                {execucao.disparo === "MANUAL" ? "Sob demanda" : "Agendado"}
              </td>
              <td className="px-4 py-3 text-xs">
                {execucao.disparadoPor?.nome ?? (
                  <span className="text-text-muted">Agendador</span>
                )}
              </td>
              <td className="px-4 py-3">
                <div className="flex flex-col gap-1">
                  <EtiquetaExecucao status={execucao.status} />
                  {execucao.erro ? (
                    <span className="text-xs text-carmim">{execucao.erro}</span>
                  ) : execucao.resumo ? (
                    <span className="text-xs text-text-muted">
                      {execucao.resumo}
                    </span>
                  ) : null}
                  <Link
                    href={`/execucoes/${execucao.id}`}
                    className="text-xs text-turquesa hover:underline"
                  >
                    ver o que foi processado →
                  </Link>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
