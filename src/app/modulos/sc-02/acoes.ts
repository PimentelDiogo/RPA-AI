"use server";

import { revalidatePath } from "next/cache";

import type { ResultadoExecucao } from "@/components/botao-executar";
import { Disparo } from "@/generated/prisma/enums";
import { exigirAcessoAoModulo } from "@/lib/auth/permissoes";
import { executarModulo } from "@/lib/execucao/motor";
import { handlerSc02 } from "@/modules/sc-02/handler";

const CODIGO = "SC-02";

/**
 * Disparo sob demanda. A permissão é checada aqui, não só na tela.
 *
 * Devolve o resultado para a tela mostrar o que aconteceu e apontar onde
 * conferir — uma rodada consulta 48 portais e leva alguns segundos.
 */
export async function consultarAgora(): Promise<ResultadoExecucao> {
  const { sessao } = await exigirAcessoAoModulo(CODIGO);

  const execucao = await executarModulo(
    { modulo: CODIGO, disparo: Disparo.MANUAL, usuarioId: sessao.user.id },
    (contexto) => handlerSc02(contexto),
  );

  revalidatePath("/modulos/sc-02");

  return {
    ok: execucao.status !== "FALHA",
    execucaoId: execucao.id,
    status: execucao.status,
    resumo: execucao.resumo,
    erro: execucao.erro,
  };
}
