import { cronValido, proximaOcorrencia } from "@/lib/agendamento/cron";

/**
 * Decide o que está vencido. É a única regra do agendador, e é pura de
 * propósito: dá para testar cada caso sem banco, sem relógio e sem servidor.
 */

export type AgendamentoParaAvaliar = {
  modulo: string;
  cron: string;
  ativo: boolean;
  proximaExecucaoEm: Date | null;
};

export type Vencido = {
  modulo: string;
  /** Quando deveria ter rodado. Vai para o registro da execução. */
  previstaPara: Date;
};

export type Ignorado = {
  modulo: string;
  motivo: string;
};

export type Selecao = {
  vencidos: Vencido[];
  ignorados: Ignorado[];
};

/**
 * O tick roda a cada 15 minutos, então quase sempre não há nada a fazer: o
 * caminho normal desta função é devolver lista vazia.
 *
 * Agendamento sem `proximaExecucaoEm` é novo — ainda não rodou nenhuma vez.
 * Nesse caso ele **não** dispara imediatamente: apenas ganha a próxima
 * ocorrência. Disparar na hora faria toda implantação começar executando tudo.
 */
export function selecionarVencidos(
  agendamentos: AgendamentoParaAvaliar[],
  agora: Date,
): Selecao {
  const vencidos: Vencido[] = [];
  const ignorados: Ignorado[] = [];

  for (const agendamento of agendamentos) {
    if (!agendamento.ativo) {
      ignorados.push({ modulo: agendamento.modulo, motivo: "agendamento desativado" });
      continue;
    }

    if (!cronValido(agendamento.cron)) {
      ignorados.push({
        modulo: agendamento.modulo,
        motivo: `expressão cron inválida: "${agendamento.cron}"`,
      });
      continue;
    }

    if (agendamento.proximaExecucaoEm === null) {
      ignorados.push({
        modulo: agendamento.modulo,
        motivo: "primeira programação — próxima execução agendada",
      });
      continue;
    }

    if (agendamento.proximaExecucaoEm <= agora) {
      vencidos.push({
        modulo: agendamento.modulo,
        previstaPara: agendamento.proximaExecucaoEm,
      });
    }
  }

  return { vencidos, ignorados };
}

/**
 * Calcula a próxima janela depois de uma execução.
 *
 * Sempre a partir de agora, nunca a partir do horário previsto: se o portal
 * ficou fora do ar por seis horas, a retomada não pode disparar seis rodadas
 * atrasadas de uma vez. Perde-se a rodada, não se acumula fila.
 */
export function reagendar(cron: string, agora: Date): Date {
  return proximaOcorrencia(cron, agora);
}
