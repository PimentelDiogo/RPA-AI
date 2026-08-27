import { beforeEach, describe, expect, it, vi } from "vitest";

import { Disparo, StatusItem } from "@/generated/prisma/enums";
import type { HandlerModulo } from "@/lib/execucao/motor";
import { bancoFake } from "./setup";

/**
 * O registro de handlers é dublado: aqui se testa o agendador, não os módulos.
 * Assim o tick pode ser exercitado de ponta a ponta antes de a primeira
 * automação existir.
 */
const handlers = new Map<string, HandlerModulo>();

vi.mock("@/modules/registro", () => ({
  handlerDoModulo: (codigo: string) => handlers.get(codigo),
  moduloTemHandler: (codigo: string) => handlers.has(codigo),
}));

const { executarTick } = await import("@/lib/agendamento/tick");

/** 26/08/2026, 10h em São Paulo. */
const AGORA = new Date("2026-08-26T13:00:00.000Z");
const VENCIDO = new Date("2026-08-26T11:00:00.000Z");

beforeEach(() => {
  handlers.clear();
});

describe("tick do agendador", () => {
  it("não faz nada quando não há janela vencida — o caso normal", async () => {
    bancoFake.agendamentos.push({
      modulo: "SC-20",
      cron: "0 8 * * *",
      ativo: true,
      proximaExecucaoEm: new Date("2026-08-27T11:00:00.000Z"),
    });

    const resultado = await executarTick(AGORA);

    expect(resultado.executados).toHaveLength(0);
    expect(bancoFake.execucoes).toHaveLength(0);
  });

  it("executa o módulo vencido sem pessoa por trás", async () => {
    handlers.set("SC-20", async (contexto) => {
      await contexto.registrarItem({
        referencia: "Trigo de Ouro",
        status: StatusItem.SUCESSO,
      });
      return { resumo: "1 certificado" };
    });

    bancoFake.agendamentos.push({
      modulo: "SC-20",
      cron: "0 8 * * *",
      ativo: true,
      proximaExecucaoEm: VENCIDO,
    });

    const resultado = await executarTick(AGORA);

    expect(resultado.executados).toHaveLength(1);
    expect(resultado.executados[0]).toMatchObject({
      modulo: "SC-20",
      status: "SUCESSO",
    });

    const execucao = bancoFake.execucoes[0];
    expect(execucao.disparo).toBe(Disparo.AGENDADO);
    expect(execucao.disparadoPorId).toBeNull();
  });

  it("reagenda a janela depois de executar", async () => {
    handlers.set("SC-20", async () => {});
    bancoFake.agendamentos.push({
      modulo: "SC-20",
      cron: "0 8 * * *",
      ativo: true,
      proximaExecucaoEm: VENCIDO,
    });

    await executarTick(AGORA);

    const agendamento = bancoFake.agendamentos[0];
    expect(agendamento.proximaExecucaoEm).toEqual(
      new Date("2026-08-27T11:00:00.000Z"),
    );
    expect(agendamento.ultimaExecucaoEm).toEqual(AGORA);
  });

  it("avança a janela mesmo sem handler, para o vencido não se acumular", async () => {
    // Sem isto, um módulo agendado e ainda não implementado apareceria vencido
    // em todo tick, para sempre, escondendo os vencimentos de verdade.
    bancoFake.agendamentos.push({
      modulo: "SC-05",
      cron: "0 7 * * *",
      ativo: true,
      proximaExecucaoEm: VENCIDO,
    });

    const resultado = await executarTick(AGORA);

    expect(resultado.executados).toHaveLength(0);
    expect(resultado.ignorados[0]).toMatchObject({
      modulo: "SC-05",
      motivo: "módulo ainda não implementado",
    });
    expect(bancoFake.agendamentos[0].proximaExecucaoEm).toEqual(
      new Date("2026-08-27T10:00:00.000Z"),
    );
    // Não executou, então não marca última execução.
    expect(bancoFake.agendamentos[0].ultimaExecucaoEm).toBeUndefined();
  });

  it("programa a primeira janela de um agendamento novo sem disparar", async () => {
    handlers.set("SC-20", async () => {});
    bancoFake.agendamentos.push({
      modulo: "SC-20",
      cron: "0 8 * * *",
      ativo: true,
      proximaExecucaoEm: null,
    });

    const resultado = await executarTick(AGORA);

    expect(resultado.executados).toHaveLength(0);
    expect(bancoFake.agendamentos[0].proximaExecucaoEm).toEqual(
      new Date("2026-08-27T11:00:00.000Z"),
    );
  });

  it("um módulo que falha não impede os outros de rodar", async () => {
    handlers.set("SC-02", async () => {
      throw new Error("portal fora do ar");
    });
    handlers.set("SC-20", async () => ({ resumo: "rodou" }));

    bancoFake.agendamentos.push(
      {
        modulo: "SC-02",
        cron: "0 6 * * *",
        ativo: true,
        proximaExecucaoEm: VENCIDO,
      },
      {
        modulo: "SC-20",
        cron: "0 8 * * *",
        ativo: true,
        proximaExecucaoEm: VENCIDO,
      },
    );

    const resultado = await executarTick(AGORA);

    expect(resultado.executados).toHaveLength(2);
    expect(resultado.executados.map((e) => e.status)).toEqual([
      "FALHA",
      "SUCESSO",
    ]);
  });
});
