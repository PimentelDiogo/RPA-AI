/**
 * Os sistemas que não conversam entre si.
 *
 * O enunciado descreve o problema: *"alguém repete a mesma sequência de passos
 * em vários sistemas que não se integram, um de cada vez… e como é manual,
 * sempre sobra um sistema em que o bloqueio não foi aplicado."*
 *
 * Cada um é um port. **A credencial de cada sistema entra no adapter real** —
 * ERP financeiro, portal do cliente, sistema de tarefas do escritório. Os
 * adapters desta entrega guardam estado no próprio banco, e o portal mostra
 * esse estado lado a lado: é assim que se vê que não sobrou sistema de fora.
 */

/**
 * O que existia antes de um passo ser aplicado.
 *
 * Guardar isto é o que permite desfazer para o estado **real**, e não para um
 * padrão inventado. No sistema de tarefas, é o responsável de cada tarefa.
 */
export type EstadoAnterior = Record<string, unknown>;

/**
 * Um passo da sequência.
 *
 * `aplicar` e `compensar` são idempotentes: retomar uma saga não pode bloquear
 * duas vezes, e nem quebrar por já estar bloqueado.
 */
export interface PassoDeSistema {
  readonly sistema: string;
  readonly acao: string;
  /** O que o desfazer faz, em uma frase, para a linha do tempo. */
  readonly acaoInversa: string;

  aplicar(clienteId: string): Promise<EstadoAnterior>;
  compensar(clienteId: string, estadoAnterior: EstadoAnterior): Promise<void>;
}

/** Falha vinda de um sistema, com mensagem que o operador entende. */
export class SistemaIndisponivel extends Error {
  constructor(
    readonly sistema: string,
    mensagem: string,
  ) {
    super(mensagem);
    this.name = "SistemaIndisponivel";
  }
}
