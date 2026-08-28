import { BotaoExecutar } from "@/components/botao-executar";
import { Cabecalho } from "@/components/cabecalho";
import { HistoricoExecucoes } from "@/components/historico-execucoes";
import type { SituacaoApurada } from "@/generated/prisma/enums";
import { exigirAcessoAoModulo } from "@/lib/auth/permissoes";
import { prisma } from "@/lib/db";
import { formatarCnpj, formatarDataHora, formatarDuracao } from "@/lib/formato";
import {
  carregarPainelFiscal,
  carregarTentativas,
  type Celula,
} from "@/modules/sc-02/consultas";
import { ORGAOS_ATIVOS, ROTULO_ORGAO } from "@/modules/sc-02/orgaos";
import { consultarAgora } from "./acoes";

export const metadata = {
  title: "SC-02 · Painel de situação fiscal",
};

const ESTILO_SITUACAO: Record<SituacaoApurada, string> = {
  REGULAR: "border-turquesa/40 bg-turquesa/10 text-turquesa",
  IRREGULAR: "border-ambar/50 bg-ambar/10 text-ambar",
  INDISPONIVEL: "border-border bg-nevoa text-grafite",
};

const ROTULO_SITUACAO: Record<SituacaoApurada, string> = {
  REGULAR: "Regular",
  IRREGULAR: "Irregular",
  INDISPONIVEL: "Indisponível",
};

function idade(dias: number): string {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "há 1 dia";
  return `há ${dias} dias`;
}

export default async function ModuloSc02() {
  const { sessao, modulo } = await exigirAcessoAoModulo("SC-02");

  const [painel, tentativas, execucoes, agendamento] = await Promise.all([
    carregarPainelFiscal(),
    carregarTentativas(),
    prisma.execucao.findMany({
      where: { modulo: "SC-02" },
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
    prisma.agendamento.findUnique({ where: { modulo: "SC-02" } }),
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

          <BotaoExecutar
            acao={consultarAgora}
            rotulo="Consultar agora"
            ondeVerResultado="Os cartões, a lista de irregulares, a faixa “não conseguimos consultar” e as tentativas registradas, nesta mesma tela, já refletem esta rodada."
          />
        </header>

        {/* ---------------------------------------------------------------- */}
        <section className="grid gap-3 sm:grid-cols-4">
          <Cartao
            numero={painel.contagem.regular}
            rotulo="regulares"
            classe="border-turquesa/40 bg-turquesa/10 text-turquesa"
          />
          <Cartao
            numero={painel.contagem.irregular}
            rotulo="irregulares"
            classe="border-ambar/50 bg-ambar/10 text-ambar"
          />
          <Cartao
            numero={painel.falhas.length}
            rotulo="sem resposta do órgão"
            classe="border-carmim/40 bg-carmim/10 text-carmim"
          />
          <Cartao
            numero={painel.contagem.nuncaConsultado}
            rotulo="nunca consultados"
            classe="border-border bg-nevoa text-grafite"
          />
        </section>

        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg text-tinta">Quem está irregular</h2>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            Em qual órgão e há quanto tempo. Ordenado pelo mais antigo — a
            planilha de hoje nasce vencida justamente por não mostrar isso.
          </p>

          {painel.irregulares.length === 0 ? (
            <p className="rounded border border-border bg-surface p-6 text-sm text-text-muted">
              Nenhuma irregularidade conhecida.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-border bg-surface">
              <table className="w-full min-w-[42rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs tracking-wide text-text-muted uppercase">
                    <th className="px-4 py-3 font-medium">Cliente</th>
                    <th className="px-4 py-3 font-medium">Órgão</th>
                    <th className="px-4 py-3 font-medium">Pendência</th>
                    <th className="px-4 py-3 font-medium">Verificado</th>
                  </tr>
                </thead>
                <tbody>
                  {painel.irregulares.map((linha, indice) => (
                    <tr
                      key={`${linha.clienteId}-${linha.orgao}`}
                      className={`border-b border-border/60 last:border-0 ${
                        indice % 2 === 1 ? "bg-nevoa/50" : ""
                      }`}
                    >
                      <td className="px-4 py-3">{linha.nome}</td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {ROTULO_ORGAO[linha.orgao]}
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {linha.detalhe ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs whitespace-nowrap">
                        {idade(linha.diasDeIdade)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg text-tinta">Não conseguimos consultar</h2>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            Esta faixa não some. Sem ela, ninguém saberia se o cliente está
            regular ou se o robô não conseguiu perguntar — e as duas coisas são
            diferentes.
          </p>

          {painel.falhas.length === 0 ? (
            <p className="rounded border border-border bg-surface p-6 text-sm text-text-muted">
              Todas as consultas da última rodada foram respondidas.
            </p>
          ) : (
            <ul className="space-y-2">
              {painel.falhas.map((falha) => (
                <li
                  key={`${falha.clienteId}-${falha.orgao}`}
                  className="rounded-lg border border-carmim/30 bg-carmim/5 p-4"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="text-sm font-medium text-tinta">
                      {falha.nome} —{" "}
                      <span className="font-mono text-xs">
                        {ROTULO_ORGAO[falha.orgao]}
                      </span>
                    </p>
                    <span className="font-mono text-[11px] text-text-muted">
                      {formatarDataHora(falha.quando)} · {falha.tentativas}{" "}
                      tentativa(s)
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-carmim">{falha.erro}</p>
                  <p className="mt-1 text-xs text-text-muted">
                    {falha.ultimaSituacaoConhecida && falha.ultimaLeituraEm
                      ? `O que ainda se sabe: ${
                          ROTULO_SITUACAO[falha.ultimaSituacaoConhecida]
                        }, lido em ${formatarDataHora(falha.ultimaLeituraEm)}.`
                      : "Nunca houve leitura bem-sucedida deste par."}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg text-tinta">Cliente × órgão</h2>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            A grade completa, com a idade de cada leitura.
          </p>

          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs tracking-wide text-text-muted uppercase">
                  <th className="px-4 py-3 font-medium">Cliente</th>
                  {ORGAOS_ATIVOS.map((orgao) => (
                    <th key={orgao} className="px-4 py-3 font-medium">
                      {ROTULO_ORGAO[orgao]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {painel.linhas.map((linha, indice) => (
                  <tr
                    key={linha.clienteId}
                    className={`border-b border-border/60 last:border-0 ${
                      indice % 2 === 1 ? "bg-nevoa/50" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      {linha.nome}
                      <span className="block font-mono text-[11px] text-text-muted">
                        {formatarCnpj(linha.cnpj)}
                      </span>
                    </td>
                    {ORGAOS_ATIVOS.map((orgao) => (
                      <td key={orgao} className="px-4 py-3">
                        <CelulaSituacao celula={linha.celulas[orgao]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-lg text-tinta">Tentativas registradas</h2>
          <p className="mt-1 mb-4 text-sm text-text-muted">
            Toda tentativa fica guardada, com hora, órgão e erro — inclusive as
            que foram refeitas e deram certo na segunda vez.
          </p>

          {tentativas.length === 0 ? (
            <p className="rounded border border-border bg-surface p-6 text-sm text-text-muted">
              Nenhuma consulta feita ainda. Clique em{" "}
              <strong>Consultar agora</strong>.
            </p>
          ) : (
            <div className="max-h-96 overflow-auto rounded-lg border border-border bg-surface">
              <table className="w-full min-w-[46rem] border-collapse text-sm">
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-border text-left text-xs tracking-wide text-text-muted uppercase">
                    <th className="px-4 py-2 font-medium">Quando</th>
                    <th className="px-4 py-2 font-medium">Cliente</th>
                    <th className="px-4 py-2 font-medium">Órgão</th>
                    <th className="px-4 py-2 font-medium">#</th>
                    <th className="px-4 py-2 font-medium">Resultado</th>
                    <th className="px-4 py-2 font-medium">Origem</th>
                    <th className="px-4 py-2 text-right font-medium">Duração</th>
                  </tr>
                </thead>
                <tbody>
                  {tentativas.map((t) => (
                    <tr key={t.id} className="border-b border-border/60 last:border-0">
                      <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">
                        {formatarDataHora(t.iniciadaEm)}
                      </td>
                      <td className="px-4 py-2">{t.cliente}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {ROTULO_ORGAO[t.orgao]}
                      </td>
                      <td className="px-4 py-2 font-mono text-xs">{t.tentativa}</td>
                      <td className="px-4 py-2 text-xs">
                        {t.sucesso ? (
                          <span className="text-turquesa">
                            {t.situacao ? ROTULO_SITUACAO[t.situacao] : "OK"}
                          </span>
                        ) : (
                          <span className="text-carmim">{t.erro}</span>
                        )}
                      </td>
                      <td className="px-4 py-2 font-mono text-[11px] text-text-muted">
                        {t.origem}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {formatarDuracao(t.duracaoMs)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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

function Cartao({
  numero,
  rotulo,
  classe,
}: {
  numero: number;
  rotulo: string;
  classe: string;
}) {
  return (
    <div className={`rounded-lg border p-4 ${classe}`}>
      <p className="font-display text-3xl leading-none font-bold">{numero}</p>
      <p className="mt-1 text-xs">{rotulo}</p>
    </div>
  );
}

function CelulaSituacao({ celula }: { celula: Celula }) {
  if (celula.estado === "nunca-consultado") {
    return (
      <span className="font-mono text-[11px] text-text-muted">
        nunca consultado
      </span>
    );
  }

  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={`inline-block w-fit rounded border px-2 py-0.5 font-mono text-[11px] whitespace-nowrap ${
          ESTILO_SITUACAO[celula.situacao]
        }`}
      >
        {ROTULO_SITUACAO[celula.situacao]}
      </span>
      <span className="font-mono text-[10px] text-text-muted">
        {idade(celula.diasDeIdade)}
      </span>
    </div>
  );
}
