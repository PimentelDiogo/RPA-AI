import {
  dataBrasileira,
  ExtratoIlegivel,
  linhasUteis,
  valorBrasileiro,
  type ExtratoLido,
  type LancamentoLido,
  type ParserDeExtrato,
} from "./tipos";

/**
 * Banco Pampa — layout enxuto: dia/mês sem ano, e o ano só no cabeçalho da
 * competência.
 *
 *   COMPETENCIA 08/2026
 *   31/07 TED RECEBIDA CLIENTE ................ +1.250,00
 *   02/08 PAGTO FORNECEDOR ALF... ............. -430,55
 *
 * Este banco trunca o histórico com reticências quando ele é longo. O parser
 * lê a linha, mas marca a **ressalva**: o dado veio incompleto do banco, e
 * quem confere precisa saber disso antes de importar.
 */
export class BancoPampa implements ParserDeExtrato {
  readonly banco = "Banco Pampa";

  detect(texto: string): boolean {
    return (
      /BANCO\s+PAMPA/i.test(texto) && /COMPETENCIA\s+\d{2}\/\d{4}/i.test(texto)
    );
  }

  parse(texto: string): ExtratoLido {
    const competencia = texto.match(/COMPETENCIA\s+(\d{2})\/(\d{4})/i);

    if (!competencia) {
      throw new ExtratoIlegivel(
        "O extrato do Banco Pampa não traz a competência, e as datas dele não têm ano.",
      );
    }

    const mesCompetencia = Number(competencia[1]);
    const ano = Number(competencia[2]);

    const lancamentos: LancamentoLido[] = [];

    for (const linha of linhasUteis(texto)) {
      const casou = linha.match(
        /^(\d{2}\/\d{2})\s+(.+?)\s*\.{3,}\s*([+-][\d.,]+)$/,
      );
      if (!casou) continue;

      const [, data, historicoBruto, valor] = casou;
      const historico = historicoBruto.trim();

      // Lançamento de dezembro num extrato de janeiro é do ano anterior.
      const mes = Number(data.slice(3, 5));
      const anoDoLancamento = mes > mesCompetencia ? ano - 1 : ano;

      lancamentos.push({
        data: dataBrasileira(data, anoDoLancamento),
        historico,
        valor: valorBrasileiro(valor),
        ressalva: historico.endsWith("...")
          ? "Histórico truncado pelo banco — confira a descrição antes de importar."
          : undefined,
      });
    }

    if (lancamentos.length === 0) {
      throw new ExtratoIlegivel(
        "O arquivo parece do Banco Pampa, mas nenhuma linha de lançamento foi reconhecida.",
      );
    }

    return {
      banco: this.banco,
      agencia: texto.match(/AG\s+([\d-]+)/i)?.[1],
      conta: texto.match(/CONTA\s+([\d-]+)/i)?.[1],
      saldoInicial: this.saldo(texto, "SALDO ANT"),
      saldoFinal: this.saldo(texto, "SALDO ATUAL"),
      competenciaInicio: lancamentos[0].data,
      competenciaFim: lancamentos[lancamentos.length - 1].data,
      lancamentos,
    };
  }

  private saldo(texto: string, rotulo: string): number | undefined {
    const casou = texto.match(
      new RegExp(`${rotulo}\\s*\\.*\\s*([+-]?[\\d.,]+)`, "i"),
    );
    return casou ? valorBrasileiro(casou[1]) : undefined;
  }
}
