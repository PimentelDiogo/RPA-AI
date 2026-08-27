import { describe, expect, it } from "vitest";

import { cronValido, proximaOcorrencia } from "@/lib/agendamento/cron";
import { reagendar, selecionarVencidos } from "@/lib/agendamento/vencidos";

/** 26/08/2026, 10h em São Paulo (13h UTC). */
const AGORA = new Date("2026-08-26T13:00:00.000Z");

function agendamento(campos: Partial<Parameters<typeof selecionarVencidos>[0][number]> = {}) {
  return {
    modulo: "SC-20",
    cron: "0 8 * * *",
    ativo: true,
    proximaExecucaoEm: null,
    ...campos,
  };
}

describe("expressão cron", () => {
  it("resolve o horário no fuso da operação, não em UTC", () => {
    // "0 8 * * *" tem de ser 8h em São Paulo. Em agosto, isso é 11h UTC.
    const proxima = proximaOcorrencia("0 8 * * *", AGORA);
    expect(proxima.toISOString()).toBe("2026-08-27T11:00:00.000Z");
  });

  it("reconhece expressão inválida em vez de estourar mais adiante", () => {
    expect(cronValido("0 8 * * *")).toBe(true);
    expect(cronValido("todo dia de manhã")).toBe(false);
  });
});

describe("seleção do que está vencido", () => {
  it("não dispara nada quando nada venceu", () => {
    const { vencidos } = selecionarVencidos(
      [agendamento({ proximaExecucaoEm: new Date("2026-08-27T11:00:00.000Z") })],
      AGORA,
    );

    expect(vencidos).toHaveLength(0);
  });

  it("dispara o que já passou da hora", () => {
    const { vencidos } = selecionarVencidos(
      [agendamento({ proximaExecucaoEm: new Date("2026-08-26T11:00:00.000Z") })],
      AGORA,
    );

    expect(vencidos).toEqual([
      { modulo: "SC-20", previstaPara: new Date("2026-08-26T11:00:00.000Z") },
    ]);
  });

  it("não dispara agendamento novo — apenas programa a primeira janela", () => {
    // Sem isto, toda implantação começaria executando todos os módulos de uma vez.
    const { vencidos, ignorados } = selecionarVencidos(
      [agendamento({ proximaExecucaoEm: null })],
      AGORA,
    );

    expect(vencidos).toHaveLength(0);
    expect(ignorados[0].motivo).toContain("primeira programação");
  });

  it("ignora agendamento desativado", () => {
    const { vencidos, ignorados } = selecionarVencidos(
      [
        agendamento({
          ativo: false,
          proximaExecucaoEm: new Date("2026-08-01T11:00:00.000Z"),
        }),
      ],
      AGORA,
    );

    expect(vencidos).toHaveLength(0);
    expect(ignorados[0].motivo).toBe("agendamento desativado");
  });

  it("ignora cron inválido sem derrubar os outros agendamentos", () => {
    const { vencidos, ignorados } = selecionarVencidos(
      [
        agendamento({
          modulo: "SC-QUEBRADO",
          cron: "isto não é cron",
          proximaExecucaoEm: new Date("2026-08-01T11:00:00.000Z"),
        }),
        agendamento({
          modulo: "SC-02",
          proximaExecucaoEm: new Date("2026-08-26T09:00:00.000Z"),
        }),
      ],
      AGORA,
    );

    expect(vencidos.map((v) => v.modulo)).toEqual(["SC-02"]);
    expect(ignorados[0]).toMatchObject({ modulo: "SC-QUEBRADO" });
  });
});

describe("reagendamento", () => {
  it("não acumula rodadas atrasadas depois de uma parada longa", () => {
    // O portal ficou fora do ar por seis dias. Na volta, o agendador deve
    // marcar a próxima janela — não disparar as seis rodadas perdidas.
    const proxima = reagendar("0 8 * * *", AGORA);

    expect(proxima.toISOString()).toBe("2026-08-27T11:00:00.000Z");
    expect(proxima.getTime()).toBeGreaterThan(AGORA.getTime());
  });
});
