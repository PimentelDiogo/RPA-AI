import { EstadoBloqueio, StatusItem } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { ContextoExecucao, ResultadoHandler } from "@/lib/execucao/motor";
import { MARCADOR_DE_BLOQUEIO } from "@/modules/sc-05/adapters/sistemas-mock";

/**
 * Verificação de consistência do SC-05.
 *
 * O bloqueio em si é sob demanda — o gatilho é uma decisão comercial, não o
 * relógio. O que roda agendado é esta varredura, que procura o problema que o
 * enunciado descreve: *"sempre sobra um sistema em que o bloqueio não foi
 * aplicado."*
 *
 * Ela compara o estado registrado com o estado real dos três sistemas e aponta
 * a divergência. Não corrige sozinha: mexer em sistema de cliente sem alguém
 * mandar é como o problema começa.
 */
export async function handlerSc05(
  contexto: ContextoExecucao,
): Promise<ResultadoHandler> {
  const clientes = await prisma.cliente.findMany({
    where: { ativo: true },
    select: {
      id: true,
      razaoSocial: true,
      nomeFantasia: true,
      bloqueio: { select: { estado: true } },
      financeiro: { select: { inadimplente: true } },
      acessoPortal: { select: { ativo: true } },
      tarefas: {
        where: { concluida: false },
        select: { responsavel: true },
      },
    },
    orderBy: { razaoSocial: "asc" },
  });

  let consistentes = 0;
  let divergentes = 0;
  let parciais = 0;

  for (const cliente of clientes) {
    const nome = cliente.nomeFantasia ?? cliente.razaoSocial;
    const estado = cliente.bloqueio?.estado ?? EstadoBloqueio.LIVRE;

    const sistemas = {
      financeiro: cliente.financeiro?.inadimplente ?? false,
      portal: cliente.acessoPortal?.ativo === false,
      tarefas:
        cliente.tarefas.length > 0 &&
        cliente.tarefas.every((t) => t.responsavel === MARCADOR_DE_BLOQUEIO),
    };

    const aplicados = Object.values(sistemas).filter(Boolean).length;

    if (estado === EstadoBloqueio.PARCIAL) {
      parciais += 1;
      await contexto.registrarItem({
        referencia: nome,
        status: StatusItem.FALHA,
        mensagem: `Sequência parada no meio: ${aplicados} de 3 sistemas alterados. Alguém precisa retomar ou reverter.`,
        dados: sistemas,
      });
      continue;
    }

    const deveriaEstarBloqueado = estado === EstadoBloqueio.BLOQUEADO;
    const coerente = deveriaEstarBloqueado
      ? aplicados === 3
      : aplicados === 0;

    if (coerente) {
      consistentes += 1;
      continue;
    }

    // A divergência que o processo manual produz e ninguém vê.
    divergentes += 1;
    await contexto.registrarItem({
      referencia: nome,
      status: StatusItem.FALHA,
      mensagem: deveriaEstarBloqueado
        ? `Registrado como bloqueado, mas só ${aplicados} de 3 sistemas estão aplicados.`
        : `Registrado como livre, mas ${aplicados} de 3 sistemas ainda estão bloqueados.`,
      dados: sistemas,
    });
  }

  return {
    resumo: `${clientes.length} clientes verificados · ${consistentes} consistentes · ${divergentes} divergentes · ${parciais} com sequência parada`,
  };
}
