import { describe, expect, it } from "vitest";

import { OrigemConsulta } from "@/generated/prisma/enums";
import { interpretar } from "@/modules/sc-02/adapters/orgao-http";
import { comportamentoDe } from "@/app/api/fake/orgaos/comportamento";
import { paginaDeResultado } from "@/app/api/fake/orgaos/paginas";

/**
 * Leitura da resposta do órgão: o pedaço que muda quando o portal muda de
 * layout, e por isso o que precisa de teste. As páginas de entrada são as
 * mesmas que o portal simulado serve — não uma imitação escrita no teste.
 */
const CNPJ = "41688555000155";

function ler(html: string) {
  return interpretar(html, OrigemConsulta.HTTP, 10);
}

describe("interpretação da página do órgão", () => {
  it("lê situação regular", () => {
    const { html } = paginaDeResultado("fgts", CNPJ, { tipo: "regular" });
    const resultado = ler(html);

    expect(resultado.sucesso).toBe(true);
    if (resultado.sucesso) {
      expect(resultado.situacao).toBe("REGULAR");
      expect(resultado.detalhe).toContain("Certidão negativa");
    }
  });

  it("lê situação irregular com a pendência", () => {
    const { html } = paginaDeResultado("receita-federal", CNPJ, {
      tipo: "irregular",
      pendencia: "Débito de tributo federal em cobrança administrativa",
    });
    const resultado = ler(html);

    expect(resultado.sucesso).toBe(true);
    if (resultado.sucesso) {
      expect(resultado.situacao).toBe("IRREGULAR");
      expect(resultado.detalhe).toContain("Débito de tributo federal");
    }
  });

  it("trata sessão expirada como falha, mesmo com HTTP 200", () => {
    // É o caso traiçoeiro: quem só olha o código HTTP acha que deu certo e
    // grava uma situação que o órgão nunca informou.
    const { html, status } = paginaDeResultado("previdencia", CNPJ, {
      tipo: "sessao-expirada",
    });

    expect(status).toBe(200);

    const resultado = ler(html);
    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) {
      expect(resultado.erro).toContain("sessão");
    }
  });

  it("trata formato inesperado como falha e guarda a resposta bruta", () => {
    const { html } = paginaDeResultado("fgts", CNPJ, {
      tipo: "formato-inesperado",
    });
    const resultado = ler(html);

    expect(resultado.sucesso).toBe(false);
    if (!resultado.sucesso) {
      expect(resultado.erro).toContain("formato");
      // Sem a resposta bruta, ninguém descobre depois o que o portal mudou.
      expect(resultado.respostaBruta).toBeTruthy();
    }
  });

  it("reconhece indisponibilidade informada pelo órgão como leitura válida", () => {
    // "O órgão disse que não pode informar" é diferente de "não conseguimos
    // perguntar": o primeiro é uma resposta, e vale como leitura.
    const { html } = paginaDeResultado("fazenda-estadual", CNPJ, {
      tipo: "indisponivel",
    });
    const resultado = ler(html);

    expect(resultado.sucesso).toBe(true);
    if (resultado.sucesso) expect(resultado.situacao).toBe("INDISPONIVEL");
  });
});

describe("portal simulado", () => {
  it("é determinístico: o mesmo par se comporta sempre igual", () => {
    const primeiro = comportamentoDe(CNPJ, "fgts");
    const segundo = comportamentoDe(CNPJ, "fgts");

    expect(segundo).toEqual(primeiro);
  });

  it("varia entre órgãos, para o painel ter estados diferentes", () => {
    const porOrgao = [
      "receita-federal",
      "fgts",
      "previdencia",
      "fazenda-estadual",
    ].map((orgao) => comportamentoDe(CNPJ, orgao).tipo);

    expect(new Set(porOrgao).size).toBeGreaterThan(1);
  });

  it("produz falhas de acesso em parte dos casos, senão a faixa de erro nunca apareceria", () => {
    const cnpjs = Array.from(
      { length: 40 },
      (_, i) => `4100000${String(i).padStart(3, "0")}0001`,
    );

    const tipos = cnpjs.flatMap((cnpj) =>
      ["receita-federal", "fgts"].map((orgao) => comportamentoDe(cnpj, orgao).tipo),
    );

    const falhas = tipos.filter((tipo) =>
      ["timeout", "fora-do-ar", "sessao-expirada", "formato-inesperado"].includes(
        tipo,
      ),
    );

    expect(falhas.length).toBeGreaterThan(0);
    // …mas não tantas que o painel não tenha leitura boa nenhuma.
    expect(falhas.length).toBeLessThan(tipos.length / 2);
  });
});
