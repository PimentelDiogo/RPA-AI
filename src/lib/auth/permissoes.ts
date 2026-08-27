import { notFound, redirect } from "next/navigation";
import type { Session } from "next-auth";

import { auth } from "@/lib/auth";
import { MODULOS, type Modulo } from "@/modules/catalogo";

/**
 * Autorização do portal.
 *
 * Regra do enunciado: o administrador enxerga tudo; o operador enxerga apenas
 * os módulos da área dele. A decisão é sempre tomada no servidor — a tela
 * apenas reflete o que estas funções já concluíram.
 */

/** Sessão obrigatória. Sem ela, o usuário volta para a tela de login. */
export async function exigirSessao(): Promise<Session> {
  const sessao = await auth();
  if (!sessao?.user) redirect("/entrar");
  return sessao;
}

export function podeVerModulo(sessao: Session, modulo: Modulo): boolean {
  if (sessao.user.perfil === "ADMIN") return true;
  return sessao.user.areas.includes(modulo.area);
}

export function modulosVisiveis(sessao: Session): Modulo[] {
  return MODULOS.filter((modulo) => podeVerModulo(sessao, modulo));
}

/**
 * Acesso a um módulo específico. Quem não tem direito recebe 404 em vez de 403:
 * não confirma para o operador que o módulo existe fora da área dele.
 */
export async function exigirAcessoAoModulo(codigo: string): Promise<{
  sessao: Session;
  modulo: Modulo;
}> {
  const sessao = await exigirSessao();
  const modulo = MODULOS.find((item) => item.codigo === codigo);

  if (!modulo || !podeVerModulo(sessao, modulo)) {
    // 404 e não 403: negar com "sem permissão" confirmaria para o operador
    // que o módulo existe fora da área dele.
    notFound();
  }

  return { sessao, modulo };
}
