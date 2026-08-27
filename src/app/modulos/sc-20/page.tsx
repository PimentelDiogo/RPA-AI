import { Cabecalho } from "@/components/cabecalho";
import { HistoricoExecucoes } from "@/components/historico-execucoes";
import { FaixaVencimento } from "@/generated/prisma/enums";
import { exigirAcessoAoModulo } from "@/lib/auth/permissoes";
import { prisma } from "@/lib/db";
import { formatarData, formatarDataHora } from "@/lib/formato";
import { JANELAS_PERMITIDAS } from "@/modules/sc-20/configuracao";
import {
  carregarAvisos,
  carregarPainel,
  type LinhaPainel,
} from "@/modules/sc-20/consultas";
import { ORDEM_FAIXA, ROTULO_FAIXA } from "@/modules/sc-20/regua";
import { alterarJanela, executarAgora } from "./acoes";

export const metadata = {
  title: "SC-20 · Vencimento de certificado digital",
};

const ESTILO_FAIXA: Record<FaixaVencimento, string> = {
  VENCIDO: "border-carmim/40 bg-carmim/10 text-carmim",
  ATE_15: "border-ambar/50 bg-ambar/10 text-ambar",
  ATE_30: "border-ambar/40 bg-ambar/5 text-ambar",
  ATE_60: "border-border bg-nevoa text-grafite",
};

export default async function ModuloSc20() {
  const { sessao, modulo } = await exigirAcessoAoModulo("SC-20");

  const [painel, avisos, execucoes, agendamento] = await Promise.all([
    carregarPainel(),
    carregarAvisos(),
    prisma.execucao.findMany({
      where: { modulo: "SC-20" },
      orderBy: { iniciadaEm: "desc" },
      take: 20,
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
    prisma.agendamento.findUnique({ where: { modulo: "SC-20" } }),
  ]);

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
                Agendado: {agendamento.cron} ·{" "}
                {agendamento.proximaExecucaoEm
                  ? `próxima ${formatarDataHora(agendamento.proximaExecucaoEm)}`
                  : "primeira janela ainda não programada"}
              </p>
            ) : null}
          </div>

          <form action={executarAgora}>
            <button
              type="submit"
              className="rounded bg-brand px-4 py-2.5 text-sm font-semibold text-brand-contrast transition-colors hover:bg-turquesa"
            >
              Executar agora
            </button>
          </form>
        </header>

        {/* ---------------------------------------------------------------- */}
        <section>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-lg text-tinta">
              Próximos {painel.janelaDias} dias
            </h2>
            {sessao.user.perfil === "ADMIN" ? (
              <form action={alterarJanela} className="flex items-center gap-2">
                <label className="text-xs text-text-muted" htmlFor="janelaDias">
                  Janela de alerta
                </label>
                <select
                  id="janelaDias"
                  name="janelaDias"
                  defaultValue={painel.janelaDias}
                  className="rounded border border-border bg-surface px-2 py-1 text-xs"
                >
                  {JANELAS_PERMITIDAS.map((dias) => (
                    <option key={dias} value={dias}>
                      {dias} dias
                    </option>
                  ))}
                </select>
                <button
                  type="submit"
                  className="rounded border border-border px-2 py-1 text-xs transition-colors hover:border-turquesa hover:text-turquesa"
                >
                  Aplicar
                </button>
              </form>
            ) : null}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-4">
            {ORDEM_FAIXA.map((faixa) => (
              <div
                key={faixa}
                className={`rounded-lg border p-4 ${ESTILO_FAIXA[faixa]}`}
              >
                <p className="font-display text-3xl leading-none font-bold">
                  {painel.contagem[faixa]}
                </p>
                <p className="mt-1 text-xs">{ROTULO_FAIXA[faixa]}</p>
              </div>
            ))}
          </div>

          <p className="mt-2 text-xs text-text-muted">
            {painel.foraDaJanela} certificado(s) fora da janela não aparecem aqui.
          </p>

          <div className="mt-4">
            <TabelaCertificados linhas={painel.linhas} />
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg text-tinta">O que mudou desde o último aviso</h2>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            Aviso repetido vira ruído. Aqui está só o que é novidade: certificado
            que entrou na janela agora, ou que trocou de faixa desde a última
            comunicação.
          </p>

          {painel.novidades.length === 0 ? (
            <p className="rounded border border-border bg-surface p-6 text-sm text-text-muted">
              Nada mudou desde o último aviso. A próxima execução não vai
              comunicar nada — e é assim que deve ser.
            </p>
          ) : (
            <TabelaCertificados linhas={painel.novidades} mostrarMotivo />
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg text-tinta">Histórico de avisos</h2>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            Quem foi avisado, quando e do quê. As supressões aparecem marcadas —
            não escondidas: sem elas ninguém sabe se o sistema calou por decisão
            ou por falha.
          </p>

          {avisos.length === 0 ? (
            <p className="rounded border border-border bg-surface p-6 text-sm text-text-muted">
              Nenhum aviso registrado ainda. Clique em{" "}
              <strong>Executar agora</strong> para gerar a primeira rodada.
            </p>
          ) : (
            <ul className="space-y-2">
              {avisos.map((aviso) => (
                <li
                  key={aviso.id}
                  className={`rounded-lg border p-4 ${
                    aviso.suprimido
                      ? "border-border bg-nevoa/60"
                      : "border-border bg-surface"
                  }`}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-tinta">
                      {aviso.certificado}
                    </p>
                    <span className="font-mono text-[11px] text-text-muted">
                      {formatarDataHora(aviso.registradoEm)}
                    </span>
                  </div>

                  {aviso.suprimido ? (
                    <p className="mt-2 text-xs text-grafite">
                      <span className="font-mono uppercase">Suprimido</span> —{" "}
                      {aviso.motivoSupressao}
                    </p>
                  ) : (
                    <>
                      <p className="mt-1 text-xs text-text-muted">
                        Para {aviso.destinatario} · {ROTULO_FAIXA[aviso.faixa]}
                      </p>
                      <pre className="mt-2 overflow-x-auto rounded bg-nevoa p-3 font-mono text-[11px] whitespace-pre-wrap text-tinta">
                        {aviso.conteudo}
                      </pre>
                    </>
                  )}
                </li>
              ))}
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

function TabelaCertificados({
  linhas,
  mostrarMotivo = false,
}: {
  linhas: LinhaPainel[];
  mostrarMotivo?: boolean;
}) {
  if (linhas.length === 0) {
    return (
      <p className="rounded border border-border bg-surface p-6 text-sm text-text-muted">
        Nenhum certificado nesta janela.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-surface">
      <table className="w-full min-w-[46rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs tracking-wide text-text-muted uppercase">
            <th className="px-4 py-3 font-medium">Cliente</th>
            <th className="px-4 py-3 font-medium">Titular</th>
            <th className="px-4 py-3 font-medium">Tipo</th>
            <th className="px-4 py-3 font-medium">Emissor</th>
            <th className="px-4 py-3 font-medium">Validade</th>
            <th className="px-4 py-3 text-right font-medium">Dias restantes</th>
            <th className="px-4 py-3 font-medium">
              {mostrarMotivo ? "Novidade" : "Situação"}
            </th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((linha, indice) => (
            <tr
              key={linha.id}
              className={`border-b border-border/60 last:border-0 ${
                indice % 2 === 1 ? "bg-nevoa/50" : ""
              }`}
            >
              <td className="px-4 py-3">
                {linha.cliente}
                {!linha.temContato ? (
                  <span
                    className="ml-2 font-mono text-[10px] text-carmim uppercase"
                    title="Sem contato cadastrado: não há para quem avisar"
                  >
                    sem contato
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-text-muted">{linha.titular}</td>
              <td className="px-4 py-3 font-mono text-xs">{linha.tipo}</td>
              <td className="px-4 py-3 text-text-muted">{linha.emissor}</td>
              <td className="px-4 py-3 font-mono text-xs">
                {formatarData(linha.validade)}
              </td>
              <td
                className={`px-4 py-3 text-right font-mono text-sm ${
                  linha.dias < 0 ? "font-semibold text-carmim" : ""
                }`}
              >
                {linha.dias < 0 ? `${Math.abs(linha.dias)} atrás` : linha.dias}
              </td>
              <td className="px-4 py-3">
                {mostrarMotivo ? (
                  <span className="text-xs text-text-muted">
                    {linha.faixaAvisada === null
                      ? "nunca avisado"
                      : `avisado como ${ROTULO_FAIXA[linha.faixaAvisada]}`}
                  </span>
                ) : (
                  <span
                    className={`inline-block rounded border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap ${ESTILO_FAIXA[linha.faixa]}`}
                  >
                    {ROTULO_FAIXA[linha.faixa]}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
