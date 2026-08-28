"use server";

import { revalidatePath } from "next/cache";

import type { ResultadoExecucao } from "@/components/botao-executar";
import { Disparo, StatusItem } from "@/generated/prisma/enums";
import { exigirAcessoAoModulo } from "@/lib/auth/permissoes";
import { prisma } from "@/lib/db";
import { ErroDeNegocio } from "@/lib/execucao/erros";
import { executarModulo } from "@/lib/execucao/motor";
import { handlerSc05 } from "@/modules/sc-05/handler";
import {
  bloquear,
  desbloquear,
  retomar,
  reverter,
  type ResultadoSaga,
} from "@/modules/sc-05/saga";

const CODIGO = "SC-05";
const ROTA = "/modulos/sc-05";

export type ResultadoAcao = {
  ok: boolean;
  mensagem: string;
};

/**
 * As ações do módulo.
 *
 * Todas passam pelo motor de execução, para que fiquem no mesmo histórico dos
 * outros módulos — quem bloqueou, quando, quanto durou e o que aconteceu em
 * cada sistema.
 */
async function executarSaga(
  rotulo: string,
  operacao: (execucaoId: string) => Promise<ResultadoSaga>,
): Promise<ResultadoAcao> {
  const { sessao } = await exigirAcessoAoModulo(CODIGO);

  try {
    let resultado: ResultadoSaga | undefined;

    await executarModulo(
      { modulo: CODIGO, disparo: Disparo.MANUAL, usuarioId: sessao.user.id },
      async (contexto) => {
        resultado = await operacao(contexto.execucaoId);

        const passos = await prisma.passoSaga.findMany({
          where: { sagaId: resultado.sagaId },
          orderBy: { ordem: "asc" },
        });

        // Cada passo vira um item: é a linha do tempo que mostra que não
        // sobrou sistema de fora.
        for (const passo of passos) {
          await contexto.registrarItem({
            referencia: `${passo.sistema} — ${passo.acao}`,
            status:
              passo.status === "APLICADO"
                ? StatusItem.SUCESSO
                : passo.status === "FALHOU"
                  ? StatusItem.FALHA
                  : StatusItem.IGNORADO,
            mensagem:
              passo.erro ??
              (passo.status === "PENDENTE"
                ? "Não executado: a sequência parou antes de chegar aqui."
                : undefined),
          });
        }

        return {
          resumo: resultado.concluida
            ? `${rotulo} concluído em ${resultado.total} sistemas.`
            : `${rotulo} parou no meio: ${resultado.aplicados} de ${resultado.total} sistemas alterados (${resultado.falha?.sistema}).`,
        };
      },
    );

    revalidatePath(ROTA);

    return {
      ok: resultado?.concluida ?? false,
      mensagem: resultado?.concluida
        ? `${rotulo} concluído nos ${resultado.total} sistemas.`
        : `${rotulo} parou em ${resultado?.falha?.sistema}: ${resultado?.falha?.mensagem} Nada foi decidido sozinho — escolha retomar ou reverter.`,
    };
  } catch (erro) {
    revalidatePath(ROTA);

    return {
      ok: false,
      mensagem:
        erro instanceof ErroDeNegocio
          ? erro.message
          : `Não foi possível concluir o ${rotulo.toLowerCase()}.`,
    };
  }
}

export async function bloquearCliente(
  _anterior: ResultadoAcao | null,
  formData: FormData,
): Promise<ResultadoAcao> {
  const clienteId = String(formData.get("clienteId") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!motivo) {
    return { ok: false, mensagem: "Informe o motivo do bloqueio." };
  }

  return executarSaga("Bloqueio", (execucaoId) =>
    bloquear({ clienteId, motivo, execucaoId }),
  );
}

export async function desbloquearCliente(
  _anterior: ResultadoAcao | null,
  formData: FormData,
): Promise<ResultadoAcao> {
  const clienteId = String(formData.get("clienteId") ?? "");
  const motivo = String(formData.get("motivo") ?? "").trim();

  if (!motivo) {
    return { ok: false, mensagem: "Informe o motivo do desbloqueio." };
  }

  return executarSaga("Desbloqueio", (execucaoId) =>
    desbloquear({ clienteId, motivo, execucaoId }),
  );
}

export async function retomarSequencia(formData: FormData) {
  const clienteId = String(formData.get("clienteId") ?? "");
  await executarSaga("Retomada do bloqueio", () => retomar(clienteId));
}

export async function reverterSequencia(formData: FormData) {
  const clienteId = String(formData.get("clienteId") ?? "");
  await executarSaga("Reversão", () => reverter(clienteId));
}

/** Liga e desliga a falha simulada de um sistema, para demonstrar falha parcial. */
export async function alternarFalha(formData: FormData) {
  await exigirAcessoAoModulo(CODIGO);

  const sistema = String(formData.get("sistema") ?? "");
  const falhar = formData.get("falhar") === "sim";

  await prisma.falhaSimulada.upsert({
    where: { sistema },
    create: { sistema, falhar },
    update: { falhar },
  });

  revalidatePath(ROTA);
}

/** Varredura de consistência, também disparável à mão. */
export async function verificarConsistencia(): Promise<ResultadoExecucao> {
  const { sessao } = await exigirAcessoAoModulo(CODIGO);

  const execucao = await executarModulo(
    { modulo: CODIGO, disparo: Disparo.MANUAL, usuarioId: sessao.user.id },
    (contexto) => handlerSc05(contexto),
  );

  revalidatePath(ROTA);

  return {
    ok: execucao.status !== "FALHA",
    execucaoId: execucao.id,
    status: execucao.status,
    resumo: execucao.resumo,
    erro: execucao.erro,
  };
}
