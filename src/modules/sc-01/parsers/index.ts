import { BancoAurora } from "./banco-aurora";
import { BancoMeridiano } from "./banco-meridiano";
import { BancoPampa } from "./banco-pampa";
import type { ParserDeExtrato } from "./tipos";

/**
 * Registry de parsers.
 *
 * **Para aceitar um banco novo:** crie um arquivo que implemente
 * `ParserDeExtrato` e acrescente uma linha nesta lista. Nada mais no módulo
 * muda — nem o handler, nem a validação, nem a geração do OFX, nem a tela.
 *
 * É a resposta direta à armadilha que o enunciado registra neste processo, e é
 * o ponto a apontar na apresentação.
 */
export const PARSERS: readonly ParserDeExtrato[] = [
  new BancoAurora(),
  new BancoMeridiano(),
  new BancoPampa(),
];

/** O primeiro parser que reconhece o layout, ou `undefined` se nenhum. */
export function reconhecer(texto: string): ParserDeExtrato | undefined {
  return PARSERS.find((parser) => parser.detect(texto));
}

export const BANCOS_SUPORTADOS = PARSERS.map((parser) => parser.banco);

export * from "./tipos";
