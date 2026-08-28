import { prisma } from "@/lib/db";
import {
  SistemaIndisponivel,
  type EstadoAnterior,
  type PassoDeSistema,
} from "@/modules/sc-05/ports/sistemas";

/**
 * Os três sistemas simulados.
 *
 * Cada um guarda estado próprio no banco, e o portal mostra esses estados lado
 * a lado — é o que responde "não sobrou sistema sem bloqueio". Num ambiente
 * real, cada adapter falaria com o sistema de verdade e receberia a credencial
 * por variável de ambiente; o executor de saga não saberia a diferença.
 */

/** O responsável que fica no lugar do original enquanto o cliente está bloqueado. */
export const MARCADOR_DE_BLOQUEIO = "🔒 Bloqueado — aguardando regularização";

/** Interruptor de falha, para a demonstração não depender de sorte. */
async function conferirFalhaSimulada(sistema: string): Promise<void> {
  const configuracao = await prisma.falhaSimulada.findUnique({
    where: { sistema },
    select: { falhar: true },
  });

  if (configuracao?.falhar) {
    throw new SistemaIndisponivel(
      sistema,
      `O ${sistema} não respondeu. O passo não foi aplicado.`,
    );
  }
}

/**
 * Sistema financeiro — marca e desmarca a inadimplência.
 */
export class PassoSistemaFinanceiro implements PassoDeSistema {
  readonly sistema = "Sistema Financeiro";
  readonly acao = "Marcar cliente como inadimplente";
  readonly acaoInversa = "Limpar a marcação de inadimplência";

  async aplicar(clienteId: string): Promise<EstadoAnterior> {
    await conferirFalhaSimulada(this.sistema);

    const antes = await prisma.registroFinanceiro.findUnique({
      where: { clienteId },
      select: { inadimplente: true },
    });

    // Idempotente: aplicar de novo não muda nada além da data.
    await prisma.registroFinanceiro.upsert({
      where: { clienteId },
      create: { clienteId, inadimplente: true, marcadoEm: new Date() },
      update: { inadimplente: true, marcadoEm: new Date() },
    });

    return { inadimplente: antes?.inadimplente ?? false };
  }

  async compensar(clienteId: string, estadoAnterior: EstadoAnterior) {
    await conferirFalhaSimulada(this.sistema);

    await prisma.registroFinanceiro.upsert({
      where: { clienteId },
      create: {
        clienteId,
        inadimplente: Boolean(estadoAnterior.inadimplente),
      },
      update: {
        inadimplente: Boolean(estadoAnterior.inadimplente),
        marcadoEm: null,
      },
    });
  }
}

/**
 * Portal do cliente — revoga e restaura o acesso.
 */
export class PassoPortalCliente implements PassoDeSistema {
  readonly sistema = "Portal do Cliente";
  readonly acao = "Revogar o acesso ao portal";
  readonly acaoInversa = "Restaurar o acesso ao portal";

  async aplicar(clienteId: string): Promise<EstadoAnterior> {
    await conferirFalhaSimulada(this.sistema);

    const antes = await prisma.acessoPortalCliente.findUnique({
      where: { clienteId },
      select: { ativo: true },
    });

    await prisma.acessoPortalCliente.upsert({
      where: { clienteId },
      create: { clienteId, ativo: false, revogadoEm: new Date() },
      update: { ativo: false, revogadoEm: new Date() },
    });

    return { ativo: antes?.ativo ?? true };
  }

  async compensar(clienteId: string, estadoAnterior: EstadoAnterior) {
    await conferirFalhaSimulada(this.sistema);

    await prisma.acessoPortalCliente.upsert({
      where: { clienteId },
      create: { clienteId, ativo: Boolean(estadoAnterior.ativo) },
      update: { ativo: Boolean(estadoAnterior.ativo), revogadoEm: null },
    });
  }
}

/**
 * Sistema de tarefas — **o passo da armadilha**.
 *
 * O enunciado é explícito: *"o cliente não é desativado no sistema de tarefas,
 * porque a maioria renegocia depois e recriar o histórico dá mais trabalho. O
 * que se faz é trocar o responsável das tarefas por um marcador de bloqueado."*
 *
 * Então este passo **não desativa nada**. Ele troca o responsável de cada
 * tarefa aberta e guarda o original, tarefa por tarefa — devolver todas para
 * uma pessoa só perderia informação.
 */
export class PassoSistemaTarefas implements PassoDeSistema {
  readonly sistema = "Sistema de Tarefas";
  readonly acao = "Trocar o responsável das tarefas pelo marcador de bloqueado";
  readonly acaoInversa = "Devolver cada tarefa ao responsável original";

  async aplicar(clienteId: string): Promise<EstadoAnterior> {
    await conferirFalhaSimulada(this.sistema);

    const tarefas = await prisma.tarefaCliente.findMany({
      where: { clienteId, concluida: false },
      select: { id: true, responsavel: true, responsavelOriginal: true },
    });

    const responsaveis: Record<string, string> = {};

    for (const tarefa of tarefas) {
      // Idempotente: se já está com o marcador, preserva o original que já
      // havia sido guardado — reaplicar não pode apagar quem era o dono.
      const original = tarefa.responsavelOriginal ?? tarefa.responsavel;
      responsaveis[tarefa.id] = original;

      await prisma.tarefaCliente.update({
        where: { id: tarefa.id },
        data: {
          responsavel: MARCADOR_DE_BLOQUEIO,
          responsavelOriginal: original,
        },
      });
    }

    return { responsaveis, tarefasAfetadas: tarefas.length };
  }

  async compensar(clienteId: string, estadoAnterior: EstadoAnterior) {
    await conferirFalhaSimulada(this.sistema);

    const responsaveis = (estadoAnterior.responsaveis ?? {}) as Record<
      string,
      string
    >;

    for (const [tarefaId, responsavel] of Object.entries(responsaveis)) {
      await prisma.tarefaCliente.update({
        where: { id: tarefaId },
        data: { responsavel, responsavelOriginal: null },
      });
    }
  }
}

/**
 * A sequência, declarada como dado.
 *
 * O executor é genérico: acrescentar um quarto sistema é acrescentar um item
 * aqui. O desbloqueio percorre esta mesma lista de trás para frente.
 */
export const PASSOS_DO_BLOQUEIO: readonly PassoDeSistema[] = [
  new PassoSistemaFinanceiro(),
  new PassoPortalCliente(),
  new PassoSistemaTarefas(),
];
