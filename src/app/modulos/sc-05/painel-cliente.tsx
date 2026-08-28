"use client";

import { useActionState } from "react";

import {
  bloquearCliente,
  desbloquearCliente,
  type ResultadoAcao,
} from "./acoes";

/**
 * A ação sobre um cliente.
 *
 * Bloqueio e desbloqueio mexem em sistemas do cliente, então exigem **motivo**
 * — sem ele o botão nem envia. E, como a sequência leva alguns segundos e toca
 * três sistemas, o botão mostra que está trabalhando em vez de deixar a tela
 * parada.
 */
export function AcaoDeBloqueio({
  clienteId,
  bloqueado,
}: {
  clienteId: string;
  bloqueado: boolean;
}) {
  const acao = bloqueado ? desbloquearCliente : bloquearCliente;
  const [resultado, executar, executando] = useActionState<
    ResultadoAcao | null,
    FormData
  >(acao, null);

  return (
    <form action={executar} className="mt-3 flex flex-wrap items-end gap-2">
      <input type="hidden" name="clienteId" value={clienteId} />

      <div className="min-w-56 flex-1">
        <label
          className="text-[11px] text-text-muted"
          htmlFor={`motivo-${clienteId}`}
        >
          Motivo {bloqueado ? "do desbloqueio" : "do bloqueio"} (obrigatório)
        </label>
        <input
          id={`motivo-${clienteId}`}
          name="motivo"
          required
          placeholder={
            bloqueado ? "Cliente renegociou a dívida" : "Inadimplência há 60 dias"
          }
          className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm"
        />
      </div>

      <button
        type="submit"
        disabled={executando}
        aria-busy={executando}
        className={`rounded px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-progress disabled:opacity-70 ${
          bloqueado
            ? "border border-turquesa text-turquesa hover:bg-turquesa hover:text-white"
            : "bg-brand text-brand-contrast hover:bg-turquesa"
        }`}
      >
        {executando
          ? "Executando…"
          : bloqueado
            ? "Desbloquear"
            : "Bloquear em todos os sistemas"}
      </button>

      {resultado ? (
        <p
          role="status"
          className={`w-full rounded border p-2 text-xs ${
            resultado.ok
              ? "border-turquesa/40 bg-turquesa/10 text-turquesa"
              : "border-ambar/50 bg-ambar/10 text-ambar"
          }`}
        >
          {resultado.mensagem}
        </p>
      ) : null}
    </form>
  );
}
