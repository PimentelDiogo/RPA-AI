"use server";

import { revalidatePath } from "next/cache";

import type { ResultadoExecucao } from "@/components/botao-executar";
import { Disparo } from "@/generated/prisma/enums";
import { exigirAcessoAoModulo } from "@/lib/auth/permissoes";
import { prisma } from "@/lib/db";
import { ErroDeNegocio } from "@/lib/execucao/erros";
import { executarModulo } from "@/lib/execucao/motor";
import {
  handlerSc01,
  processarExtrato,
  receberExtrato,
  tentarGerarOfx,
} from "@/modules/sc-01/handler";

const CODIGO = "SC-01";
const ROTA = "/modulos/sc-01";

export type ResultadoUpload = {
  ok: boolean;
  mensagem: string;
  extratoId?: string;
};

/**
 * Upload de extrato.
 *
 * Guarda o arquivo e processa na hora — quem enviou está olhando a tela e
 * espera ver o resultado. O agendamento diário existe para o que chega por
 * outros caminhos e para retomar o que ficou na fila.
 */
export async function enviarExtrato(
  _anterior: ResultadoUpload | null,
  formData: FormData,
): Promise<ResultadoUpload> {
  await exigirAcessoAoModulo(CODIGO);

  const clienteId = String(formData.get("clienteId") ?? "");
  const arquivo = formData.get("arquivo");

  if (!clienteId) {
    return { ok: false, mensagem: "Escolha o cliente do extrato." };
  }

  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { ok: false, mensagem: "Escolha um arquivo para enviar." };
  }

  try {
    const { extratoId } = await receberExtrato({
      clienteId,
      nome: arquivo.name,
      mimeType: arquivo.type || "application/pdf",
      conteudo: new Uint8Array(await arquivo.arrayBuffer()),
    });

    await executarModulo(
      { modulo: CODIGO, disparo: Disparo.MANUAL },
      async (contexto) => {
        const resultado = await processarExtrato(extratoId, undefined, contexto);
        return {
          resumo: `${arquivo.name} · ${resultado.banco ?? "banco não identificado"} · ${resultado.lancamentos} lançamentos`,
        };
      },
    );

    revalidatePath(ROTA);

    const extrato = await prisma.extratoImportado.findUnique({
      where: { id: extratoId },
      select: { banco: true, erro: true, _count: { select: { lancamentos: true } } },
    });

    return {
      ok: !extrato?.erro,
      extratoId,
      mensagem: extrato?.erro
        ? extrato.erro
        : `${extrato?.banco ?? "Extrato"} lido: ${extrato?._count.lancamentos ?? 0} lançamentos.`,
    };
  } catch (erro) {
    revalidatePath(ROTA);

    return {
      ok: false,
      mensagem:
        erro instanceof ErroDeNegocio
          ? `${erro.message}${erro.sugestao ? ` ${erro.sugestao}` : ""}`
          : "Não foi possível importar este arquivo.",
    };
  }
}

/** Varre a fila de extratos recebidos e ainda não processados. */
export async function processarFila(): Promise<ResultadoExecucao> {
  const { sessao } = await exigirAcessoAoModulo(CODIGO);

  const execucao = await executarModulo(
    { modulo: CODIGO, disparo: Disparo.MANUAL, usuarioId: sessao.user.id },
    (contexto) => handlerSc01(contexto),
  );

  revalidatePath(ROTA);

  return {
    ok: execucao.status !== "FALHA",
    execucaoId: execucao.id,
    status: execucao.status,
    resumo: execucao.resumo,
    erro: execucao.erro,
  };
}

/**
 * Aprovação de um lançamento da fila de conferência.
 *
 * Aprovar muda o OFX: o lançamento passa a compor o arquivo, então ele é
 * regerado na hora. Sem isso alguém conferiria e o arquivo continuaria o mesmo.
 */
export async function aprovarLancamento(formData: FormData) {
  const { sessao } = await exigirAcessoAoModulo(CODIGO);
  const id = String(formData.get("lancamentoId") ?? "");

  const lancamento = await prisma.lancamento.update({
    where: { id },
    data: {
      conferido: true,
      conferidoPorId: sessao.user.id,
      conferidoEm: new Date(),
    },
    select: { extratoId: true },
  });

  await tentarGerarOfx(lancamento.extratoId);
  revalidatePath(ROTA);
}
