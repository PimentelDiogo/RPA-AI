"use server";

import { signOut } from "@/lib/auth";

export async function sair() {
  await signOut({ redirectTo: "/entrar" });
}
