import { NextResponse } from "next/server";

import { TipoArtefato } from "@/generated/prisma/enums";
import { exigirAcessoAoModulo } from "@/lib/auth/permissoes";
import { prisma } from "@/lib/db";

/**
 * Download do OFX gerado.
 *
 * É a saída que o enunciado pede — "arquivo para download" — e por isso passa
 * pela mesma checagem de perfil das telas: rota de download que não verifica
 * sessão entrega dado contábil de cliente a quem tiver o link.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  await exigirAcessoAoModulo("SC-01");
  const { id } = await params;

  const artefato = await prisma.artefato.findFirst({
    where: { execucaoId: id, tipo: TipoArtefato.ARQUIVO },
    orderBy: { criadoEm: "desc" },
  });

  const conteudo = artefato?.conteudo as { ofx?: string } | null;

  if (!conteudo?.ofx) {
    // Não é erro do sistema: é o estado normal de um extrato cujo saldo não
    // fechou ou cujos lançamentos ainda estão na fila de conferência.
    return new NextResponse(
      "O OFX deste extrato ainda não foi gerado. Confira os lançamentos pendentes ou o motivo indicado na tela do módulo.",
      { status: 409, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  return new NextResponse(conteudo.ofx, {
    headers: {
      "content-type": "application/x-ofx; charset=utf-8",
      "content-disposition": `attachment; filename="${artefato!.nome}"`,
    },
  });
}
