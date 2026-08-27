import { describe, expect, it } from "vitest";

import { FaixaVencimento } from "@/generated/prisma/enums";
import {
  classificar,
  decidir,
  diasRestantes,
  redigirAviso,
} from "@/modules/sc-20/regua";

/** 26/08/2026, 22h em São Paulo — já é dia 27 em UTC, de propósito. */
const AGORA = new Date("2026-08-27T01:00:00.000Z");

/** Ajuda a escrever a validade como data pura, como o banco devolve. */
const data = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("dias restantes", () => {
  it("conta a partir de hoje no fuso da operação, não do servidor", () => {
    // São 22h de 26/08 em São Paulo. Um certificado que vence em 27/08 tem
    // 1 dia, não 0 — que é o que daria se o cálculo usasse UTC.
    expect(diasRestantes(data("2026-08-27"), AGORA)).toBe(1);
    expect(diasRestantes(data("2026-08-26"), AGORA)).toBe(0);
  });

  it("devolve negativo para certificado já vencido", () => {
    expect(diasRestantes(data("2026-08-20"), AGORA)).toBe(-6);
  });

  it("ignora a hora do vencimento", () => {
    expect(diasRestantes(data("2026-09-25"), AGORA)).toBe(30);
  });
});

describe("classificação em faixas", () => {
  it("separa as quatro faixas do painel", () => {
    expect(classificar(-1)).toBe(FaixaVencimento.VENCIDO);
    expect(classificar(0)).toBe(FaixaVencimento.ATE_15);
    expect(classificar(15)).toBe(FaixaVencimento.ATE_15);
    expect(classificar(16)).toBe(FaixaVencimento.ATE_30);
    expect(classificar(30)).toBe(FaixaVencimento.ATE_30);
    expect(classificar(31)).toBe(FaixaVencimento.ATE_60);
    expect(classificar(60)).toBe(FaixaVencimento.ATE_60);
  });

  it("deixa de fora o que ainda não entrou na janela", () => {
    expect(classificar(61)).toBeNull();
    expect(classificar(365)).toBeNull();
  });

  it("respeita janela configurada diferente do padrão", () => {
    expect(classificar(75, 90)).toBe(FaixaVencimento.ATE_60);
    expect(classificar(91, 90)).toBeNull();
    expect(classificar(45, 30)).toBeNull();
  });
});

describe("régua de avisos — a armadilha do processo", () => {
  it("avisa quando o certificado entra na janela pela primeira vez", () => {
    const decisao = decidir(FaixaVencimento.ATE_60, null);

    expect(decisao.acao).toBe("avisar");
    expect(decisao.motivo).toContain("primeiro aviso");
  });

  it("SUPRIME quando nada mudou desde o último aviso", () => {
    // É este o caso que o enunciado marca: repetir a lista inteira todo dia
    // é o defeito, não o objetivo.
    const decisao = decidir(FaixaVencimento.ATE_30, FaixaVencimento.ATE_30);

    expect(decisao.acao).toBe("suprimir");
    expect(decisao.motivo).toContain("nada mudou");
  });

  it("avisa de novo quando o certificado muda de faixa", () => {
    const decisao = decidir(FaixaVencimento.ATE_30, FaixaVencimento.ATE_60);

    expect(decisao.acao).toBe("avisar");
    expect(decisao.motivo).toContain("mudou de");
  });

  it("avisa quando o certificado vence depois de já ter sido avisado", () => {
    const decisao = decidir(FaixaVencimento.VENCIDO, FaixaVencimento.ATE_15);

    expect(decisao.acao).toBe("avisar");
  });

  it("o gatilho é mudança de faixa, não passagem de tempo", () => {
    // 45 dias e 44 dias caem na mesma faixa: nada é comunicado no segundo dia.
    const ontem = classificar(45)!;
    const hoje = classificar(44)!;

    expect(hoje).toBe(ontem);
    expect(decidir(hoje, ontem).acao).toBe("suprimir");
  });

  it("duas execuções no mesmo dia: a segunda não comunica nada", () => {
    const faixa = classificar(diasRestantes(data("2026-09-10"), AGORA))!;

    const primeira = decidir(faixa, null);
    expect(primeira.acao).toBe("avisar");

    // A segunda rodada já encontra o aviso da primeira registrado.
    const segunda = decidir(faixa, faixa);
    expect(segunda.acao).toBe("suprimir");
  });
});

describe("texto do aviso", () => {
  const base = {
    cliente: "Padaria Trigo de Ouro Ltda",
    titular: "Marcos Prado",
    tipo: "A1",
    emissor: "Certisign",
    destinatario: "Rafael Queiroz",
  };

  it("diz quanto tempo resta, não apenas a data", () => {
    const texto = redigirAviso({
      ...base,
      validade: data("2026-09-10"),
      dias: 14,
    });

    expect(texto).toContain("vence em 14 dia(s)");
    expect(texto).toContain("10/09/2026");
    expect(texto).toContain("Rafael Queiroz");
  });

  it("fala no passado quando o certificado já venceu", () => {
    const texto = redigirAviso({
      ...base,
      validade: data("2026-08-20"),
      dias: -6,
    });

    expect(texto).toContain("venceu há 6 dia(s)");
  });
});
