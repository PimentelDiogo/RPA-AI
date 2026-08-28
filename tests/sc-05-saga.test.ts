import { beforeEach, describe, expect, it } from "vitest";

import {
  MARCADOR_DE_BLOQUEIO,
  PassoPortalCliente,
  PassoSistemaFinanceiro,
  PassoSistemaTarefas,
} from "@/modules/sc-05/adapters/sistemas-mock";
import { SistemaIndisponivel } from "@/modules/sc-05/ports/sistemas";
import { bancoFake } from "./setup";

/**
 * Os passos dos três sistemas, exercitados direto contra o banco dublado.
 *
 * O que estes testes protegem é a armadilha que o enunciado registra: *"o
 * cliente não é desativado no sistema de tarefas… o que se faz é trocar o
 * responsável das tarefas por um marcador de bloqueado. Reproduza isso, e
 * saiba voltar atrás."*
 */

const CLIENTE = "cli-1";

function tarefa(id: string, responsavel: string, concluida = false) {
  return {
    id,
    clienteId: CLIENTE,
    titulo: `Tarefa ${id}`,
    responsavel,
    responsavelOriginal: null,
    concluida,
  };
}

beforeEach(() => {
  bancoFake.falhas.length = 0;
});

describe("sistema de tarefas — a armadilha do processo", () => {
  it("NÃO desativa o cliente: troca o responsável e guarda o original", async () => {
    bancoFake.tarefas.push(
      tarefa("t1", "Beatriz Nakamura"),
      tarefa("t2", "Rafael Queiroz"),
    );

    const passo = new PassoSistemaTarefas();
    const estadoAnterior = await passo.aplicar(CLIENTE);

    // O cliente continua existindo e as tarefas continuam lá.
    expect(bancoFake.tarefas).toHaveLength(2);
    expect(bancoFake.tarefas.every((t) => t.concluida === false)).toBe(true);

    // O que mudou foi o responsável.
    expect(bancoFake.tarefas.map((t) => t.responsavel)).toEqual([
      MARCADOR_DE_BLOQUEIO,
      MARCADOR_DE_BLOQUEIO,
    ]);

    // E o original ficou guardado, tarefa por tarefa.
    expect(estadoAnterior.responsaveis).toEqual({
      t1: "Beatriz Nakamura",
      t2: "Rafael Queiroz",
    });
  });

  it("devolve cada tarefa ao SEU responsável, não a um padrão", async () => {
    // Devolver todas para uma pessoa só perderia informação — é por isso que o
    // estado anterior é guardado por tarefa.
    bancoFake.tarefas.push(
      tarefa("t1", "Beatriz Nakamura"),
      tarefa("t2", "Rafael Queiroz"),
    );

    const passo = new PassoSistemaTarefas();
    const estadoAnterior = await passo.aplicar(CLIENTE);
    await passo.compensar(CLIENTE, estadoAnterior);

    expect(bancoFake.tarefas.map((t) => t.responsavel)).toEqual([
      "Beatriz Nakamura",
      "Rafael Queiroz",
    ]);
    expect(bancoFake.tarefas.every((t) => t.responsavelOriginal === null)).toBe(
      true,
    );
  });

  it("aplicar duas vezes não apaga quem era o responsável original", async () => {
    // Idempotência: retomar uma saga reaplica o passo, e se o marcador virasse
    // "original" o desbloqueio devolveria a tarefa para o robô.
    bancoFake.tarefas.push(tarefa("t1", "Beatriz Nakamura"));

    const passo = new PassoSistemaTarefas();
    await passo.aplicar(CLIENTE);
    const segundaVez = await passo.aplicar(CLIENTE);

    expect(segundaVez.responsaveis).toEqual({ t1: "Beatriz Nakamura" });

    await passo.compensar(CLIENTE, segundaVez);
    expect(bancoFake.tarefas[0].responsavel).toBe("Beatriz Nakamura");
  });

  it("não mexe em tarefa já concluída", async () => {
    bancoFake.tarefas.push(
      tarefa("t1", "Beatriz Nakamura"),
      tarefa("t2", "Rafael Queiroz", true),
    );

    await new PassoSistemaTarefas().aplicar(CLIENTE);

    expect(bancoFake.tarefas[1].responsavel).toBe("Rafael Queiroz");
  });
});

describe("sistema financeiro", () => {
  it("marca a inadimplência e guarda o estado anterior", async () => {
    const passo = new PassoSistemaFinanceiro();
    const antes = await passo.aplicar(CLIENTE);

    expect(bancoFake.financeiro[0]).toMatchObject({ inadimplente: true });
    expect(antes).toEqual({ inadimplente: false });
  });

  it("volta ao estado que existia, não a um padrão", async () => {
    // Cliente que já estava marcado como inadimplente antes do bloqueio
    // continua marcado depois do desbloqueio.
    bancoFake.financeiro.push({ clienteId: CLIENTE, inadimplente: true });

    const passo = new PassoSistemaFinanceiro();
    const antes = await passo.aplicar(CLIENTE);
    await passo.compensar(CLIENTE, antes);

    expect(bancoFake.financeiro[0].inadimplente).toBe(true);
  });
});

describe("portal do cliente", () => {
  it("revoga e restaura o acesso", async () => {
    const passo = new PassoPortalCliente();

    const antes = await passo.aplicar(CLIENTE);
    expect(bancoFake.acessos[0]).toMatchObject({ ativo: false });

    await passo.compensar(CLIENTE, antes);
    expect(bancoFake.acessos[0].ativo).toBe(true);
  });
});

describe("falha de sistema", () => {
  it("é lançada com o nome do sistema e mensagem legível", async () => {
    bancoFake.falhas.push({ sistema: "Portal do Cliente", falhar: true });

    await expect(new PassoPortalCliente().aplicar(CLIENTE)).rejects.toThrow(
      SistemaIndisponivel,
    );
  });

  it("não deixa o sistema alterado pela metade quando falha", async () => {
    bancoFake.falhas.push({ sistema: "Sistema de Tarefas", falhar: true });
    bancoFake.tarefas.push(tarefa("t1", "Beatriz Nakamura"));

    await expect(new PassoSistemaTarefas().aplicar(CLIENTE)).rejects.toThrow();

    // A checagem acontece antes de tocar em qualquer tarefa.
    expect(bancoFake.tarefas[0].responsavel).toBe("Beatriz Nakamura");
  });
});
