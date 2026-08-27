import type { HandlerModulo } from "@/lib/execucao/motor";

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
  // ["SC-20", handlerSc20],
]);

export function handlerDoModulo(codigo: string): HandlerModulo | undefined {
  return HANDLERS.get(codigo);
}

export function moduloTemHandler(codigo: string): boolean {
  return HANDLERS.has(codigo);
}
