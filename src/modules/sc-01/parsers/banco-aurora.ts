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
 * Banco Aurora — data por extenso e sufixo C/D no fim da linha.
 *
 *   31/07/2026  TRANSFERENCIA RECEBIDA CLIENTE        1.250,00 C
 *   02/08/2026  PAGAMENTO FORNECEDOR ALFA               430,55 D
 *
 * Os bancos deste projeto são fictícios, como toda a massa. O que importa é
 * que cada um imprime de um jeito — esse é o problema real.
 */
export class BancoAurora implements ParserDeExtrato {
  readonly banco = "Banco Aurora";

  detect(texto: string): boolean {
    return /BANCO\s+AURORA/i.test(texto) && /EXTRATO\s+DE\s+CONTA/i.test(texto);
  }

  parse(texto: string): ExtratoLido {
    const agencia = texto.match(/Ag[êe]ncia:\s*([\d-]+)/i)?.[1];
    const conta = texto.match(/Conta:\s*([\d-]+)/i)?.[1];

    const lancamentos: LancamentoLido[] = [];

    for (const linha of linhasUteis(texto)) {
      // data · histórico · valor · C (crédito) ou D (débito)
      //
      // O histórico é preguiçoso e o valor é o último número antes do C/D:
      // extrair texto de PDF colapsa espaços, então não dá para separar as
      // colunas pelo alinhamento — só pela forma de cada campo. E o histórico
      // pode conter número ("DUPLICATA 4471") sem confundir a leitura, porque
      // `[\d.,]+` não atravessa espaço.
      const casou = linha.match(
        /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d.,]+)\s*([CD])$/,
      );
      if (!casou) continue;

      const [, data, historico, valor, tipo] = casou;
      const numero = valorBrasileiro(valor);

      lancamentos.push({
        data: dataBrasileira(data),
        historico: historico.trim(),
        valor: tipo === "D" ? -numero : numero,
      });
    }

    if (lancamentos.length === 0) {
      throw new ExtratoIlegivel(
        "O arquivo tem o cabeçalho do Banco Aurora, mas nenhuma linha de lançamento foi reconhecida.",
      );
    }

    return {
      banco: this.banco,
      agencia,
      conta,
      saldoInicial: this.saldo(texto, "SALDO ANTERIOR"),
      saldoFinal: this.saldo(texto, "SALDO FINAL"),
      competenciaInicio: lancamentos[0].data,
      competenciaFim: lancamentos[lancamentos.length - 1].data,
      lancamentos,
    };
  }

  private saldo(texto: string, rotulo: string): number | undefined {
    const casou = texto.match(
      new RegExp(`${rotulo}[^\\d-]*([\\d.,]+)\\s*([CD])?`, "i"),
    );
    if (!casou) return undefined;

    const numero = valorBrasileiro(casou[1]);
    return casou[2] === "D" ? -numero : numero;
  }
}
