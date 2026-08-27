import type { Prisma } from "@/generated/prisma/client";
import {
  Disparo,
  StatusExecucao,
  StatusItem,
  TipoArtefato,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { detalheTecnico, mensagemLegivel } from "@/lib/execucao/erros";

/**
 * Motor de execução compartilhado.
 *
 * Todo módulo implementa apenas o seu handler. Histórico, duração, autoria,
 * item a item, artefato e tratamento de erro vêm daqui — é isso que faz quatro
 * automações diferentes se comportarem como um portal só.
 */

export type ItemRegistrado = {
  /** Como o item aparece na tela: nome do cliente, órgão, arquivo. */
  referencia: string;
  status: StatusItem;
  /** Obrigatório quando o item não terminou bem: é o que o operador vai ler. */
  mensagem?: string;
  dados?: Prisma.InputJsonValue;
};

export type ArtefatoRegistrado = {
  tipo: TipoArtefato;
  nome: string;
  mimeType?: string;
  caminho?: string;
  conteudo?: Prisma.InputJsonValue;
};

/** O que o handler recebe para conversar com o histórico enquanto roda. */
export type ContextoExecucao = {
  execucaoId: string;
  /**
   * Registra um item já concluído. Grava na hora, de propósito: se a execução
   * morrer no meio, o que já foi processado continua visível — uma consulta
   * que falhou não pode sumir.
   */
  registrarItem(item: ItemRegistrado): Promise<void>;
  registrarArtefato(artefato: ArtefatoRegistrado): Promise<void>;
};

export type ResultadoHandler = {
  /** Uma linha para a listagem do histórico: "12 certificados, 3 avisos". */
  resumo?: string;
};

export type HandlerModulo = (
  contexto: ContextoExecucao,
) => Promise<ResultadoHandler | void>;

export type PedidoDeExecucao = {
  modulo: string;
  disparo: Disparo;
  /** Nulo quando o disparo é agendado: não há pessoa por trás. */
  usuarioId?: string | null;
};

export type ExecucaoConcluida = {
  id: string;
  status: StatusExecucao;
  duracaoMs: number;
  resumo: string | null;
  erro: string | null;
};

/**
 * Roda um handler de módulo do começo ao fim, deixando rastro no banco em
 * qualquer desfecho — inclusive quando o handler explode.
 */
export async function executarModulo(
  pedido: PedidoDeExecucao,
  handler: HandlerModulo,
): Promise<ExecucaoConcluida> {
  const inicio = Date.now();

  const execucao = await prisma.execucao.create({
    data: {
      modulo: pedido.modulo,
      disparo: pedido.disparo,
      disparadoPorId: pedido.usuarioId ?? null,
      status: StatusExecucao.EM_EXECUCAO,
    },
    select: { id: true },
  });

  const contexto: ContextoExecucao = {
    execucaoId: execucao.id,
    async registrarItem(item) {
      await prisma.execucaoItem.create({
        data: {
          execucaoId: execucao.id,
          referencia: item.referencia,
          status: item.status,
          mensagem: item.mensagem ?? null,
          dados: item.dados,
        },
      });
    },
    async registrarArtefato(artefato) {
      await prisma.artefato.create({
        data: {
          execucaoId: execucao.id,
          tipo: artefato.tipo,
          nome: artefato.nome,
          mimeType: artefato.mimeType ?? null,
          caminho: artefato.caminho ?? null,
          conteudo: artefato.conteudo,
        },
      });
    },
  };

  try {
    const resultado = (await handler(contexto)) ?? {};
    const status = await statusPelosItens(execucao.id);

    return await finalizar(execucao.id, {
      status,
      duracaoMs: Date.now() - inicio,
      resumo: resultado.resumo ?? null,
      erro: null,
      detalheTecnico: null,
    });
  } catch (erro) {
    // A execução falhou como um todo, mas os itens já registrados continuam
    // lá: o operador vê até onde a automação chegou antes de parar.
    return await finalizar(execucao.id, {
      status: StatusExecucao.FALHA,
      duracaoMs: Date.now() - inicio,
      resumo: null,
      erro: mensagemLegivel(erro),
      detalheTecnico: detalheTecnico(erro),
    });
  }
}

/**
 * O status de uma rodada é o resumo dos seus itens. Rodada com item que falhou
 * não se passa por sucesso: vira SUCESSO_PARCIAL, e a diferença aparece na tela.
 */
async function statusPelosItens(execucaoId: string): Promise<StatusExecucao> {
  const [total, comFalha] = await Promise.all([
    prisma.execucaoItem.count({ where: { execucaoId } }),
    prisma.execucaoItem.count({
      where: { execucaoId, status: StatusItem.FALHA },
    }),
  ]);

  if (comFalha === 0) return StatusExecucao.SUCESSO;
  if (comFalha === total) return StatusExecucao.FALHA;
  return StatusExecucao.SUCESSO_PARCIAL;
}

async function finalizar(
  execucaoId: string,
  dados: {
    status: StatusExecucao;
    duracaoMs: number;
    resumo: string | null;
    erro: string | null;
    detalheTecnico: string | null;
  },
): Promise<ExecucaoConcluida> {
  const execucao = await prisma.execucao.update({
    where: { id: execucaoId },
    data: { ...dados, finalizadaEm: new Date() },
    select: {
      id: true,
      status: true,
      duracaoMs: true,
      resumo: true,
      erro: true,
    },
  });

  return { ...execucao, duracaoMs: execucao.duracaoMs ?? dados.duracaoMs };
}
