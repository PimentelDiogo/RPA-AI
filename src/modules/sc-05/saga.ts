import type { Prisma } from "@/generated/prisma/client";
import {
  DirecaoSaga,
  EstadoBloqueio,
  StatusPasso,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { ErroDeNegocio } from "@/lib/execucao/erros";
import { PASSOS_DO_BLOQUEIO } from "@/modules/sc-05/adapters/sistemas-mock";
import type { PassoDeSistema } from "@/modules/sc-05/ports/sistemas";

/**
 * O executor de saga.
 *
 * O problema que ele resolve está no enunciado: *"como é manual, sempre sobra
 * um sistema em que o bloqueio não foi aplicado."* Isso é falha parcial numa
 * sequência distribuída, e a resposta é:
 *
 *   - passos idempotentes, cada um com o seu `compensar()`;
 *   - `estadoAnterior` gravado antes de aplicar, para o desfazer voltar ao
 *     estado real;
 *   - falha **para** a sequência e deixa o estado `PARCIAL` visível, em vez de
 *     seguir em frente ou reverter por conta própria.
 *
 * O executor é genérico: os passos são dados. Acrescentar um quarto sistema
 * não exige tocar neste arquivo.
 */

export type ResultadoSaga = {
  sagaId: string;
  concluida: boolean;
  aplicados: number;
  total: number;
  /** Preenchido quando a sequência parou no meio. */
  falha?: { sistema: string; mensagem: string };
};

/** Inicia (ou retoma) o bloqueio de um cliente. */
export async function bloquear(dados: {
  clienteId: string;
  motivo: string;
  execucaoId?: string;
  passos?: readonly PassoDeSistema[];
}): Promise<ResultadoSaga> {
  const passos = dados.passos ?? PASSOS_DO_BLOQUEIO;

  if (!dados.motivo?.trim()) {
    // Ação com efeito sobre o cliente não acontece sem justificativa.
    throw new ErroDeNegocio("Informe o motivo do bloqueio.");
  }

  const estado = await estadoAtual(dados.clienteId);

  if (estado === EstadoBloqueio.BLOQUEADO) {
    throw new ErroDeNegocio("Este cliente já está bloqueado em todos os sistemas.");
  }

  // Uma sequência parada no meio é retomada, não recomeçada do zero.
  const pendente = await sagaEmAberto(dados.clienteId, DirecaoSaga.BLOQUEIO);

  const saga =
    pendente ??
    (await criarSaga({
      clienteId: dados.clienteId,
      direcao: DirecaoSaga.BLOQUEIO,
      motivo: dados.motivo,
      execucaoId: dados.execucaoId,
      passos,
    }));

  return executar(saga.id, passos, dados.clienteId);
}

/**
 * Desbloqueia — **compensando a mesma saga**, na ordem inversa.
 *
 * Não é uma segunda rotina: duas rotinas divergem na primeira manutenção, que
 * é exatamente o problema que o processo manual tem hoje.
 */
export async function desbloquear(dados: {
  clienteId: string;
  motivo: string;
  execucaoId?: string;
  passos?: readonly PassoDeSistema[];
}): Promise<ResultadoSaga> {
  const passos = dados.passos ?? PASSOS_DO_BLOQUEIO;

  if (!dados.motivo?.trim()) {
    throw new ErroDeNegocio("Informe o motivo do desbloqueio.");
  }

  const bloqueio = await prisma.sagaBloqueio.findFirst({
    where: { clienteId: dados.clienteId, direcao: DirecaoSaga.BLOQUEIO },
    orderBy: { criadaEm: "desc" },
    include: { passos: { orderBy: { ordem: "asc" } } },
  });

  const aplicados = bloqueio?.passos.filter(
    (passo) => passo.status === StatusPasso.APLICADO,
  );

  if (!bloqueio || !aplicados?.length) {
    throw new ErroDeNegocio(
      "Não há bloqueio aplicado para desfazer neste cliente.",
    );
  }

  await prisma.bloqueioCliente.update({
    where: { clienteId: dados.clienteId },
    data: { estado: EstadoBloqueio.REVERTENDO },
  });

  return compensar(bloqueio.id, passos, dados.clienteId, dados.motivo, dados.execucaoId);
}

/** Retoma uma sequência que parou no meio, do passo que falhou em diante. */
export async function retomar(clienteId: string): Promise<ResultadoSaga> {
  const saga = await sagaEmAberto(clienteId, DirecaoSaga.BLOQUEIO);

  if (!saga) {
    throw new ErroDeNegocio("Não há sequência parada para retomar.");
  }

  return executar(saga.id, PASSOS_DO_BLOQUEIO, clienteId);
}

/** Reverte o que já foi aplicado numa sequência parada no meio. */
export async function reverter(
  clienteId: string,
  motivo = "Reversão de bloqueio parcial",
): Promise<ResultadoSaga> {
  const saga = await sagaEmAberto(clienteId, DirecaoSaga.BLOQUEIO);

  if (!saga) {
    throw new ErroDeNegocio("Não há sequência parada para reverter.");
  }

  return compensar(saga.id, PASSOS_DO_BLOQUEIO, clienteId, motivo);
}

// ---------------------------------------------------------------------------

async function executar(
  sagaId: string,
  passos: readonly PassoDeSistema[],
  clienteId: string,
): Promise<ResultadoSaga> {
  const registros = await prisma.passoSaga.findMany({
    where: { sagaId },
    orderBy: { ordem: "asc" },
  });

  let aplicados = registros.filter(
    (passo) => passo.status === StatusPasso.APLICADO,
  ).length;

  for (const registro of registros) {
    // Idempotência no nível da saga: o que já foi aplicado não roda de novo.
    if (registro.status === StatusPasso.APLICADO) continue;

    const passo = passos[registro.ordem - 1];

    await prisma.passoSaga.update({
      where: { id: registro.id },
      data: { iniciadoEm: new Date(), erro: null },
    });

    try {
      const estadoAnterior = await passo.aplicar(clienteId);

      await prisma.passoSaga.update({
        where: { id: registro.id },
        data: {
          status: StatusPasso.APLICADO,
          // O estado anterior é um objeto livre por natureza: cada sistema
          // guarda o que precisa para desfazer o próprio passo.
          estadoAnterior: estadoAnterior as Prisma.InputJsonValue,
          concluidoEm: new Date(),
        },
      });

      aplicados += 1;
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "O sistema não respondeu.";

      await prisma.passoSaga.update({
        where: { id: registro.id },
        data: { status: StatusPasso.FALHOU, erro: mensagem, concluidoEm: new Date() },
      });

      // Para aqui. Não continua para o próximo sistema, e não reverte sozinha:
      // quem decide é gente, com o que já foi aplicado à vista.
      await prisma.bloqueioCliente.upsert({
        where: { clienteId },
        create: { clienteId, estado: EstadoBloqueio.PARCIAL },
        update: { estado: EstadoBloqueio.PARCIAL },
      });

      return {
        sagaId,
        concluida: false,
        aplicados,
        total: registros.length,
        falha: { sistema: registro.sistema, mensagem },
      };
    }
  }

  const saga = await prisma.sagaBloqueio.update({
    where: { id: sagaId },
    data: { concluida: true, finalizadaEm: new Date() },
    select: { motivo: true },
  });

  await prisma.bloqueioCliente.upsert({
    where: { clienteId },
    create: {
      clienteId,
      estado: EstadoBloqueio.BLOQUEADO,
      motivo: saga.motivo,
      bloqueadoEm: new Date(),
    },
    update: {
      estado: EstadoBloqueio.BLOQUEADO,
      motivo: saga.motivo,
      bloqueadoEm: new Date(),
      desbloqueadoEm: null,
    },
  });

  return { sagaId, concluida: true, aplicados, total: registros.length };
}

async function compensar(
  sagaOrigemId: string,
  passos: readonly PassoDeSistema[],
  clienteId: string,
  motivo: string,
  execucaoId?: string,
): Promise<ResultadoSaga> {
  const origem = await prisma.sagaBloqueio.findUniqueOrThrow({
    where: { id: sagaOrigemId },
    include: { passos: { orderBy: { ordem: "desc" } } },
  });

  const aplicados = origem.passos.filter(
    (passo) => passo.status === StatusPasso.APLICADO,
  );

  // A saga de desbloqueio registra a compensação na ordem em que ela acontece:
  // do último sistema aplicado para o primeiro.
  const saga = await prisma.sagaBloqueio.create({
    data: {
      clienteId,
      direcao: DirecaoSaga.DESBLOQUEIO,
      motivo,
      execucaoId,
      passos: {
        create: aplicados.map((passo, indice) => ({
          ordem: indice + 1,
          sistema: passo.sistema,
          acao: passos[passo.ordem - 1].acaoInversa,
        })),
      },
    },
    include: { passos: { orderBy: { ordem: "asc" } } },
  });

  let compensados = 0;

  for (const [indice, registro] of saga.passos.entries()) {
    const passoOriginal = aplicados[indice];
    const passo = passos[passoOriginal.ordem - 1];

    await prisma.passoSaga.update({
      where: { id: registro.id },
      data: { iniciadoEm: new Date() },
    });

    try {
      await passo.compensar(
        clienteId,
        (passoOriginal.estadoAnterior ?? {}) as Record<string, unknown>,
      );

      await prisma.$transaction([
        prisma.passoSaga.update({
          where: { id: registro.id },
          data: { status: StatusPasso.APLICADO, concluidoEm: new Date() },
        }),
        prisma.passoSaga.update({
          where: { id: passoOriginal.id },
          data: { status: StatusPasso.COMPENSADO },
        }),
      ]);

      compensados += 1;
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "O sistema não respondeu.";

      await prisma.passoSaga.update({
        where: { id: registro.id },
        data: { status: StatusPasso.FALHOU, erro: mensagem, concluidoEm: new Date() },
      });

      // Falhar ao desfazer é o pior caso possível, e precisa ficar visível:
      // parte dos sistemas voltou, parte não.
      await prisma.bloqueioCliente.update({
        where: { clienteId },
        data: { estado: EstadoBloqueio.PARCIAL },
      });

      return {
        sagaId: saga.id,
        concluida: false,
        aplicados: compensados,
        total: saga.passos.length,
        falha: { sistema: registro.sistema, mensagem },
      };
    }
  }

  await prisma.$transaction([
    prisma.sagaBloqueio.update({
      where: { id: saga.id },
      data: { concluida: true, finalizadaEm: new Date() },
    }),
    prisma.bloqueioCliente.update({
      where: { clienteId },
      data: {
        estado: EstadoBloqueio.LIVRE,
        desbloqueadoEm: new Date(),
        motivo: null,
      },
    }),
  ]);

  return {
    sagaId: saga.id,
    concluida: true,
    aplicados: compensados,
    total: saga.passos.length,
  };
}

async function criarSaga(dados: {
  clienteId: string;
  direcao: DirecaoSaga;
  motivo: string;
  execucaoId?: string;
  passos: readonly PassoDeSistema[];
}) {
  return prisma.sagaBloqueio.create({
    data: {
      clienteId: dados.clienteId,
      direcao: dados.direcao,
      motivo: dados.motivo,
      execucaoId: dados.execucaoId,
      passos: {
        create: dados.passos.map((passo, indice) => ({
          ordem: indice + 1,
          sistema: passo.sistema,
          acao: passo.acao,
        })),
      },
    },
  });
}

async function sagaEmAberto(clienteId: string, direcao: DirecaoSaga) {
  return prisma.sagaBloqueio.findFirst({
    where: { clienteId, direcao, concluida: false },
    orderBy: { criadaEm: "desc" },
  });
}

async function estadoAtual(clienteId: string): Promise<EstadoBloqueio> {
  const bloqueio = await prisma.bloqueioCliente.findUnique({
    where: { clienteId },
    select: { estado: true },
  });

  return bloqueio?.estado ?? EstadoBloqueio.LIVRE;
}
