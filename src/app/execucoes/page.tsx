import { Cabecalho } from "@/components/cabecalho";
import { HistoricoExecucoes } from "@/components/historico-execucoes";
import { exigirSessao, modulosVisiveis } from "@/lib/auth/permissoes";
import { prisma } from "@/lib/db";

export const metadata = {
  title: "Execuções · Portal SheepContabil",
};

/**
 * Histórico geral. Mostra apenas execuções dos módulos que o usuário enxerga —
 * a mesma regra de perfil da home vale aqui, senão o operador veria pela porta
 * dos fundos o que a home esconde.
 */
export default async function ExecucoesPage() {
  const sessao = await exigirSessao();
  const modulos = modulosVisiveis(sessao).map((modulo) => modulo.codigo);

  const execucoes = await prisma.execucao.findMany({
    where: { modulo: { in: modulos } },
    orderBy: { iniciadaEm: "desc" },
    take: 100,
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
  });

  return (
    <>
      <Cabecalho sessao={sessao} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
        <h1 className="text-2xl text-tinta">Execuções</h1>
        <p className="mt-1 mb-6 text-sm text-text-muted">
          As últimas execuções dos módulos disponíveis para o seu perfil.
        </p>

        <HistoricoExecucoes execucoes={execucoes} mostrarModulo />
      </main>
    </>
  );
}
