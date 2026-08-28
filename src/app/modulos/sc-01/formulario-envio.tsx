"use client";

import { useActionState } from "react";

import { enviarExtrato, type ResultadoUpload } from "./acoes";

/**
 * Envio do extrato.
 *
 * O arquivo é processado no mesmo passo: quem envia está olhando a tela e
 * espera saber se deu certo. O resultado aparece aqui embaixo, e não como um
 * recarregamento silencioso.
 */
export function FormularioEnvio({
  clientes,
  bancosSuportados,
}: {
  clientes: { id: string; nome: string }[];
  bancosSuportados: string[];
}) {
  const [resultado, enviar, enviando] = useActionState<
    ResultadoUpload | null,
    FormData
  >(enviarExtrato, null);

  return (
    <form
      action={enviar}
      className="rounded-lg border border-border bg-surface p-5"
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label className="text-xs text-text-muted" htmlFor="clienteId">
            Cliente
          </label>
          <select
            id="clienteId"
            name="clienteId"
            required
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm"
          >
            <option value="">Escolha…</option>
            {clientes.map((cliente) => (
              <option key={cliente.id} value={cliente.id}>
                {cliente.nome}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs text-text-muted" htmlFor="arquivo">
            Extrato em PDF
          </label>
          <input
            id="arquivo"
            name="arquivo"
            type="file"
            accept=".pdf,.txt,application/pdf,text/plain,image/*"
            required
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-1.5 text-sm file:mr-3 file:rounded file:border-0 file:bg-nevoa file:px-3 file:py-1.5 file:text-xs file:text-petroleo"
          />
        </div>

        <button
          type="submit"
          disabled={enviando}
          aria-busy={enviando}
          className="rounded bg-brand px-4 py-2.5 text-sm font-semibold text-brand-contrast transition-colors hover:bg-turquesa disabled:cursor-progress disabled:opacity-70"
        >
          {enviando ? "Lendo…" : "Enviar e converter"}
        </button>
      </div>

      <p className="mt-3 text-xs text-text-muted">
        Layouts reconhecidos hoje: <strong>{bancosSuportados.join(", ")}</strong>.
        Um banco novo entra como um arquivo de parser, sem mexer no resto do
        módulo — o que não for reconhecido é recusado com o motivo, em vez de
        virar lançamento errado.
      </p>

      {resultado ? (
        <p
          role="status"
          className={`mt-3 rounded border p-3 text-sm ${
            resultado.ok
              ? "border-turquesa/40 bg-turquesa/10 text-turquesa"
              : "border-carmim/40 bg-carmim/10 text-carmim"
          }`}
        >
          {resultado.mensagem}
        </p>
      ) : null}
    </form>
  );
}
