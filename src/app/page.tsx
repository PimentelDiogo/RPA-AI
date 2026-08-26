import Link from "next/link";

import { Cabecalho } from "@/components/cabecalho";
import { exigirSessao, modulosVisiveis } from "@/lib/auth/permissoes";
import {
  ROTULO_AREA,
  ROTULO_NATUREZA,
  type Modulo,
} from "@/modules/catalogo";

export const metadata = {
  title: "Módulos · Portal SheepContabil",
};

/**
 * Home do portal: a lista dos módulos implementados. O operador vê apenas os
 * da área dele; o administrador vê todos.
 */
export default async function Home() {
  const sessao = await exigirSessao();
  const modulos = modulosVisiveis(sessao);

  return (
    <>
      <Cabecalho sessao={sessao} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <h1 className="text-2xl text-tinta">Automações</h1>
        <p className="mt-1 text-sm text-text-muted">
          {modulos.length === 1
            ? "1 módulo disponível para o seu perfil."
            : `${modulos.length} módulos disponíveis para o seu perfil.`}
        </p>

        <ul className="mt-6 grid gap-4 sm:grid-cols-2">
          {modulos.map((modulo) => (
            <li key={modulo.codigo}>
              <CartaoModulo modulo={modulo} />
            </li>
          ))}
        </ul>

        {modulos.length === 0 ? (
          <p className="mt-6 rounded border border-border bg-surface p-6 text-sm text-text-muted">
            Nenhum módulo está associado à sua área. Fale com o administrador.
          </p>
        ) : null}
      </main>
    </>
  );
}

function CartaoModulo({ modulo }: { modulo: Modulo }) {
  const conteudo = (
    <article
      className={`flex h-full flex-col rounded-lg border border-border bg-surface p-5 transition-colors ${
        modulo.disponivel ? "hover:border-turquesa" : "opacity-70"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="rounded bg-nevoa px-2 py-0.5 font-mono text-xs font-medium text-petroleo">
          {modulo.codigo}
        </span>
        <span className="font-mono text-[11px] tracking-wide text-text-muted uppercase">
          {ROTULO_NATUREZA[modulo.natureza]}
        </span>
      </div>

      <h2 className="mt-3 text-base text-tinta">{modulo.nome}</h2>
      <p className="mt-2 flex-1 text-sm text-text-muted">{modulo.resumo}</p>

      <dl className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-border pt-3 text-xs text-text-muted">
        <div className="flex gap-1.5">
          <dt>Área:</dt>
          <dd className="text-tinta">{ROTULO_AREA[modulo.area]}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt>Frequência:</dt>
          <dd className="text-tinta">{modulo.frequencia}</dd>
        </div>
        {modulo.horasMes ? (
          <div className="flex gap-1.5">
            <dt>Hoje custa:</dt>
            <dd className="font-mono text-tinta">{modulo.horasMes} h/mês</dd>
          </div>
        ) : null}
      </dl>

      {!modulo.disponivel ? (
        <p className="mt-3 font-mono text-[11px] tracking-wide text-ambar uppercase">
          Em construção
        </p>
      ) : null}
    </article>
  );

  if (!modulo.disponivel) return conteudo;

  return (
    <Link
      href={`/modulos/${modulo.codigo.toLowerCase()}`}
      className="block h-full"
    >
      {conteudo}
    </Link>
  );
}
