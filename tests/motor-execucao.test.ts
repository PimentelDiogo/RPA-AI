import { describe, expect, it } from "vitest";

import {
  Disparo,
  StatusExecucao,
  StatusItem,
} from "@/generated/prisma/enums";
import { ErroDeNegocio, MENSAGEM_FALHA_INESPERADA } from "@/lib/execucao/erros";
import { executarModulo } from "@/lib/execucao/motor";
import { bancoFake } from "./setup";

const PEDIDO = {
  modulo: "SC-TESTE",
  disparo: Disparo.MANUAL,
  usuarioId: "usuario-1",
};

describe("motor de execução", () => {
  it("marca sucesso quando todos os itens deram certo", async () => {
    const resultado = await executarModulo(PEDIDO, async (contexto) => {
      await contexto.registrarItem({
        referencia: "Cliente A",
        status: StatusItem.SUCESSO,
      });
      await contexto.registrarItem({
        referencia: "Cliente B",
        status: StatusItem.SUCESSO,
      });
      return { resumo: "2 clientes processados" };
    });

    expect(resultado.status).toBe(StatusExecucao.SUCESSO);
    expect(resultado.resumo).toBe("2 clientes processados");
    expect(resultado.erro).toBeNull();
  });

  it("marca sucesso parcial quando parte dos itens falhou", async () => {
    // Esta é a distinção que impede uma consulta que falhou de sumir: a rodada
    // terminou, mas não pode se apresentar como sucesso.
    const resultado = await executarModulo(PEDIDO, async (contexto) => {
      await contexto.registrarItem({
        referencia: "Cliente A",
        status: StatusItem.SUCESSO,
      });
      await contexto.registrarItem({
        referencia: "Cliente B",
        status: StatusItem.FALHA,
        mensagem: "O portal do órgão não respondeu.",
      });
    });

    expect(resultado.status).toBe(StatusExecucao.SUCESSO_PARCIAL);
  });

  it("marca falha quando todos os itens falharam", async () => {
    const resultado = await executarModulo(PEDIDO, async (contexto) => {
      await contexto.registrarItem({
        referencia: "Cliente A",
        status: StatusItem.FALHA,
        mensagem: "O portal do órgão não respondeu.",
      });
    });

    expect(resultado.status).toBe(StatusExecucao.FALHA);
  });

  it("mostra a mensagem de negócio ao operador e guarda o stack à parte", async () => {
    const resultado = await executarModulo(PEDIDO, async () => {
      throw new ErroDeNegocio("O portal do órgão está fora do ar.", {
        sugestao: "Tente novamente em alguns minutos.",
      });
    });

    expect(resultado.status).toBe(StatusExecucao.FALHA);
    expect(resultado.erro).toBe(
      "O portal do órgão está fora do ar. Tente novamente em alguns minutos.",
    );

    const gravada = bancoFake.execucoes[0];
    expect(gravada.detalheTecnico).toContain("ErroDeNegocio");
  });

  it("não vaza erro inesperado para a tela", async () => {
    const resultado = await executarModulo(PEDIDO, async () => {
      throw new TypeError("Cannot read properties of undefined (reading 'x')");
    });

    expect(resultado.erro).toBe(MENSAGEM_FALHA_INESPERADA);
    expect(resultado.erro).not.toContain("undefined");

    const gravada = bancoFake.execucoes[0];
    expect(gravada.detalheTecnico).toContain("TypeError");
  });

  it("preserva os itens já processados quando a execução morre no meio", async () => {
    await executarModulo(PEDIDO, async (contexto) => {
      await contexto.registrarItem({
        referencia: "Cliente A",
        status: StatusItem.SUCESSO,
      });
      throw new ErroDeNegocio("A sessão expirou no meio da varredura.");
    });

    expect(bancoFake.itens).toHaveLength(1);
    expect(bancoFake.itens[0]).toMatchObject({ referencia: "Cliente A" });
  });

  it("registra autoria e duração da rodada", async () => {
    const resultado = await executarModulo(PEDIDO, async () => {});

    expect(resultado.duracaoMs).toBeGreaterThanOrEqual(0);

    const gravada = bancoFake.execucoes[0];
    expect(gravada.disparadoPorId).toBe("usuario-1");
    expect(gravada.disparo).toBe(Disparo.MANUAL);
    expect(gravada.finalizadaEm).toBeInstanceOf(Date);
  });

  it("aceita execução agendada, sem pessoa por trás", async () => {
    await executarModulo(
      { modulo: "SC-TESTE", disparo: Disparo.AGENDADO },
      async () => {},
    );

    expect(bancoFake.execucoes[0].disparadoPorId).toBeNull();
  });
});
