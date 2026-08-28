import type { HandlerModulo } from "@/lib/execucao/motor";
import { handlerSc01 } from "@/modules/sc-01/handler";
import { handlerSc02 } from "@/modules/sc-02/handler";
import { handlerSc20 } from "@/modules/sc-20/handler";

/**
 * Registro dos handlers implementados.
 *
 * O catálogo (`catalogo.ts`) diz quais módulos existem; este registro diz
 * quais já sabem rodar. São coisas diferentes de propósito: um módulo aparece
 * na home como "em construção" antes de ter handler, e o agendador precisa
 * saber a diferença entre "não rodou porque não é hora" e "não rodou porque
 * ainda não existe".
 *
 * Cada automação acrescenta uma linha aqui na branch do seu módulo.
 */
const HANDLERS = new Map<string, HandlerModulo>([
  ["SC-01", (contexto) => handlerSc01(contexto)],
  ["SC-02", (contexto) => handlerSc02(contexto)],
  ["SC-20", (contexto) => handlerSc20(contexto)],
]);

export function handlerDoModulo(codigo: string): HandlerModulo | undefined {
  return HANDLERS.get(codigo);
}

export function moduloTemHandler(codigo: string): boolean {
  return HANDLERS.has(codigo);
}
