import Link from "next/link";
import { notFound } from "next/navigation";

import { Cabecalho } from "@/components/cabecalho";
import { EtiquetaExecucao, EtiquetaItem } from "@/components/execucao-badges";
import { exigirSessao, podeVerModulo } from "@/lib/auth/permissoes";
import { prisma } from "@/lib/db";
import { formatarDataHora, formatarDuracao } from "@/lib/formato";
import { buscarModulo } from "@/modules/catalogo";

/**
 * Detalhe de uma execução.
 *
 * É a prova de que a automação fez o que diz ter feito: item a item, com hora,
 * resultado e o erro legível de cada falha. Sem esta tela o portal afirma "11
 * avisados" e ninguém consegue verificar **quais**.
 *
 * Vale para todos os módulos, porque o item a item vem do núcleo de execução.
 */
export const metadata = {
  title: "Execução · Portal SheepContabil",
};

export default async function DetalheExecucao({
  params,
}: PageProps<"/execucoes/[id]">) {
  const sessao = await exigirSessao();
  const { id } = await params;

  const execucao = await prisma.execucao.findUnique({
    where: { id },
    include: {
      disparadoPor: { select: { nome: true, email: true } },
      itens: { orderBy: { registradoEm: "asc" } },
    },
  });

  if (!execucao) notFound();

  const modulo = buscarModulo(execucao.modulo);

  // A mesma regra de perfil das outras telas: sem ela, bastaria adivinhar um id
  // para ler a execução de um módulo de outra área.
  if (!modulo || !podeVerModulo(sessao, modulo)) notFound();

  const artefatos = await prisma.artefato.findMany({
    where: { execucaoId: execucao.id },
    orderBy: { criadoEm: "asc" },
  });

  const contagem = execucao.itens.reduce<Record<string, number>>((acc, item) => {
    acc[item.status] = (acc[item.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <>
      <Cabecalho sessao={sessao} />

      <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-6 py-10">
        <nav className="text-xs text-text-muted">
          <Link href="/execucoes" className="hover:text-turquesa">
            Execuções
          </Link>
          <span className="mx-2">/</span>
          <Link
            href={`/modulos/${execucao.modulo.toLowerCase()}`}
            className="font-mono hover:text-turquesa"
          >
            {execucao.modulo}
          </Link>
          <span className="mx-2">/</span>
          <span className="font-mono">{execucao.id.slice(-8)}</span>
        </nav>

        <header className="rounded-lg border border-border bg-surface p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-xl text-tinta">{modulo.nome}</h1>
              {execucao.resumo ? (
                <p className="mt-1 text-sm text-text-muted">{execucao.resumo}</p>
              ) : null}
            </div>
            <EtiquetaExecucao status={execucao.status} />
          </div>

          <dl className="mt-5 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-4">
            <Dado rotulo="Início" valor={formatarDataHora(execucao.iniciadaEm)} mono />
            <Dado rotulo="Duração" valor={formatarDuracao(execucao.duracaoMs)} mono />
            <Dado
              rotulo="Disparo"
              valor={execucao.disparo === "MANUAL" ? "Sob demanda" : "Agendado"}
            />
            <Dado
              rotulo="Quem disparou"
              valor={execucao.disparadoPor?.nome ?? "Agendador"}
            />
          </dl>

          {execucao.erro ? (
            <div className="mt-4 rounded border border-carmim/40 bg-carmim/10 p-4">
              <p className="text-sm text-carmim">{execucao.erro}</p>

              {/* O detalhe técnico existe, mas não é para o operador: só o
                  administrador vê, e ainda assim recolhido. */}
              {sessao.user.perfil === "ADMIN" && execucao.detalheTecnico ? (
                <details className="mt-3">
                  <summary className="cursor-pointer font-mono text-[11px] text-grafite">
                    detalhe técnico
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded bg-tinta/90 p-3 font-mono text-[11px] whitespace-pre-wrap text-white">
                    {execucao.detalheTecnico}
                  </pre>
                </details>
              ) : null}
            </div>
          ) : null}
        </header>

        {/* ------------------------------------------------------------------ */}
        <section>
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg text-tinta">O que foi processado</h2>
            <p className="font-mono text-xs text-text-muted">
              {execucao.itens.length} item(ns)
              {Object.entries(contagem).map(([status, quantidade]) => (
                <span key={status}> · {status.toLowerCase()} {quantidade}</span>
              ))}
            </p>
          </div>

          {execucao.itens.length === 0 ? (
            <p className="rounded border border-border bg-surface p-6 text-sm text-text-muted">
              Esta execução não registrou itens. Ou não havia nada a processar, ou
              ela falhou antes de começar — o erro acima diz qual dos dois.
            </p>
          ) : (
            <ol className="space-y-2">
              {execucao.itens.map((item) => (
                <li
                  key={item.id}
                  className="rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-tinta">
                      {item.referencia}
                    </p>
                    <div className="flex items-center gap-3">
                      <EtiquetaItem status={item.status} />
                      <span className="font-mono text-[11px] text-text-muted">
                        {formatarDataHora(item.registradoEm)}
                      </span>
                    </div>
                  </div>

                  {item.mensagem ? (
                    <p
                      className={`mt-2 text-xs ${
                        item.status === "FALHA" ? "text-carmim" : "text-text-muted"
                      }`}
                    >
                      {item.mensagem}
                    </p>
                  ) : null}

                  {item.dados ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer font-mono text-[11px] text-grafite">
                        dados do item
                      </summary>
                      <pre className="mt-1 overflow-x-auto rounded bg-nevoa p-2 font-mono text-[11px] text-tinta">
                        {JSON.stringify(item.dados, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* ------------------------------------------------------------------ */}
        {artefatos.length > 0 ? (
          <section>
            <h2 className="mb-4 text-lg text-tinta">O que foi produzido</h2>
            <ul className="space-y-2">
              {artefatos.map((artefato) => (
                <li
                  key={artefato.id}
                  className="rounded-lg border border-border bg-surface p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-tinta">
                      {artefato.nome}
                    </p>
                    <span className="font-mono text-[11px] tracking-wide text-text-muted uppercase">
                      {artefato.tipo.replace(/_/g, " ")}
                    </span>
                  </div>

                  {artefato.conteudo ? (
                    <pre className="mt-2 max-h-72 overflow-auto rounded bg-nevoa p-3 font-mono text-[11px] whitespace-pre-wrap text-tinta">
                      {JSON.stringify(artefato.conteudo, null, 2)}
                    </pre>
                  ) : null}

                  {artefato.caminho ? (
                    <a
                      href={artefato.caminho}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-turquesa hover:underline"
                    >
                      abrir arquivo
                    </a>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}

function Dado({
  rotulo,
  valor,
  mono = false,
}: {
  rotulo: string;
  valor: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] tracking-wide text-text-muted uppercase">
        {rotulo}
      </dt>
      <dd className={`mt-0.5 text-tinta ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {valor}
      </dd>
    </div>
  );
}
