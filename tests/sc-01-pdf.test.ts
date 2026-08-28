import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { OrigemLeitura } from "@/generated/prisma/enums";
import { extrairTexto } from "@/modules/sc-01/extracao";
import { gerarOfx } from "@/modules/sc-01/ofx";
import { reconhecer } from "@/modules/sc-01/parsers";
import { conferir } from "@/modules/sc-01/validacao";

/**
 * O caminho completo sobre os PDFs de verdade — os mesmos arquivos que o seed
 * usa e que a demonstração envia. Sem isto, os parsers estariam testados
 * apenas contra texto escrito à mão no próprio teste, que é onde parser passa
 * e produção falha.
 */
const FIXTURES = join(process.cwd(), "tests", "fixtures", "sc-01");

async function lerPdf(nome: string) {
  const bytes = new Uint8Array(readFileSync(join(FIXTURES, nome)));
  return extrairTexto(bytes, "application/pdf");
}

describe("extração de texto do PDF", () => {
  it("lê o texto nativo dos extratos gerados", async () => {
    const { texto, temTextoNativo, paginas } = await lerPdf(
      "aurora-agosto-2026.pdf",
    );

    expect(temTextoNativo).toBe(true);
    expect(paginas).toBe(1);
    expect(texto).toContain("BANCO AURORA");
  });
});

describe("do PDF ao OFX, sem atalho", () => {
  const casos = [
    ["aurora-agosto-2026.pdf", "Banco Aurora"],
    ["meridiano-agosto-2026.pdf", "Banco Meridiano"],
    ["pampa-agosto-2026.pdf", "Banco Pampa"],
  ] as const;

  for (const [arquivo, banco] of casos) {
    it(`${banco}: reconhece, lê os 10 lançamentos e fecha o saldo`, async () => {
      const { texto } = await lerPdf(arquivo);

      const parser = reconhecer(texto);
      expect(parser?.banco).toBe(banco);

      const lido = parser!.parse(texto);
      expect(lido.lancamentos).toHaveLength(10);

      const conferencia = conferir(lido, OrigemLeitura.PARSER);

      // Os três extratos descrevem a MESMA movimentação em layouts diferentes:
      // se o saldo fecha nos três, a leitura de cada layout está correta.
      expect(conferencia.saldoConfere).toBe(true);
      expect(conferencia.impedimentos).toHaveLength(0);

      const ofx = gerarOfx({
        banco: lido.banco,
        competenciaInicio: lido.competenciaInicio!,
        competenciaFim: lido.competenciaFim!,
        saldoFinal: lido.saldoFinal,
        geradoEm: new Date("2026-09-01T12:00:00.000Z"),
        lancamentos: conferencia.lancamentos.map((l) => ({
          data: l.data,
          historico: l.historico,
          valor: l.valor,
          identificador: `x-${l.ordem}`,
        })),
      });

      expect(ofx.match(/<STMTTRN>/g)).toHaveLength(10);
    });
  }

  it("os três layouts chegam ao mesmo resultado", async () => {
    const resultados = await Promise.all(
      casos.map(async ([arquivo]) => {
        const { texto } = await lerPdf(arquivo);
        const lido = reconhecer(texto)!.parse(texto);
        return lido.lancamentos.map((l) => l.valor);
      }),
    );

    expect(resultados[1]).toEqual(resultados[0]);
    expect(resultados[2]).toEqual(resultados[0]);
  });
});

describe("os casos que precisam falhar", () => {
  it("não reconhece o layout desconhecido — e não chuta", async () => {
    const { texto } = await lerPdf("horizonte-layout-desconhecido.pdf");

    // Este é o extrato que cai no caminho de leitura assistida. Chutar um
    // parser aqui produziria contabilidade errada.
    expect(reconhecer(texto)).toBeUndefined();
  });

  it("recusa gerar OFX quando a soma não fecha com o saldo", async () => {
    const { texto } = await lerPdf("aurora-soma-nao-fecha.pdf");

    const lido = reconhecer(texto)!.parse(texto);
    const conferencia = conferir(lido, OrigemLeitura.PARSER);

    expect(lido.lancamentos).toHaveLength(9);
    expect(conferencia.saldoConfere).toBe(false);
    expect(conferencia.diferencaSaldo).toBeCloseTo(-890, 2);
    expect(conferencia.impedimentos[0]).toContain("OFX não foi gerado");
  });
});

describe("o Pampa e o histórico truncado", () => {
  it("marca para conferência o lançamento que o banco cortou", async () => {
    const { texto } = await lerPdf("pampa-agosto-2026.pdf");
    const lido = reconhecer(texto)!.parse(texto);
    const conferencia = conferir(lido, OrigemLeitura.PARSER);

    const truncados = conferencia.lancamentos.filter((l) =>
      l.motivoConferencia?.includes("truncado"),
    );

    expect(truncados).toHaveLength(1);
    expect(truncados[0].confianca).toBe("BAIXA");
  });
});
