"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";

/**
 * Disparo sob demanda, com o que acontece no meio à vista.
 *
 * Uma rodada do SC-02 leva dez segundos e consulta 48 portais. Sem sinal de
 * progresso, a tela parece travada e a reação natural é clicar de novo — o que
 * dispararia uma segunda execução. Então o botão mostra que está trabalhando,
 * conta o tempo, e no fim diz onde conferir o resultado em vez de deixar a
 * pessoa procurar.
 */
export type ResultadoExecucao = {
  ok: boolean;
  execucaoId?: string;
  status?: string;
  resumo?: string | null;
  erro?: string | null;
};

const ROTULO_STATUS: Record<string, string> = {
  SUCESSO: "Concluída com sucesso",
  SUCESSO_PARCIAL: "Concluída com pendências",
  FALHA: "Falhou",
  EM_EXECUCAO: "Em execução",
};

const ESTILO_STATUS: Record<string, string> = {
  SUCESSO: "border-turquesa/40 bg-turquesa/10 text-turquesa",
  SUCESSO_PARCIAL: "border-ambar/50 bg-ambar/10 text-ambar",
  FALHA: "border-carmim/40 bg-carmim/10 text-carmim",
  EM_EXECUCAO: "border-border bg-nevoa text-grafite",
};

export function BotaoExecutar({
  acao,
  rotulo = "Executar agora",
  ondeVerResultado,
}: {
  acao: (
    estadoAnterior: ResultadoExecucao | null,
    formData: FormData,
  ) => Promise<ResultadoExecucao>;
  rotulo?: string;
  /** Uma frase dizendo o que mudou na própria tela depois da rodada. */
  ondeVerResultado: string;
}) {
  const [resultado, executar, executando] = useActionState(acao, null);
  const [segundos, setSegundos] = useState(0);
  const [dialogoAberto, setDialogoAberto] = useState(false);
  const roteador = useRouter();
  const jaMostrado = useRef<ResultadoExecucao | null>(null);

  // Contador de tempo enquanto roda. Conta a partir do instante em que o efeito
  // começa, em vez de zerar o estado aqui: assim o valor acompanha o relógio de
  // verdade, mesmo que a aba fique em segundo plano, e o último valor sobrevive
  // para o diálogo mostrar quanto durou.
  useEffect(() => {
    if (!executando) return;

    const inicio = Date.now();
    const relogio = setInterval(
      () => setSegundos(Math.floor((Date.now() - inicio) / 1000)),
      250,
    );

    return () => clearInterval(relogio);
  }, [executando]);

  // Abre o diálogo quando um resultado novo chega — e só uma vez por resultado.
  useEffect(() => {
    if (!resultado || executando || jaMostrado.current === resultado) return;

    jaMostrado.current = resultado;
    setDialogoAberto(true);
    // A tela por baixo já reflete a rodada quando o diálogo for fechado.
    roteador.refresh();
  }, [resultado, executando, roteador]);

  const status = resultado?.status ?? (resultado?.ok ? "SUCESSO" : "FALHA");

  return (
    <>
      <form action={executar} className="flex items-center gap-3">
        {executando ? (
          <span
            className="font-mono text-xs text-text-muted"
            aria-live="polite"
            aria-atomic="true"
          >
            {segundos}s
          </span>
        ) : null}

        <button
          type="submit"
          disabled={executando}
          aria-busy={executando}
          className="inline-flex items-center gap-2 rounded bg-brand px-4 py-2.5 text-sm font-semibold text-brand-contrast transition-colors hover:bg-turquesa disabled:cursor-progress disabled:opacity-70 disabled:hover:bg-brand"
        >
          {executando ? (
            <>
              <Girando />
              Executando…
            </>
          ) : (
            rotulo
          )}
        </button>
      </form>

      {dialogoAberto && resultado ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-tinta/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="titulo-resultado-execucao"
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-lg">
            <div className="flex items-start justify-between gap-3">
              <h2
                id="titulo-resultado-execucao"
                className="text-lg text-tinta"
              >
                Execução concluída
              </h2>
              <span
                className={`rounded border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap ${
                  ESTILO_STATUS[status] ?? ESTILO_STATUS.EM_EXECUCAO
                }`}
              >
                {ROTULO_STATUS[status] ?? status}
              </span>
            </div>

            <p className="mt-1 font-mono text-xs text-text-muted">
              {segundos > 0 ? `${segundos} segundo(s)` : "menos de 1 segundo"}
            </p>

            {resultado.resumo ? (
              <p className="mt-4 text-sm text-tinta">{resultado.resumo}</p>
            ) : null}

            {resultado.erro ? (
              <p className="mt-4 rounded border border-carmim/40 bg-carmim/10 p-3 text-sm text-carmim">
                {resultado.erro}
              </p>
            ) : null}

            <div className="mt-5 rounded border border-border bg-nevoa/60 p-3 text-xs text-text-muted">
              <p className="font-medium text-tinta">Onde conferir</p>
              <p className="mt-1">{ondeVerResultado}</p>
              <p className="mt-1">
                Para ver <strong>item a item</strong> o que foi processado, abra o
                detalhe da execução.
              </p>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setDialogoAberto(false)}
                className="rounded border border-border px-3 py-2 text-sm transition-colors hover:border-turquesa hover:text-turquesa"
              >
                Ficar nesta tela
              </button>

              {resultado.execucaoId ? (
                <Link
                  href={`/execucoes/${resultado.execucaoId}`}
                  className="rounded bg-brand px-4 py-2 text-sm font-semibold text-brand-contrast transition-colors hover:bg-turquesa"
                >
                  Ver o que foi processado
                </Link>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Girando() {
  return (
    <svg
      className="h-4 w-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="9"
        stroke="currentColor"
        strokeWidth="3"
        opacity="0.3"
      />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
