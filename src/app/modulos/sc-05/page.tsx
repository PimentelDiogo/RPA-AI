import { BotaoExecutar } from "@/components/botao-executar";
import { Cabecalho } from "@/components/cabecalho";
import { HistoricoExecucoes } from "@/components/historico-execucoes";
import type { EstadoBloqueio, StatusPasso } from "@/generated/prisma/enums";
import { exigirAcessoAoModulo } from "@/lib/auth/permissoes";
import { prisma } from "@/lib/db";
import { formatarDataHora } from "@/lib/formato";
import {
  MARCADOR_DE_BLOQUEIO,
  PASSOS_DO_BLOQUEIO,
} from "@/modules/sc-05/adapters/sistemas-mock";
import {
  alternarFalha,
  retomarSequencia,
  reverterSequencia,
  verificarConsistencia,
} from "./acoes";
import { AcaoDeBloqueio } from "./painel-cliente";

export const metadata = {
  title: "SC-05 · Bloqueio e desbloqueio de inadimplentes",
};

const ESTILO_ESTADO: Record<EstadoBloqueio, string> = {
  LIVRE: "border-turquesa/40 bg-turquesa/10 text-turquesa",
  BLOQUEADO: "border-grafite/40 bg-nevoa text-grafite",
  PARCIAL: "border-ambar/50 bg-ambar/10 text-ambar",
  REVERTENDO: "border-ambar/50 bg-ambar/10 text-ambar",
};

const ROTULO_ESTADO: Record<EstadoBloqueio, string> = {
  LIVRE: "Livre",
  BLOQUEADO: "Bloqueado",
  PARCIAL: "Parcial — precisa de decisão",
  REVERTENDO: "Revertendo",
};

const ESTILO_PASSO: Record<StatusPasso, string> = {
  APLICADO: "text-turquesa",
  FALHOU: "text-carmim",
  PENDENTE: "text-text-muted",
  COMPENSADO: "text-grafite",
};

export default async function ModuloSc05() {
  const { sessao, modulo } = await exigirAcessoAoModulo("SC-05");

  const [clientes, falhas, execucoes, agendamento] = await Promise.all([
    prisma.cliente.findMany({
      where: { ativo: true },
      select: {
        id: true,
        razaoSocial: true,
        nomeFantasia: true,
        bloqueio: true,
        financeiro: true,
        acessoPortal: true,
        tarefas: { where: { concluida: false }, orderBy: { titulo: "asc" } },
        sagas: {
          orderBy: { criadaEm: "desc" },
          take: 2,
          include: { passos: { orderBy: { ordem: "asc" } } },
        },
      },
      orderBy: { razaoSocial: "asc" },
      take: 8,
    }),
    prisma.falhaSimulada.findMany(),
    prisma.execucao.findMany({
      where: { modulo: "SC-05" },
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
    prisma.agendamento.findUnique({ where: { modulo: "SC-05" } }),
  ]);

  const falhaPorSistema = new Map(falhas.map((f) => [f.sistema, f.falhar]));

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
                Verificação de consistência: {agendamento.cron} ·{" "}
                {agendamento.proximaExecucaoEm
                  ? `próxima ${formatarDataHora(agendamento.proximaExecucaoEm)}`
                  : "primeira janela ainda não programada"}
              </p>
            ) : null}
          </div>

          <BotaoExecutar
            acao={verificarConsistencia}
            rotulo="Verificar consistência"
            ondeVerResultado="Os estados dos clientes, nesta mesma tela, e o detalhe da execução, que aponta cliente por cliente onde o registro e os sistemas divergem."
          />
        </header>

        {/* ---------------------------------------------------------------- */}
        <section className="rounded-lg border border-border bg-nevoa/40 p-5">
          <h2 className="text-sm font-medium text-tinta">
            Simular sistema fora do ar
          </h2>
          <p className="mt-1 text-xs text-text-muted">
            Ligue a falha num sistema e dispare um bloqueio: a sequência para no
            meio, mostra o que já foi aplicado e pede decisão. É o problema que o
            processo manual produz — <em>&ldquo;sempre sobra um sistema em que o
            bloqueio não foi aplicado&rdquo;</em> — reproduzido de propósito.
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {PASSOS_DO_BLOQUEIO.map((passo) => {
              const falhando = falhaPorSistema.get(passo.sistema) ?? false;

              return (
                <form key={passo.sistema} action={alternarFalha}>
                  <input type="hidden" name="sistema" value={passo.sistema} />
                  <input
                    type="hidden"
                    name="falhar"
                    value={falhando ? "nao" : "sim"}
                  />
                  <button
                    type="submit"
                    className={`rounded border px-3 py-1.5 font-mono text-xs transition-colors ${
                      falhando
                        ? "border-carmim/50 bg-carmim/10 text-carmim"
                        : "border-border bg-surface text-text-muted hover:border-turquesa"
                    }`}
                  >
                    {passo.sistema}: {falhando ? "fora do ar" : "no ar"}
                  </button>
                </form>
              );
            })}
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section className="space-y-4">
          <h2 className="text-lg text-tinta">Clientes</h2>

          {clientes.map((cliente) => {
            const estado = cliente.bloqueio?.estado ?? "LIVRE";
            const nome = cliente.nomeFantasia ?? cliente.razaoSocial;
            const ultimaSaga = cliente.sagas[0];

            return (
              <article
                key={cliente.id}
                className="rounded-lg border border-border bg-surface p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="text-base text-tinta">{nome}</h3>
                    {cliente.bloqueio?.motivo ? (
                      <p className="mt-0.5 text-xs text-text-muted">
                        Motivo: {cliente.bloqueio.motivo}
                      </p>
                    ) : null}
                  </div>

                  <span
                    className={`rounded border px-2 py-0.5 font-mono text-[11px] ${ESTILO_ESTADO[estado]}`}
                  >
                    {ROTULO_ESTADO[estado]}
                  </span>
                </div>

                {/* Estado dos três sistemas, lado a lado */}
                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <Sistema
                    nome="Sistema Financeiro"
                    situacao={
                      cliente.financeiro?.inadimplente
                        ? "Marcado como inadimplente"
                        : "Sem marcação"
                    }
                    aplicado={Boolean(cliente.financeiro?.inadimplente)}
                  />
                  <Sistema
                    nome="Portal do Cliente"
                    situacao={
                      cliente.acessoPortal?.ativo === false
                        ? "Acesso revogado"
                        : "Acesso liberado"
                    }
                    aplicado={cliente.acessoPortal?.ativo === false}
                  />
                  <Sistema
                    nome="Sistema de Tarefas"
                    situacao={
                      cliente.tarefas.length === 0
                        ? "Sem tarefas abertas"
                        : cliente.tarefas.every(
                              (t) => t.responsavel === MARCADOR_DE_BLOQUEIO,
                            )
                          ? `${cliente.tarefas.length} tarefa(s) com o marcador`
                          : `${cliente.tarefas.length} tarefa(s) com responsável normal`
                    }
                    aplicado={
                      cliente.tarefas.length > 0 &&
                      cliente.tarefas.every(
                        (t) => t.responsavel === MARCADOR_DE_BLOQUEIO,
                      )
                    }
                  />
                </div>

                {/* A prova de que o cliente NÃO foi desativado */}
                {cliente.tarefas.length > 0 ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-turquesa">
                      ver as tarefas ({cliente.tarefas.length})
                    </summary>
                    <ul className="mt-2 space-y-1">
                      {cliente.tarefas.map((tarefa) => (
                        <li
                          key={tarefa.id}
                          className="rounded border border-border bg-nevoa/50 px-3 py-1.5 text-xs"
                        >
                          <span className="text-tinta">{tarefa.titulo}</span>
                          <span className="text-text-muted"> — responsável: </span>
                          <span
                            className={
                              tarefa.responsavel === MARCADOR_DE_BLOQUEIO
                                ? "text-ambar"
                                : "text-tinta"
                            }
                          >
                            {tarefa.responsavel}
                          </span>
                          {tarefa.responsavelOriginal ? (
                            <span className="text-text-muted">
                              {" "}
                              (original guardado: {tarefa.responsavelOriginal})
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-text-muted">
                      O cliente <strong>não é desativado</strong> aqui: as tarefas
                      continuam existindo e o responsável original fica guardado,
                      tarefa por tarefa — a maioria renegocia depois, e recriar o
                      histórico daria mais trabalho.
                    </p>
                  </details>
                ) : null}

                {/* Falha parcial: nada é decidido sozinho */}
                {estado === "PARCIAL" ? (
                  <div className="mt-4 rounded border border-ambar/50 bg-ambar/10 p-3">
                    <p className="text-xs text-ambar">
                      A sequência parou no meio. Parte dos sistemas foi alterada e
                      parte não. Nada foi decidido sozinho — escolha o que fazer.
                    </p>
                    <div className="mt-2 flex gap-2">
                      <form action={retomarSequencia}>
                        <input type="hidden" name="clienteId" value={cliente.id} />
                        <button
                          type="submit"
                          className="rounded bg-brand px-3 py-1.5 text-xs font-semibold text-brand-contrast hover:bg-turquesa"
                        >
                          Retomar de onde parou
                        </button>
                      </form>
                      <form action={reverterSequencia}>
                        <input type="hidden" name="clienteId" value={cliente.id} />
                        <button
                          type="submit"
                          className="rounded border border-border px-3 py-1.5 text-xs hover:border-carmim hover:text-carmim"
                        >
                          Reverter o que foi aplicado
                        </button>
                      </form>
                    </div>
                  </div>
                ) : (
                  <AcaoDeBloqueio
                    clienteId={cliente.id}
                    bloqueado={estado === "BLOQUEADO"}
                  />
                )}

                {/* Linha do tempo da última sequência */}
                {ultimaSaga ? (
                  <details className="mt-4">
                    <summary className="cursor-pointer text-xs text-turquesa">
                      linha do tempo —{" "}
                      {ultimaSaga.direcao === "BLOQUEIO"
                        ? "bloqueio"
                        : "desbloqueio"}{" "}
                      de {formatarDataHora(ultimaSaga.criadaEm)}
                    </summary>
                    <ol className="mt-2 space-y-1">
                      {ultimaSaga.passos.map((passo) => (
                        <li
                          key={passo.id}
                          className="rounded border border-border bg-nevoa/40 px-3 py-1.5 text-xs"
                        >
                          <span className="font-mono text-[10px] text-text-muted">
                            {passo.ordem}.
                          </span>{" "}
                          <span className="text-tinta">{passo.sistema}</span>
                          <span className="text-text-muted"> — {passo.acao}</span>
                          <span className={`ml-2 font-mono text-[10px] ${ESTILO_PASSO[passo.status]}`}>
                            {passo.status}
                          </span>
                          {passo.concluidoEm ? (
                            <span className="ml-2 font-mono text-[10px] text-text-muted">
                              {formatarDataHora(passo.concluidoEm)}
                            </span>
                          ) : null}
                          {passo.erro ? (
                            <p className="mt-1 text-[11px] text-carmim">
                              {passo.erro}
                            </p>
                          ) : null}
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </article>
            );
          })}
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

function Sistema({
  nome,
  situacao,
  aplicado,
}: {
  nome: string;
  situacao: string;
  aplicado: boolean;
}) {
  return (
    <div
      className={`rounded border p-3 ${
        aplicado
          ? "border-grafite/40 bg-nevoa"
          : "border-turquesa/30 bg-turquesa/5"
      }`}
    >
      <p className="font-mono text-[10px] tracking-wide text-text-muted uppercase">
        {nome}
      </p>
      <p className={`mt-1 text-xs ${aplicado ? "text-grafite" : "text-turquesa"}`}>
        {situacao}
      </p>
    </div>
  );
}
