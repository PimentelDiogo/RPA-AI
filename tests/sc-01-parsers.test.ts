import { describe, expect, it } from "vitest";

import {
  BANCOS_SUPORTADOS,
  ExtratoIlegivel,
  PARSERS,
  reconhecer,
  valorBrasileiro,
} from "@/modules/sc-01/parsers";

/**
 * O registry de parsers é a resposta à armadilha do processo: *"cada banco
 * imprime o extrato de um jeito. Pense em como aceitar um formato novo sem
 * reescrever tudo."*
 *
 * Os extratos aqui são os mesmos que o gerador de massa produz.
 */

const AURORA = `
BANCO AURORA S.A.
EXTRATO DE CONTA CORRENTE
Agência: 0412-7   Conta: 98765-4

SALDO ANTERIOR                              10.000,00 C

31/07/2026  TRANSFERENCIA RECEBIDA CLIENTE     1.250,00 C
02/08/2026  PAGAMENTO FORNECEDOR ALFA            430,55 D
05/08/2026  TARIFA MANUTENCAO CONTA                59,90 D

SALDO FINAL                                 10.759,55 C
`;

const MERIDIANO = `
BANCO MERIDIANO
EXTRATO ELETRONICO AG=1234 CC=567890-1
SALDO_INICIAL=2500.00
2026-07-31|TED RECEBIDA CLIENTE|1250.00
2026-08-02|DEBITO FORNECEDOR ALFA|-430.55
SALDO_FINAL=3319.45
`;

const PAMPA = `
BANCO PAMPA
COMPETENCIA 08/2026
AG 0987-1  CONTA 11223-4
SALDO ANT ....... +5.000,00
31/07 TED RECEBIDA CLIENTE ................ +1.250,00
02/08 PAGTO FORNECEDOR ALF... ............. -430,55
SALDO ATUAL ..... +5.819,45
`;

describe("reconhecimento de layout", () => {
  it("identifica cada banco pelo seu extrato", () => {
    expect(reconhecer(AURORA)?.banco).toBe("Banco Aurora");
    expect(reconhecer(MERIDIANO)?.banco).toBe("Banco Meridiano");
    expect(reconhecer(PAMPA)?.banco).toBe("Banco Pampa");
  });

  it("não reconhece um layout desconhecido — não chuta", () => {
    // Chutar aqui produziria leitura errada, que é pior do que não ler.
    expect(reconhecer("EXTRATO DO BANCO QUE AINDA NAO EXISTE\n01/01 X 1,00")).toBeUndefined();
  });

  it("os parsers não se confundem entre si", () => {
    for (const extrato of [AURORA, MERIDIANO, PAMPA]) {
      const reconhecidos = PARSERS.filter((parser) => parser.detect(extrato));
      expect(reconhecidos).toHaveLength(1);
    }
  });

  it("declara os bancos suportados para a tela informar", () => {
    expect(BANCOS_SUPORTADOS).toEqual([
      "Banco Aurora",
      "Banco Meridiano",
      "Banco Pampa",
    ]);
  });
});

describe("Banco Aurora", () => {
  const lido = PARSERS[0].parse(AURORA);

  it("lê agência, conta e saldos", () => {
    expect(lido.agencia).toBe("0412-7");
    expect(lido.conta).toBe("98765-4");
    expect(lido.saldoInicial).toBe(10000);
    expect(lido.saldoFinal).toBe(10759.55);
  });

  it("aplica o sinal a partir do C/D", () => {
    expect(lido.lancamentos.map((l) => l.valor)).toEqual([1250, -430.55, -59.9]);
  });

  it("lê data e histórico", () => {
    expect(lido.lancamentos[0].data.toISOString()).toBe(
      "2026-07-31T00:00:00.000Z",
    );
    expect(lido.lancamentos[0].historico).toBe("TRANSFERENCIA RECEBIDA CLIENTE");
  });
});

describe("Banco Meridiano", () => {
  const lido = PARSERS[1].parse(MERIDIANO);

  it("lê o layout de barra vertical com valor já sinalizado", () => {
    expect(lido.agencia).toBe("1234");
    expect(lido.conta).toBe("567890-1");
    expect(lido.saldoInicial).toBe(2500);
    expect(lido.saldoFinal).toBe(3319.45);
    expect(lido.lancamentos.map((l) => l.valor)).toEqual([1250, -430.55]);
  });
});

describe("Banco Pampa", () => {
  const lido = PARSERS[2].parse(PAMPA);

  it("completa o ano a partir da competência", () => {
    // A primeira linha é 31/07 num extrato de 08/2026: pertence a julho de 2026.
    expect(lido.lancamentos[0].data.toISOString()).toBe(
      "2026-07-31T00:00:00.000Z",
    );
    expect(lido.lancamentos[1].data.toISOString()).toBe(
      "2026-08-02T00:00:00.000Z",
    );
  });

  it("marca ressalva quando o banco truncou o histórico", () => {
    // Foi lido, mas veio incompleto do banco — quem confere precisa saber.
    expect(lido.lancamentos[1].ressalva).toContain("truncado");
    expect(lido.lancamentos[0].ressalva).toBeUndefined();
  });

  it("recusa o extrato sem competência, em vez de inventar o ano", () => {
    const semCompetencia = PAMPA.replace("COMPETENCIA 08/2026", "COMPETENCIA");
    expect(() => PARSERS[2].parse(semCompetencia)).toThrow();
  });

  it("vira o ano quando o lançamento é de dezembro num extrato de janeiro", () => {
    const janeiro = `
BANCO PAMPA
COMPETENCIA 01/2027
30/12 PAGAMENTO ANTECIPADO ................ -100,00
05/01 RECEBIMENTO CLIENTE ................. +200,00
`;
    const virada = PARSERS[2].parse(janeiro);
    expect(virada.lancamentos[0].data.getUTCFullYear()).toBe(2026);
    expect(virada.lancamentos[1].data.getUTCFullYear()).toBe(2027);
  });
});

describe("leitura de valor", () => {
  it("entende o formato brasileiro", () => {
    expect(valorBrasileiro("1.234,56")).toBe(1234.56);
    expect(valorBrasileiro("-1.234,56")).toBe(-1234.56);
    expect(valorBrasileiro("(1.234,56)")).toBe(-1234.56);
    expect(valorBrasileiro("1.234,56-")).toBe(-1234.56);
    expect(valorBrasileiro("+430,55")).toBe(430.55);
  });

  it("recusa o que não é número, em vez de virar NaN silencioso", () => {
    expect(() => valorBrasileiro("mil reais")).toThrow(ExtratoIlegivel);
  });
});

describe("acrescentar um banco novo", () => {
  it("basta implementar o contrato — nada mais do módulo muda", () => {
    // Este teste é a prova executável da resposta à armadilha: um parser novo
    // é um objeto com detect() e parse(), e o registry o aceita como qualquer
    // outro.
    const bancoNovo = {
      banco: "Banco Recém-Chegado",
      detect: (texto: string) => texto.includes("RECEM CHEGADO"),
      parse: () => ({
        banco: "Banco Recém-Chegado",
        lancamentos: [
          { data: new Date(Date.UTC(2026, 7, 1)), historico: "TESTE", valor: 10 },
        ],
      }),
    };

    const registryEstendido = [...PARSERS, bancoNovo];
    const encontrado = registryEstendido.find((p) =>
      p.detect("EXTRATO RECEM CHEGADO"),
    );

    expect(encontrado?.banco).toBe("Banco Recém-Chegado");
  });
});
