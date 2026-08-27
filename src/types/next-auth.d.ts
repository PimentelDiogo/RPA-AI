import type { DefaultSession } from "next-auth";

import type { Area, Perfil } from "@/generated/prisma/enums";

/**
 * O perfil e as áreas viajam na sessão para que a decisão de "este usuário
 * enxerga este módulo?" seja tomada no servidor sem ir ao banco a cada tela.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      perfil: Perfil;
      areas: Area[];
    } & DefaultSession["user"];
  }

  interface User {
    perfil: Perfil;
    areas: Area[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    perfil: Perfil;
    areas: Area[];
  }
}
