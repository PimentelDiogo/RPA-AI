"use server";

import { revalidatePath } from "next/cache";

import { Disparo } from "@/generated/prisma/enums";
import { exigirAcessoAoModulo } from "@/lib/auth/permissoes";
import { executarModulo } from "@/lib/execucao/motor";
import { definirJanela } from "@/modules/sc-20/configuracao";
import { handlerSc20 } from "@/modules/sc-20/handler";

const CODIGO = "SC-20";
const ROTA = "/modulos/sc-20";

/**
 * Disparo sob demanda. A permissão é checada aqui de novo, e não só na tela:
 * server action é um endpoint, e endpoint que confia na tela não protege nada.
 */
export async function executarAgora() {
  const { sessao } = await exigirAcessoAoModulo(CODIGO);

  await executarModulo(
    { modulo: CODIGO, disparo: Disparo.MANUAL, usuarioId: sessao.user.id },
    (contexto) => handlerSc20(contexto),
  );

  revalidatePath(ROTA);
}

/** Ajuste da janela de alerta. Só o administrador muda regra de negócio. */
export async function alterarJanela(formData: FormData) {
  const { sessao } = await exigirAcessoAoModulo(CODIGO);

  if (sessao.user.perfil !== "ADMIN") {
    throw new Error("Apenas o administrador altera a janela de alerta.");
  }

  await definirJanela(Number(formData.get("janelaDias")));
  revalidatePath(ROTA);
}
