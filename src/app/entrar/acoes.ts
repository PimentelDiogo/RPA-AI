"use server";

import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

import { signIn } from "@/lib/auth";

/**
 * Login. O erro volta pela URL em vez de derrubar a tela, e nunca diz se foi o
 * e-mail ou a senha que estava errado.
 */
export async function entrar(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      senha: formData.get("senha"),
      redirectTo: "/",
    });
  } catch (erro) {
    // O signIn sinaliza o redirecionamento de sucesso lançando: repassar.
    if (erro instanceof AuthError) {
      redirect(
        erro.type === "CredentialsSignin"
          ? "/entrar?erro=credenciais"
          : "/entrar?erro=falha",
      );
    }
    throw erro;
  }
}
