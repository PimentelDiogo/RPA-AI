import { Disparo } from "@/generated/prisma/enums";
import { reagendar, selecionarVencidos, type Ignorado } from "@/lib/agendamento/vencidos";
import { prisma } from "@/lib/db";
import { executarModulo } from "@/lib/execucao/motor";
import { handlerDoModulo } from "@/modules/registro";

/**
 * O tick do agendador.
 *
 * Chamado de fora, a cada 15 minutos, por um cron do GitHub Actions. É ele que
 * faz as automações rodarem "sozinhas, sem ninguém logado" — a aplicação não
 * mantém processo em segundo plano, porque numa hospedagem serverless não há
 * processo para manter.
 */

export type ResultadoTick = {
  avaliadosEm: string;
  executados: {
    modulo: string;
    execucaoId: string;
    status: string;
    duracaoMs: number;
  }[];
  ignorados: Ignorado[];
};

export async function executarTick(agora = new Date()): Promise<ResultadoTick> {
  const agendamentos = await prisma.agendamento.findMany({
    select: { modulo: true, cron: true, ativo: true, proximaExecucaoEm: true },
  });

  const { vencidos, ignorados } = selecionarVencidos(agendamentos, agora);
  const executados: ResultadoTick["executados"] = [];

  // Agendamento novo ainda não tem janela: programa a primeira sem disparar.
  for (const agendamento of agendamentos) {
    if (agendamento.ativo && agendamento.proximaExecucaoEm === null) {
      await prisma.agendamento.update({
        where: { modulo: agendamento.modulo },
        data: { proximaExecucaoEm: reagendar(agendamento.cron, agora) },
      });
    }
  }

  for (const vencido of vencidos) {
    const handler = handlerDoModulo(vencido.modulo);

    if (!handler) {
      // Módulo agendado mas ainda sem implementação. Não é erro, e a janela
      // avança do mesmo jeito — senão o tick seguinte tentaria de novo, para
      // sempre, e o vencido de hoje mascararia o de amanhã.
      ignorados.push({
        modulo: vencido.modulo,
        motivo: "módulo ainda não implementado",
      });
      await avancarJanela(vencido.modulo, agora, false);
      continue;
    }

    const execucao = await executarModulo(
      { modulo: vencido.modulo, disparo: Disparo.AGENDADO },
      handler,
    );

    await avancarJanela(vencido.modulo, agora, true);

    executados.push({
      modulo: vencido.modulo,
      execucaoId: execucao.id,
      status: execucao.status,
      duracaoMs: execucao.duracaoMs,
    });
  }

  return { avaliadosEm: agora.toISOString(), executados, ignorados };
}

async function avancarJanela(modulo: string, agora: Date, executou: boolean) {
  const agendamento = await prisma.agendamento.findUnique({
    where: { modulo },
    select: { cron: true },
  });
  if (!agendamento) return;

  await prisma.agendamento.update({
    where: { modulo },
    data: {
      proximaExecucaoEm: reagendar(agendamento.cron, agora),
      ...(executou ? { ultimaExecucaoEm: agora } : {}),
    },
  });
}
