import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { baseDosOrgaos } from "@/modules/sc-02/orgaos";

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

/**
 * Sinalizadores da plataforma. Estes três são valores fixos definidos pela
 * hospedagem, nunca conteúdo digitado por alguém — podem aparecer inteiros.
 */
const SINALIZADORES = [
  "NODE_ENV",
  "VERCEL",
  "VERCEL_ENV",
  // Endereços públicos da hospedagem, não segredo. Estão aqui porque a
  // aplicação consulta o portal simulado que ela mesma serve, e descobrir qual
  // endereço ela está usando custou uma rodada de diagnóstico.
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const;

/**
 * Variáveis de configuração que alguém preenche à mão. O valor NUNCA é
 * exibido, mesmo quando "deveria" ser inofensivo: já aconteceu de um segredo
 * ser colado na variável errada, e um diagnóstico público que ecoa o que
 * recebe transforma o erro de digitação em vazamento. O que se mostra é a
 * forma do valor, que é o que ajuda a achar o engano.
 */
const CONFIGURACOES = ["AUTH_TRUST_HOST", "AUTH_URL"] as const;

function descrever(nome: string): string {
  const valor = process.env[nome];
  if (valor === undefined) return "não definida";
  if (valor.trim().length === 0) return "definida, porém vazia";

  if (nome.endsWith("_URL")) {
    try {
      const url = new URL(valor);
      return `definida (${url.protocol}//${url.host})`;
    } catch {
      return "definida, mas o valor NÃO é uma URL válida";
    }
  }

  return "definida";
}

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

  const plataforma = Object.fromEntries([
    ...SINALIZADORES.map((nome) => [nome, process.env[nome] ?? "não definida"]),
    ...CONFIGURACOES.map((nome) => [nome, descrever(nome)]),
  ]);

  const [banco, autenticacao] = await Promise.all([
    verificarBanco(),
    verificarAutenticacao(),
  ]);

  const ok = faltando.length === 0 && banco.ok && autenticacao.ok;

  return NextResponse.json(
    {
      ok,
      ambiente,
      plataforma,
      // Para onde o SC-02 vai consultar. Erro aqui é silencioso: a consulta
      // "funciona" e devolve a página errada.
      portaisDosOrgaos: enderecoDosOrgaos(),
      banco,
      autenticacao,
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

function enderecoDosOrgaos(): string {
  try {
    return baseDosOrgaos();
  } catch (erro) {
    return `não configurado: ${erro instanceof Error ? erro.message : String(erro)}`;
  }
}

/**
 * O Auth.js responde "There was a problem with the server configuration" para
 * qualquer erro de configuração, sem dizer qual. Aqui a configuração é
 * exercitada de verdade e o tipo do erro aparece — que é a diferença entre
 * corrigir e adivinhar.
 */
async function verificarAutenticacao() {
  try {
    await auth();
    return { ok: true, detalhe: "configuração válida" };
  } catch (erro) {
    const tipo =
      erro && typeof erro === "object" && "type" in erro
        ? String((erro as { type: unknown }).type)
        : erro instanceof Error
          ? erro.name
          : "desconhecido";

    return {
      ok: false,
      detalhe: "configuração inválida",
      tipo,
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
