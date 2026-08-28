import {
  dataIso,
  ExtratoIlegivel,
  linhasUteis,
  type ExtratoLido,
  type LancamentoLido,
  type ParserDeExtrato,
} from "./tipos";

/**
 * Banco Meridiano — campos separados por barra vertical, data ISO e valor com
 * sinal no padrão americano.
 *
 *   2026-07-31|TED RECEBIDA CLIENTE|1250.00
 *   2026-08-02|DEBITO FORNECEDOR ALFA|-430.55
 *
 * Não tem nada em comum com o Aurora além de ser um extrato — que é exatamente
 * o ponto do registry.
 */
export class BancoMeridiano implements ParserDeExtrato {
  readonly banco = "Banco Meridiano";

  detect(texto: string): boolean {
    return /MERIDIANO/i.test(texto) && /\d{4}-\d{2}-\d{2}\|/.test(texto);
  }

  parse(texto: string): ExtratoLido {
    const lancamentos: LancamentoLido[] = [];

    for (const linha of linhasUteis(texto)) {
      const casou = linha.match(/^(\d{4}-\d{2}-\d{2})\|(.+?)\|(-?\d+\.\d{2})$/);
      if (!casou) continue;

      const [, data, historico, valor] = casou;

      lancamentos.push({
        data: dataIso(data),
        historico: historico.trim(),
        valor: Number(valor),
      });
    }

    if (lancamentos.length === 0) {
      throw new ExtratoIlegivel(
        "O arquivo parece do Banco Meridiano, mas nenhuma linha de lançamento foi reconhecida.",
      );
    }

    return {
      banco: this.banco,
      agencia: texto.match(/AG=(\S+)/i)?.[1],
      conta: texto.match(/CC=(\S+)/i)?.[1],
      saldoInicial: this.saldo(texto, "SALDO_INICIAL"),
      saldoFinal: this.saldo(texto, "SALDO_FINAL"),
      competenciaInicio: lancamentos[0].data,
      competenciaFim: lancamentos[lancamentos.length - 1].data,
      lancamentos,
    };
  }

  private saldo(texto: string, rotulo: string): number | undefined {
    const casou = texto.match(new RegExp(`${rotulo}=(-?\\d+\\.\\d{2})`));
    return casou ? Number(casou[1]) : undefined;
  }
}
