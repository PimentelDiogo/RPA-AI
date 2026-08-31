import { describe, expect, it } from "vitest";

import { ConfiancaLancamento, OrigemLeitura } from "@/generated/prisma/enums";
import { converter } from "@/modules/sc-01/adapters/leitor-claude";
import { conferir, podeEntrarNoOfx } from "@/modules/sc-01/validacao";

/**
 * A leitura assistida e o que acontece com o que ela devolve.
 *
 * O modelo não é chamado aqui: o que precisa de teste é a **conversão** do que
 * ele devolve e a regra que decide o destino disso. Chamar a API num teste
 * gastaria crédito e traria variação onde se quer garantia.
 */

/** Resposta típica do modelo, no formato que o schema exige. */
const RESPOSTA_DO_MODELO = {
  banco: "COOPERATIVA DE CREDITO HORIZONTE",
  agencia: null,
  conta: null,
  saldoInicial: 10000,
  saldoFinal: 10759.55,
  lancamentos: [
    { data: "2026-07-31", historico: "TRANSFERENCIA RECEBIDA CLIENTE", valor: 1250 },
    { data: "2026-08-01", historico: "PAGAMENTO FORNECEDOR ALFA", valor: -430.55 },
    { data: "2026-08-07", historico: "TARIFA MANUTENCAO CONTA", valor: -59.9 },
  ],
};

describe("conversão da resposta do modelo", () => {
  const lido = converter(RESPOSTA_DO_MODELO);

  it("preserva sinal, histórico e ordem", () => {
    expect(lido.lancamentos.map((l) => l.valor)).toEqual([1250, -430.55, -59.9]);
    expect(lido.lancamentos[0].historico).toBe("TRANSFERENCIA RECEBIDA CLIENTE");
  });

  it("trata data como data pura, sem deslocar por fuso", () => {
    // Interpretar "2026-07-31" no fuso local jogaria para o dia 30.
    expect(lido.lancamentos[0].data.toISOString()).toBe(
      "2026-07-31T00:00:00.000Z",
    );
  });

  it("deriva a competência do intervalo dos lançamentos", () => {
    expect(lido.competenciaInicio?.toISOString().slice(0, 10)).toBe("2026-07-31");
    expect(lido.competenciaFim?.toISOString().slice(0, 10)).toBe("2026-08-07");
  });

  it("converte null em ausência, sem inventar valor", () => {
    expect(lido.agencia).toBeUndefined();
    expect(lido.conta).toBeUndefined();
    expect(lido.saldoInicial).toBe(10000);
  });

  it("não deixa o banco vazio", () => {
    const semBanco = converter({ ...RESPOSTA_DO_MODELO, banco: "   " });
    expect(semBanco.banco).toBe("Banco não identificado");
  });

  it("marca data inválida como inválida, em vez de escolher uma", () => {
    const comDataRuim = converter({
      ...RESPOSTA_DO_MODELO,
      lancamentos: [
        { data: "31 de julho", historico: "TED", valor: 100 },
      ],
    });

    expect(Number.isNaN(comDataRuim.lancamentos[0].data.getTime())).toBe(true);
  });
});

describe("o que a IA devolve passa pela MESMA validação do parser", () => {
  it("sai com confiança média e vai para a fila de conferência", () => {
    // É a regra central do módulo: interpretação nunca vira contabilidade sem
    // alguém conferir. Mesmo dado, lido por parser, entraria direto.
    const porIa = conferir(converter(RESPOSTA_DO_MODELO), OrigemLeitura.IA);

    expect(
      porIa.lancamentos.every((l) => l.confianca === ConfiancaLancamento.MEDIA),
    ).toBe(true);
    expect(
      porIa.lancamentos.every(
        (l) => !podeEntrarNoOfx({ ...l, conferido: false }),
      ),
    ).toBe(true);

    const porParser = conferir(
      converter(RESPOSTA_DO_MODELO),
      OrigemLeitura.PARSER,
    );
    expect(
      porParser.lancamentos.every((l) => l.confianca === ConfiancaLancamento.ALTA),
    ).toBe(true);
  });

  it("a soma é conferida igual — o modelo não escapa da validação", () => {
    // Se o modelo perdesse um lançamento, o saldo não fecharia e o OFX não
    // seria gerado. É o que impede leitura errada de virar contabilidade.
    const comLancamentoPerdido = conferir(
      converter({
        ...RESPOSTA_DO_MODELO,
        lancamentos: RESPOSTA_DO_MODELO.lancamentos.slice(0, 2),
      }),
      OrigemLeitura.IA,
    );

    expect(comLancamentoPerdido.saldoConfere).toBe(false);
    expect(comLancamentoPerdido.impedimentos[0]).toContain("OFX não foi gerado");
  });

  it("rebaixa para baixa o que vier incompleto do modelo", () => {
    const comHistoricoVazio = conferir(
      converter({
        ...RESPOSTA_DO_MODELO,
        saldoInicial: null,
        saldoFinal: null,
        lancamentos: [{ data: "2026-08-01", historico: "", valor: 100 }],
      }),
      OrigemLeitura.IA,
    );

    expect(comHistoricoVazio.lancamentos[0].confianca).toBe(
      ConfiancaLancamento.BAIXA,
    );
  });
});
