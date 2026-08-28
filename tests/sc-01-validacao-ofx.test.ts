import { describe, expect, it } from "vitest";

import { ConfiancaLancamento, OrigemLeitura } from "@/generated/prisma/enums";
import { gerarOfx, identificadorDoLancamento } from "@/modules/sc-01/ofx";
import type { ExtratoLido } from "@/modules/sc-01/parsers";
import { conferir, podeEntrarNoOfx } from "@/modules/sc-01/validacao";

const data = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function extrato(ajustes: Partial<ExtratoLido> = {}): ExtratoLido {
  return {
    banco: "Banco Aurora",
    agencia: "0412-7",
    conta: "98765-4",
    saldoInicial: 10000,
    saldoFinal: 10759.55,
    competenciaInicio: data("2026-07-31"),
    competenciaFim: data("2026-08-05"),
    lancamentos: [
      { data: data("2026-07-31"), historico: "TED RECEBIDA", valor: 1250 },
      { data: data("2026-08-02"), historico: "FORNECEDOR ALFA", valor: -430.55 },
      { data: data("2026-08-05"), historico: "TARIFA CONTA", valor: -59.9 },
    ],
    ...ajustes,
  };
}

describe("conferência do saldo", () => {
  it("fecha quando saldo inicial + lançamentos dá o saldo final", () => {
    const conferencia = conferir(extrato(), OrigemLeitura.PARSER);

    expect(conferencia.saldoConfere).toBe(true);
    expect(conferencia.diferencaSaldo).toBe(0);
    expect(conferencia.impedimentos).toHaveLength(0);
  });

  it("IMPEDE a geração do OFX quando a soma não fecha", () => {
    // Melhor não entregar do que entregar errado: erro que entra na
    // contabilidade só aparece na conciliação, quando corrigir custa mais.
    const conferencia = conferir(
      extrato({ saldoFinal: 11000 }),
      OrigemLeitura.PARSER,
    );

    expect(conferencia.saldoConfere).toBe(false);
    expect(conferencia.diferencaSaldo).toBeCloseTo(-240.45, 2);
    expect(conferencia.impedimentos[0]).toContain("não fecha");
    expect(conferencia.impedimentos[0]).toContain("OFX não foi gerado");
  });

  it("não some com centavos: soma em inteiro, não em ponto flutuante", () => {
    const centavos = conferir(
      extrato({
        saldoInicial: 0,
        saldoFinal: 0.3,
        lancamentos: [
          { data: data("2026-08-01"), historico: "A", valor: 0.1 },
          { data: data("2026-08-01"), historico: "B", valor: 0.2 },
        ],
      }),
      OrigemLeitura.PARSER,
    );

    expect(centavos.saldoConfere).toBe(true);
  });

  it("avisa quando o extrato não declara saldo — não dá para conferir", () => {
    const conferencia = conferir(
      extrato({ saldoInicial: undefined, saldoFinal: undefined }),
      OrigemLeitura.PARSER,
    );

    expect(conferencia.diferencaSaldo).toBeNull();
    expect(conferencia.ressalvas.join(" ")).toContain("ficou de fora");
    // Não impede: apenas não se pode afirmar que a leitura está completa.
    expect(conferencia.impedimentos).toHaveLength(0);
  });
});

describe("confiança por lançamento", () => {
  it("parser produz confiança alta", () => {
    const { lancamentos } = conferir(extrato(), OrigemLeitura.PARSER);

    expect(lancamentos.every((l) => l.confianca === ConfiancaLancamento.ALTA)).toBe(
      true,
    );
  });

  it("IA produz confiança média — sempre passa por conferência", () => {
    const { lancamentos } = conferir(extrato(), OrigemLeitura.IA);

    expect(lancamentos.every((l) => l.confianca === ConfiancaLancamento.MEDIA)).toBe(
      true,
    );
    expect(lancamentos[0].motivoConferencia).toContain("confira antes de importar");
  });

  it("rebaixa para baixa quando falta dado, mesmo vindo de parser", () => {
    const { lancamentos } = conferir(
      extrato({
        lancamentos: [
          { data: data("2026-07-31"), historico: "", valor: 1250 },
          { data: data("2026-08-02"), historico: "OK", valor: 0 },
          { data: data("2030-01-01"), historico: "FORA", valor: -1250 },
        ],
        saldoInicial: undefined,
        saldoFinal: undefined,
      }),
      OrigemLeitura.PARSER,
    );

    expect(lancamentos.map((l) => l.confianca)).toEqual([
      ConfiancaLancamento.BAIXA,
      ConfiancaLancamento.BAIXA,
      ConfiancaLancamento.BAIXA,
    ]);
    expect(lancamentos[0].motivoConferencia).toContain("Histórico ausente");
    expect(lancamentos[1].motivoConferencia).toContain("zerado");
    expect(lancamentos[2].motivoConferencia).toContain("fora da competência");
  });

  it("propaga a ressalva que o parser marcou", () => {
    const { lancamentos } = conferir(
      extrato({
        lancamentos: [
          {
            data: data("2026-08-02"),
            historico: "PAGTO FORNECEDOR ALF...",
            valor: -430.55,
            ressalva: "Histórico truncado pelo banco — confira a descrição antes de importar.",
          },
        ],
        saldoInicial: undefined,
        saldoFinal: undefined,
      }),
      OrigemLeitura.PARSER,
    );

    expect(lancamentos[0].confianca).toBe(ConfiancaLancamento.BAIXA);
    expect(lancamentos[0].motivoConferencia).toContain("truncado");
  });
});

describe("o que entra no OFX", () => {
  it("alta entra; média e baixa só depois de conferidas", () => {
    expect(
      podeEntrarNoOfx({ confianca: ConfiancaLancamento.ALTA, conferido: false }),
    ).toBe(true);
    expect(
      podeEntrarNoOfx({ confianca: ConfiancaLancamento.MEDIA, conferido: false }),
    ).toBe(false);
    expect(
      podeEntrarNoOfx({ confianca: ConfiancaLancamento.BAIXA, conferido: true }),
    ).toBe(true);
  });
});

describe("geração do OFX", () => {
  const ofx = gerarOfx({
    banco: "Banco Aurora",
    agencia: "0412-7",
    conta: "98765-4",
    competenciaInicio: data("2026-07-31"),
    competenciaFim: data("2026-08-05"),
    saldoFinal: 10759.55,
    geradoEm: new Date("2026-08-10T12:00:00.000Z"),
    lancamentos: [
      {
        data: data("2026-07-31"),
        historico: "TED RECEBIDA",
        valor: 1250,
        identificador: "abc-0001",
      },
      {
        data: data("2026-08-02"),
        historico: "FORNECEDOR ALFA & CIA",
        valor: -430.55,
        identificador: "abc-0002",
      },
    ],
  });

  it("começa pelo cabeçalho SGML, não por XML", () => {
    // OFX 1.0.2 é SGML: quem gera <?xml> aqui produz arquivo que o sistema
    // contábil recusa.
    expect(ofx.startsWith("OFXHEADER:100")).toBe(true);
    expect(ofx).toContain("VERSION:102");
    expect(ofx).not.toContain("<?xml");
  });

  it("tem um STMTTRN por lançamento, com tipo pelo sinal", () => {
    expect(ofx.match(/<STMTTRN>/g)).toHaveLength(2);
    expect(ofx).toContain("<TRNTYPE>CREDIT");
    expect(ofx).toContain("<TRNTYPE>DEBIT");
    expect(ofx).toContain("<TRNAMT>1250.00");
    expect(ofx).toContain("<TRNAMT>-430.55");
  });

  it("mantém a data do lançamento, sem deslocar por fuso", () => {
    // Data pura reinterpretada em São Paulo cairia no dia anterior.
    expect(ofx).toContain("<DTPOSTED>20260731000000");
    expect(ofx).toContain("<DTPOSTED>20260802000000");
  });

  it("escapa o que o formato não aceita cru", () => {
    expect(ofx).toContain("FORNECEDOR ALFA &amp; CIA");
  });

  it("traz FITID em todo lançamento", () => {
    // Sem identificador estável, reimportar duplica os lançamentos.
    expect(ofx).toContain("<FITID>abc-0001");
    expect(ofx).toContain("<FITID>abc-0002");
  });

  it("declara o saldo final e o período", () => {
    expect(ofx).toContain("<BALAMT>10759.55");
    expect(ofx).toContain("<DTSTART>20260731000000");
    expect(ofx).toContain("<DTEND>20260805000000");
  });

  it("fecha as tags de bloco", () => {
    for (const tag of ["OFX", "STMTRS", "BANKTRANLIST", "BANKACCTFROM"]) {
      expect(ofx).toContain(`</${tag}>`);
    }
  });
});

describe("identificador do lançamento", () => {
  it("é estável para o mesmo extrato e lançamento", () => {
    const dados = { extratoId: "cmtd0abcdef123456", ordem: 7 };

    expect(identificadorDoLancamento(dados)).toBe(
      identificadorDoLancamento(dados),
    );
  });

  it("distingue lançamentos do mesmo extrato", () => {
    expect(
      identificadorDoLancamento({ extratoId: "cmtd0abcdef123456", ordem: 1 }),
    ).not.toBe(
      identificadorDoLancamento({ extratoId: "cmtd0abcdef123456", ordem: 2 }),
    );
  });
});
