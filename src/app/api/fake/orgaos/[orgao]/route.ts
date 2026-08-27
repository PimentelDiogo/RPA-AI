import { NextResponse } from "next/server";

import {
  comportamentoDe,
  comportamentoForcado,
  ESPERA_DE_TIMEOUT_MS,
  latenciaMs,
  ORGAOS,
  type OrgaoSlug,
} from "../comportamento";
import { paginaDeConsulta, paginaDeResultado } from "../paginas";

/**
 * Portal simulado de órgão.
 *
 * **Aqui entraria o portal de verdade.** Esta rota existe porque o enunciado
 * não concede acesso a órgão nenhum, e uma automação que só funciona com o
 * arquivo que alguém baixou uma vez não é automação. O que é falso é a
 * fronteira; o que a consome — fila, retry, registro de tentativa, painel — é
 * real.
 *
 *   GET  /api/fake/orgaos/fgts            → página com formulário
 *   POST /api/fake/orgaos/fgts  (cnpj=…)  → página de resultado
 */
export const dynamic = "force-dynamic";

function validarOrgao(valor: string): OrgaoSlug | null {
  return ORGAOS.includes(valor as OrgaoSlug) ? (valor as OrgaoSlug) : null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgao: string }> },
) {
  const { orgao: slug } = await params;
  const orgao = validarOrgao(slug);

  if (!orgao) {
    return new NextResponse("Órgão não encontrado.", { status: 404 });
  }

  // Consulta direta por query, usada pelo adapter HTTP e pela demonstração.
  const cnpj = new URL(request.url).searchParams.get("cnpj");
  if (cnpj) return responder(request, orgao, cnpj);

  return html(paginaDeConsulta(orgao), 200);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgao: string }> },
) {
  const { orgao: slug } = await params;
  const orgao = validarOrgao(slug);

  if (!orgao) {
    return new NextResponse("Órgão não encontrado.", { status: 404 });
  }

  const formulario = await request.formData();
  const cnpj = String(formulario.get("cnpj") ?? "").replace(/\D/g, "");

  if (cnpj.length !== 14) {
    return html(
      paginaDeResultado(orgao, cnpj, { tipo: "formato-inesperado" }).html,
      400,
    );
  }

  return responder(request, orgao, cnpj);
}

async function responder(request: Request, orgao: OrgaoSlug, cnpjBruto: string) {
  const cnpj = cnpjBruto.replace(/\D/g, "");
  const simulado = new URL(request.url).searchParams.get("simular");

  const comportamento =
    comportamentoForcado(simulado) ?? comportamentoDe(cnpj, orgao);

  if (comportamento.tipo === "timeout") {
    // O portal não responde. Quem desiste é o cliente, e é isso que se testa.
    await esperar(ESPERA_DE_TIMEOUT_MS);
  } else {
    await esperar(latenciaMs(cnpj, orgao));
  }

  const { html: corpo, status } = paginaDeResultado(orgao, cnpj, comportamento);
  return html(corpo, status);
}

function html(corpo: string, status: number) {
  return new NextResponse(corpo, {
    status,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function esperar(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
