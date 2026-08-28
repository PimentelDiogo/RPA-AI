import Link from "next/link";

import { BotaoExecutar } from "@/components/botao-executar";
import { Cabecalho } from "@/components/cabecalho";
import { HistoricoExecucoes } from "@/components/historico-execucoes";
import type { ConfiancaLancamento } from "@/generated/prisma/enums";
import { exigirAcessoAoModulo } from "@/lib/auth/permissoes";
import { prisma } from "@/lib/db";
import { formatarData, formatarDataHora } from "@/lib/formato";
import { BANCOS_SUPORTADOS } from "@/modules/sc-01/parsers";
import { formatarReais } from "@/modules/sc-01/validacao";
import { aprovarLancamento, processarFila } from "./acoes";
import { FormularioEnvio } from "./formulario-envio";

export const metadata = {
  title: "SC-01 · Conversão de extrato para OFX",
};

const ESTILO_CONFIANCA: Record<ConfiancaLancamento, string> = {
  ALTA: "border-turquesa/40 bg-turquesa/10 text-turquesa",
  MEDIA: "border-ambar/50 bg-ambar/10 text-ambar",
  BAIXA: "border-carmim/40 bg-carmim/10 text-carmim",
};

export default async function ModuloSc01() {
  const { sessao, modulo } = await exigirAcessoAoModulo("SC-01");

  const [clientes, extratos, execucoes, agendamento] = await Promise.all([
    prisma.cliente.findMany({
      where: { ativo: true },
      select: { id: true, razaoSocial: true, nomeFantasia: true },
      orderBy: { razaoSocial: "asc" },
    }),
    prisma.extratoImportado.findMany({
      orderBy: { criadoEm: "desc" },
      take: 12,
      include: {
        cliente: { select: { razaoSocial: true, nomeFantasia: true } },
        lancamentos: { orderBy: { ordem: "asc" } },
      },
    }),
    prisma.execucao.findMany({
      where: { modulo: "SC-01" },
      orderBy: { iniciadaEm: "desc" },
      take: 15,
      select: {
        id: true,
        modulo: true,
        status: true,
        disparo: true,
        iniciadaEm: true,
        duracaoMs: true,
        resumo: true,
        erro: true,
        disparadoPor: { select: { nome: true } },
      },
    }),
    prisma.agendamento.findUnique({ where: { modulo: "SC-01" } }),
  ]);

  const emConferencia = extratos.flatMap((extrato) =>
    extrato.lancamentos
      .filter((l) => l.confianca !== "ALTA" && !l.conferido)
      .map((l) => ({ extrato, lancamento: l })),
  );

  return (
    <>
      <Cabecalho sessao={sessao} />

      <main className="mx-auto w-full max-w-6xl flex-1 space-y-10 px-6 py-10">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="rounded bg-nevoa px-2 py-0.5 font-mono text-xs font-medium text-petroleo">
              {modulo.codigo}
            </span>
            <h1 className="mt-2 text-2xl text-tinta">{modulo.nome}</h1>
            <p className="mt-1 max-w-2xl text-sm text-text-muted">
              {modulo.resumo}
            </p>
            {agendamento ? (
              <p className="mt-2 font-mono text-xs text-text-muted">
                Varredura da fila: {agendamento.cron} ·{" "}
                {agendamento.proximaExecucaoEm
                  ? `próxima ${formatarDataHora(agendamento.proximaExecucaoEm)}`
                  : "primeira janela ainda não programada"}
              </p>
            ) : null}
          </div>

          <BotaoExecutar
            acao={processarFila}
            rotulo="Processar fila"
            ondeVerResultado="Os extratos importados e a fila de conferência, nesta mesma tela, já refletem esta rodada."
          />
        </header>

        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="mb-4 text-lg text-tinta">Enviar extrato</h2>
          <FormularioEnvio
            clientes={clientes.map((c) => ({
              id: c.id,
              nome: c.nomeFantasia ?? c.razaoSocial,
            }))}
            bancosSuportados={[...BANCOS_SUPORTADOS]}
          />
        </section>

        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg text-tinta">Fila de conferência</h2>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            O que não foi lido com confiança fica aqui, à parte, e{" "}
            <strong>não entra no OFX</strong> até alguém conferir. Cada linha diz
            por que caiu na fila.
          </p>

          {emConferencia.length === 0 ? (
            <p className="rounded border border-border bg-surface p-6 text-sm text-text-muted">
              Nada aguardando conferência.
            </p>
          ) : (
            <ul className="space-y-2">
              {emConferencia.map(({ extrato, lancamento }) => (
                <li
                  key={lancamento.id}
                  className="rounded-lg border border-ambar/40 bg-ambar/5 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-tinta">
                        {lancamento.historico}
                      </p>
                      <p className="mt-0.5 font-mono text-xs text-text-muted">
                        {formatarData(lancamento.data)} ·{" "}
                        {formatarReais(Number(lancamento.valor))} ·{" "}
                        {extrato.arquivoNome}
                      </p>
                      <p className="mt-1 text-xs text-ambar">
                        {lancamento.motivoConferencia}
                      </p>
                    </div>

                    <form action={aprovarLancamento}>
                      <input
                        type="hidden"
                        name="lancamentoId"
                        value={lancamento.id}
                      />
                      <button
                        type="submit"
                        className="rounded border border-turquesa px-3 py-1.5 text-xs font-medium text-turquesa transition-colors hover:bg-turquesa hover:text-white"
                      >
                        Conferi — pode entrar no OFX
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="mb-4 text-lg text-tinta">Extratos importados</h2>

          {extratos.length === 0 ? (
            <p className="rounded border border-border bg-surface p-6 text-sm text-text-muted">
              Nenhum extrato importado ainda. Envie um arquivo acima.
            </p>
          ) : (
            <ul className="space-y-4">
              {extratos.map((extrato) => {
                const naFila = extrato.lancamentos.filter(
                  (l) => l.confianca !== "ALTA" && !l.conferido,
                ).length;
                const diferenca = extrato.diferencaSaldo
                  ? Number(extrato.diferencaSaldo)
                  : 0;

                return (
                  <li
                    key={extrato.id}
                    className="rounded-lg border border-border bg-surface p-5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium text-tinta">
                          {extrato.cliente.nomeFantasia ??
                            extrato.cliente.razaoSocial}{" "}
                          <span className="font-mono text-xs text-text-muted">
                            · {extrato.arquivoNome}
                          </span>
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-text-muted">
                          {extrato.banco ?? "banco não identificado"}
                          {extrato.parserUsado
                            ? ` · lido pelo parser ${extrato.parserUsado}`
                            : extrato.origemLeitura === "IA"
                              ? " · lido por interpretação"
                              : ""}
                          {extrato.competenciaInicio && extrato.competenciaFim
                            ? ` · ${formatarData(extrato.competenciaInicio)} a ${formatarData(extrato.competenciaFim)}`
                            : ""}
                        </p>
                      </div>

                      <div className="text-right">
                        <p className="font-mono text-sm text-tinta">
                          {extrato.lancamentos.length} lançamento(s)
                        </p>
                        {naFila > 0 ? (
                          <p className="font-mono text-xs text-ambar">
                            {naFila} em conferência
                          </p>
                        ) : null}
                      </div>
                    </div>

                    {extrato.erro ? (
                      <p className="mt-3 rounded border border-carmim/40 bg-carmim/10 p-3 text-xs text-carmim">
                        {extrato.erro}
                      </p>
                    ) : null}

                    {diferenca !== 0 ? (
                      <p className="mt-3 rounded border border-carmim/40 bg-carmim/10 p-3 text-xs text-carmim">
                        A soma dos lançamentos difere do saldo declarado em{" "}
                        <strong className="font-mono">
                          {formatarReais(diferenca)}
                        </strong>
                        . O OFX não é gerado enquanto isso não fechar — entregar
                        um arquivo errado é pior do que não entregar.
                      </p>
                    ) : null}

                    {extrato.lancamentos.length > 0 ? (
                      <details className="mt-3">
                        <summary className="cursor-pointer text-xs text-turquesa">
                          ver os lançamentos lidos
                        </summary>
                        <div className="mt-2 max-h-80 overflow-auto rounded border border-border">
                          <table className="w-full min-w-[36rem] border-collapse text-sm">
                            <thead className="sticky top-0 bg-nevoa">
                              <tr className="text-left text-[11px] tracking-wide text-text-muted uppercase">
                                <th className="px-3 py-2 font-medium">Data</th>
                                <th className="px-3 py-2 font-medium">Histórico</th>
                                <th className="px-3 py-2 text-right font-medium">
                                  Valor
                                </th>
                                <th className="px-3 py-2 font-medium">Confiança</th>
                              </tr>
                            </thead>
                            <tbody>
                              {extrato.lancamentos.map((lancamento) => (
                                <tr
                                  key={lancamento.id}
                                  className="border-t border-border/60"
                                >
                                  <td className="px-3 py-1.5 font-mono text-xs whitespace-nowrap">
                                    {formatarData(lancamento.data)}
                                  </td>
                                  <td className="px-3 py-1.5 text-xs">
                                    {lancamento.historico}
                                  </td>
                                  <td
                                    className={`px-3 py-1.5 text-right font-mono text-xs ${
                                      Number(lancamento.valor) < 0
                                        ? "text-carmim"
                                        : "text-tinta"
                                    }`}
                                  >
                                    {formatarReais(Number(lancamento.valor))}
                                  </td>
                                  <td className="px-3 py-1.5">
                                    <span
                                      className={`inline-block rounded border px-1.5 py-0.5 font-mono text-[10px] ${
                                        ESTILO_CONFIANCA[lancamento.confianca]
                                      }`}
                                    >
                                      {lancamento.conferido
                                        ? "CONFERIDO"
                                        : lancamento.confianca}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </details>
                    ) : null}

                    <p className="mt-3">
                      <Link
                        href={`/modulos/sc-01/${extrato.id}/ofx`}
                        className="text-xs text-turquesa hover:underline"
                        prefetch={false}
                      >
                        baixar o OFX
                      </Link>
                    </p>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="mb-4 text-lg text-tinta">Execuções deste módulo</h2>
          <HistoricoExecucoes execucoes={execucoes} />
        </section>
      </main>
    </>
  );
}
