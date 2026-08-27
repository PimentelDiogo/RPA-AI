import { CronExpressionParser } from "cron-parser";

/**
 * Leitura das expressões cron dos agendamentos.
 *
 * Tudo é resolvido no fuso `America/Sao_Paulo`, que é onde a operação está:
 * "todo dia às 8h" precisa ser 8h em São Paulo, não 8h em UTC — a diferença
 * de três horas colocaria o aviso da véspera no dia seguinte.
 */
export const FUSO_OPERACAO = "America/Sao_Paulo";

export class CronInvalido extends Error {
  constructor(expressao: string, causa: unknown) {
    super(`Expressão de agendamento inválida: "${expressao}"`, { cause: causa });
    this.name = "CronInvalido";
  }
}

export function proximaOcorrencia(expressao: string, apartirDe: Date): Date {
  try {
    return CronExpressionParser.parse(expressao, {
      currentDate: apartirDe,
      tz: FUSO_OPERACAO,
    })
      .next()
      .toDate();
  } catch (causa) {
    throw new CronInvalido(expressao, causa);
  }
}

export function cronValido(expressao: string): boolean {
  try {
    proximaOcorrencia(expressao, new Date());
    return true;
  } catch {
    return false;
  }
}
