"use server";

import { revalidatePath } from "next/cache";

import { Disparo } from "@/generated/prisma/enums";
import { exigirAcessoAoModulo } from "@/lib/auth/permissoes";
import { executarModulo } from "@/lib/execucao/motor";
import { handlerSc02 } from "@/modules/sc-02/handler";

const CODIGO = "SC-02";

/** Disparo sob demanda. A permissão é checada aqui, não só na tela. */
export async function consultarAgora() {
  const { sessao } = await exigirAcessoAoModulo(CODIGO);

  await executarModulo(
    { modulo: CODIGO, disparo: Disparo.MANUAL, usuarioId: sessao.user.id },
    (contexto) => handlerSc02(contexto),
  );

  revalidatePath("/modulos/sc-02");
}
