import { describe, expect, it, vi } from "vitest";

import {
  comRetry,
  esperaDaTentativa,
  POLITICA_PADRAO,
  processarEmLote,
} from "@/modules/sc-02/fila";

/** Não dorme de verdade: o teste mede a política, não a paciência. */
const semDormir = () => Promise.resolve();

describe("espera entre tentativas", () => {
  it("cresce em dobro e não espera antes da primeira", () => {
    const politica = { ...POLITICA_PADRAO, esperaBaseMs: 400 };

    expect(esperaDaTentativa(1, politica)).toBe(0);
    expect(esperaDaTentativa(2, politica)).toBe(400);
    expect(esperaDaTentativa(3, politica)).toBe(800);
    expect(esperaDaTentativa(4, politica)).toBe(1600);
  });
});

describe("retry", () => {
  it("não tenta de novo quando dá certo na primeira", async () => {
    const executar = vi.fn(async () => ({ sucesso: true }));

    const { tentativas, final } = await comRetry(
      executar,
      (r) => r.sucesso,
      POLITICA_PADRAO,
      semDormir,
    );

    expect(executar).toHaveBeenCalledTimes(1);
    expect(tentativas).toHaveLength(1);
    expect(final.sucesso).toBe(true);
  });

  it("insiste até dar certo e devolve TODAS as tentativas", async () => {
    // Portal caiu e voltou. As duas falhas não podem sumir: é o registro que
    // permite saber depois que a leitura boa veio na terceira tentativa.
    let chamadas = 0;
    const executar = async () => {
      chamadas += 1;
      return { sucesso: chamadas === 3, tentativa: chamadas };
    };

    const { tentativas, final } = await comRetry(
      executar,
      (r) => r.sucesso,
      POLITICA_PADRAO,
      semDormir,
    );

    expect(chamadas).toBe(3);
    expect(tentativas.map((t) => t.tentativa)).toEqual([1, 2, 3]);
    expect(tentativas.map((t) => t.resultado.sucesso)).toEqual([
      false,
      false,
      true,
    ]);
    expect(final.sucesso).toBe(true);
  });

  it("desiste no limite da política, sem tentar para sempre", async () => {
    const executar = vi.fn(async () => ({ sucesso: false }));

    const { tentativas, final } = await comRetry(
      executar,
      (r) => r.sucesso,
      { tentativas: 3, esperaBaseMs: 400, concorrencia: 4 },
      semDormir,
    );

    expect(executar).toHaveBeenCalledTimes(3);
    expect(tentativas).toHaveLength(3);
    expect(final.sucesso).toBe(false);
  });
});

describe("limite de concorrência", () => {
  it("nunca ultrapassa o limite de consultas simultâneas", async () => {
    // Portal de órgão real derruba quem martela. O limite faz parte de
    // reproduzir o problema, não é enfeite.
    let emVoo = 0;
    let pico = 0;

    const itens = Array.from({ length: 20 }, (_, i) => i);

    await processarEmLote(itens, 4, async (item) => {
      emVoo += 1;
      pico = Math.max(pico, emVoo);
      await new Promise((resolve) => setTimeout(resolve, 5));
      emVoo -= 1;
      return item;
    });

    expect(pico).toBeLessThanOrEqual(4);
    expect(pico).toBeGreaterThan(1);
  });

  it("processa todos os itens e preserva a ordem das saídas", async () => {
    const itens = Array.from({ length: 10 }, (_, i) => i);

    const saidas = await processarEmLote(itens, 3, async (item) => {
      await new Promise((resolve) => setTimeout(resolve, (10 - item) % 4));
      return item * 2;
    });

    expect(saidas).toEqual(itens.map((i) => i * 2));
  });
});
