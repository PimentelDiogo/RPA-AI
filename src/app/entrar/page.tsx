import { redirect } from "next/navigation";

import { Marca } from "@/components/marca";
import { auth } from "@/lib/auth";
import { entrar } from "./acoes";

export const metadata = {
  title: "Entrar · Portal SheepContabil",
};

export default async function EntrarPage({
  searchParams,
}: PageProps<"/entrar">) {
  const sessao = await auth();
  if (sessao?.user) redirect("/");

  const { erro } = await searchParams;

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Marca altura={40} />
        </div>

        <form
          action={entrar}
          className="rounded-lg border border-border bg-surface p-6 shadow-sm"
        >
          <h1 className="text-xl text-brand">Portal de Automações</h1>
          <p className="mt-1 text-sm text-text-muted">
            Entre com as credenciais da sua conta.
          </p>

          {erro ? (
            <p
              role="alert"
              className="mt-4 rounded border border-carmim/40 bg-carmim/10 px-3 py-2 text-sm text-carmim"
            >
              {erro === "credenciais"
                ? "E-mail ou senha incorretos."
                : "Não foi possível entrar agora. Tente novamente em instantes."}
            </p>
          ) : null}

          <label className="mt-5 block text-sm font-medium" htmlFor="email">
            E-mail
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-turquesa focus:ring-2 focus:ring-turquesa/30"
          />

          <label className="mt-4 block text-sm font-medium" htmlFor="senha">
            Senha
          </label>
          <input
            id="senha"
            name="senha"
            type="password"
            autoComplete="current-password"
            required
            className="mt-1 w-full rounded border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-turquesa focus:ring-2 focus:ring-turquesa/30"
          />

          <button
            type="submit"
            className="mt-6 w-full rounded bg-brand px-4 py-2.5 text-sm font-semibold text-brand-contrast transition-colors hover:bg-turquesa"
          >
            Entrar
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-text-muted">
          Ambiente de demonstração. Todos os dados são fictícios.
        </p>
      </div>
    </main>
  );
}
