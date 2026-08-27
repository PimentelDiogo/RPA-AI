import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { prisma } from "@/lib/db";
import { senhaConfere } from "@/lib/auth/senha";
import type { Area, Perfil } from "@/generated/prisma/enums";

/**
 * Autenticação do portal.
 *
 * Login e senha contra a base, sessão em cookie httpOnly assinado — não é tela
 * decorativa que aceita qualquer coisa. A sessão usa estratégia JWT porque o
 * provider de credenciais do Auth.js não suporta sessão em banco; o cookie é
 * assinado com AUTH_SECRET, expira em 8 horas e o perfil vai dentro dele para
 * que a autorização seja decidida no servidor a cada requisição.
 */

const credenciais = z.object({
  email: z.string().email(),
  senha: z.string().min(1),
});

export const { handlers, signIn, signOut, auth } = NextAuth({
  // O portal roda atrás do proxy da hospedagem, então o host da requisição
  // chega por cabeçalho encaminhado. Sem confiar nele, o Auth.js recusa as
  // próprias rotas com um erro genérico de configuração — que foi exatamente
  // o que derrubou o login no primeiro deploy.
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60,
  },
  pages: {
    signIn: "/entrar",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "E-mail", type: "email" },
        senha: { label: "Senha", type: "password" },
      },
      async authorize(dadosBrutos) {
        const dados = credenciais.safeParse(dadosBrutos);
        if (!dados.success) return null;

        const usuario = await prisma.usuario.findUnique({
          where: { email: dados.data.email.toLowerCase() },
        });

        // Usuário inexistente e senha errada devolvem a mesma coisa de
        // propósito: a tela de login não diz qual dos dois falhou.
        if (!usuario || !usuario.ativo) return null;

        const confere = await senhaConfere(dados.data.senha, usuario.senhaHash);
        if (!confere) return null;

        return {
          id: usuario.id,
          name: usuario.nome,
          email: usuario.email,
          perfil: usuario.perfil,
          areas: usuario.areas,
        };
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.perfil = user.perfil;
        token.areas = user.areas;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? "";
      session.user.perfil = token.perfil as Perfil;
      session.user.areas = token.areas as Area[];
      return session;
    },
  },
});
