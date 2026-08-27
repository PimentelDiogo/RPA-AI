import { NextResponse } from "next/server";

import { prisma } from "@/lib/db";

/**
 * GET /api/saude
 *
 * Diagnóstico do ambiente. Responde três perguntas que, sem ele, só se
 * responde por tentativa e erro depois de cada deploy:
 *
 *   1. A aplicação está de pé?
 *   2. As variáveis obrigatórias chegaram ao runtime?
 *   3. O banco responde, e o schema esperado está lá?
 *
 * Informa apenas a **presença** de cada variável, nunca o valor — nem
 * parcialmente. Uma connection string vazada num endpoint público de
 * diagnóstico seria pior do que o problema que ele resolve.
 */
export const dynamic = "force-dynamic";

const OBRIGATORIAS = ["DATABASE_URL", "AUTH_SECRET", "SCHEDULER_TOKEN"] as const;
const OPCIONAIS = ["DIRECT_URL", "ANTHROPIC_API_KEY"] as const;

function definida(nome: string): boolean {
  const valor = process.env[nome];
  return typeof valor === "string" && valor.trim().length > 0;
}

export async function GET() {
  const ambiente = Object.fromEntries([
    ...OBRIGATORIAS.map((nome) => [nome, definida(nome) ? "definida" : "AUSENTE"]),
    ...OPCIONAIS.map((nome) => [nome, definida(nome) ? "definida" : "não definida"]),
  ]);

  const faltando = OBRIGATORIAS.filter((nome) => !definida(nome));

  const banco = await verificarBanco();

  const ok = faltando.length === 0 && banco.ok;

  return NextResponse.json(
    {
      ok,
      ambiente,
      banco,
      // Ajuda a saber se o deploy que respondeu é o que você acabou de publicar.
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "desconhecido",
      regiao: process.env.VERCEL_REGION ?? "local",
    },
    { status: ok ? 200 : 503 },
  );
}

async function verificarBanco() {
  if (!definida("DATABASE_URL")) {
    return { ok: false, detalhe: "DATABASE_URL ausente — nem tentei conectar." };
  }

  try {
    const usuarios = await prisma.usuario.count();
    return {
      ok: true,
      detalhe: "conectado",
      // Zero usuários significa banco migrado mas sem seed: o portal subiria
      // com a tela de login funcionando e ninguém conseguindo entrar.
      usuarios,
    };
  } catch (erro) {
    return {
      ok: false,
      detalhe: "não foi possível consultar o banco",
      causa: semCredenciais(erro instanceof Error ? erro.message : String(erro)),
    };
  }
}

/**
 * Mensagem de erro de banco costuma trazer a connection string. Aqui ela sai
 * antes de virar resposta pública — o endpoint é aberto.
 */
function semCredenciais(mensagem: string): string {
  return mensagem.replace(/\b\w+:\/\/[^\s"']*/g, "<connection string omitida>");
}
