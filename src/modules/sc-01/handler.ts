import { createHash } from "node:crypto";

import {
  OrigemLeitura,
  StatusExtrato,
  StatusItem,
  TipoArtefato,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { ErroDeNegocio } from "@/lib/execucao/erros";
import type { ContextoExecucao, ResultadoHandler } from "@/lib/execucao/motor";
import { StorageBanco } from "@/modules/sc-01/adapters/storage-banco";
import { extrairTexto } from "@/modules/sc-01/extracao";
import { gerarOfx, identificadorDoLancamento } from "@/modules/sc-01/ofx";
import { BANCOS_SUPORTADOS, reconhecer } from "@/modules/sc-01/parsers";
import type { FileStorage } from "@/modules/sc-01/ports/file-storage";
import { conferir, formatarReais, podeEntrarNoOfx } from "@/modules/sc-01/validacao";

/**
 * SC-01 — conversão de extrato bancário para OFX.
 *
 * O caminho é sempre o mesmo, e a ordem importa:
 *
 *   texto do arquivo → parser conhecido? → validação → confiança por lançamento
 *   → alta entra no OFX, o resto vai para a fila de conferência
 *
 * O determinístico vem primeiro. Só o que nenhum parser reconhece — layout
 * novo, extrato escaneado — cai no caminho de interpretação.
 */

export type ResultadoDoExtrato = {
  extratoId: string;
  banco: string | null;
  lancamentos: number;
  emConferencia: number;
  ofxGerado: boolean;
};

/** Recebe um arquivo, guarda e deixa na fila. Não processa: isso é do handler. */
export async function receberExtrato(dados: {
  clienteId: string;
  nome: string;
  mimeType: string;
  conteudo: Uint8Array;
  storage?: FileStorage;
}): Promise<{ extratoId: string }> {
  const storage = dados.storage ?? new StorageBanco();

  // O mesmo arquivo enviado duas vezes não pode virar lançamento duplicado.
  const hash = createHash("sha256").update(dados.conteudo).digest("hex");

  const jaExiste = await prisma.extratoImportado.findUnique({
    where: { arquivoHash: hash },
    select: { id: true, arquivoNome: true, criadoEm: true },
  });

  if (jaExiste) {
    throw new ErroDeNegocio(
      `Este arquivo já foi importado em ${jaExiste.criadoEm.toLocaleDateString("pt-BR")} como "${jaExiste.arquivoNome}".`,
      { sugestao: "Abra a importação existente em vez de enviar de novo." },
    );
  }

  const guardado = await storage.guardar({
    nome: dados.nome,
    mimeType: dados.mimeType,
    conteudo: dados.conteudo,
  });

  const extrato = await prisma.extratoImportado.create({
    data: {
      clienteId: dados.clienteId,
      arquivoNome: dados.nome,
      arquivoChave: guardado.chave,
      arquivoHash: hash,
      status: StatusExtrato.RECEBIDO,
    },
    select: { id: true },
  });

  return { extratoId: extrato.id };
}

/**
 * Processa a fila de extratos recebidos.
 *
 * Roda sob demanda (logo após o upload) e no agendamento diário — uma
 * automação que só funciona com o arquivo que alguém enviou na hora não é
 * automação.
 */
export async function handlerSc01(
  contexto: ContextoExecucao,
  storage: FileStorage = new StorageBanco(),
): Promise<ResultadoHandler> {
  const pendentes = await prisma.extratoImportado.findMany({
    where: { status: StatusExtrato.RECEBIDO },
    include: { cliente: { select: { razaoSocial: true, nomeFantasia: true } } },
    orderBy: { criadoEm: "asc" },
  });

  let convertidos = 0;
  let comPendencia = 0;
  let falharam = 0;
  let totalEmConferencia = 0;

  for (const extrato of pendentes) {
    const cliente = extrato.cliente.nomeFantasia ?? extrato.cliente.razaoSocial;
    const referencia = `${cliente} — ${extrato.arquivoNome}`;

    try {
      const resultado = await processarExtrato(extrato.id, storage, contexto);

      totalEmConferencia += resultado.emConferencia;

      if (resultado.ofxGerado && resultado.emConferencia === 0) {
        convertidos += 1;
        await contexto.registrarItem({
          referencia,
          status: StatusItem.SUCESSO,
          mensagem: `${resultado.banco} · ${resultado.lancamentos} lançamentos · OFX gerado.`,
          dados: { extratoId: resultado.extratoId, banco: resultado.banco },
        });
        continue;
      }

      // Terminou, mas alguém precisa olhar antes de importar.
      comPendencia += 1;
      await contexto.registrarItem({
        referencia,
        status: StatusItem.CONFERENCIA,
        mensagem: resultado.ofxGerado
          ? `${resultado.lancamentos} lançamentos lidos, ${resultado.emConferencia} aguardando conferência antes de entrar no OFX.`
          : `${resultado.lancamentos} lançamentos lidos, mas o OFX não foi gerado. Veja o motivo na tela do módulo.`,
        dados: { extratoId: resultado.extratoId, banco: resultado.banco },
      });
    } catch (erro) {
      falharam += 1;

      const mensagem =
        erro instanceof ErroDeNegocio
          ? `${erro.message}${erro.sugestao ? ` ${erro.sugestao}` : ""}`
          : "Não foi possível converter este extrato.";

      await prisma.extratoImportado.update({
        where: { id: extrato.id },
        data: { status: StatusExtrato.FALHOU, erro: mensagem },
      });

      await contexto.registrarItem({
        referencia,
        status: StatusItem.FALHA,
        mensagem,
        dados: { extratoId: extrato.id },
      });
    }
  }

  return {
    resumo:
      pendentes.length === 0
        ? "Nenhum extrato na fila."
        : `${pendentes.length} extrato(s) · ${convertidos} convertido(s) · ${comPendencia} aguardando conferência · ${falharam} com falha · ${totalEmConferencia} lançamento(s) na fila de conferência`,
  };
}

/** Lê, valida e grava um extrato. Exportado para o upload processar na hora. */
export async function processarExtrato(
  extratoId: string,
  storage: FileStorage = new StorageBanco(),
  contexto?: ContextoExecucao,
): Promise<ResultadoDoExtrato> {
  const extrato = await prisma.extratoImportado.findUniqueOrThrow({
    where: { id: extratoId },
    select: { id: true, arquivoChave: true, arquivoNome: true },
  });

  const conteudo = await storage.ler(extrato.arquivoChave);
  const mimeType = extrato.arquivoNome.toLowerCase().endsWith(".pdf")
    ? "application/pdf"
    : extrato.arquivoNome.toLowerCase().endsWith(".txt")
      ? "text/plain"
      : "image/*";

  const { texto, temTextoNativo } = await extrairTexto(conteudo, mimeType);

  if (!temTextoNativo) {
    // Aqui entra a leitura assistida por IA, na próxima fatia do módulo.
    throw new ErroDeNegocio(
      "Este arquivo não tem texto para ler — é uma imagem ou um PDF digitalizado.",
      {
        sugestao:
          "A leitura assistida ainda não está habilitada neste ambiente; envie o extrato em PDF com texto.",
      },
    );
  }

  const parser = reconhecer(texto);

  if (!parser) {
    throw new ErroDeNegocio(
      "Nenhum layout conhecido reconheceu este extrato.",
      {
        sugestao: `Hoje o portal lê ${BANCOS_SUPORTADOS.join(", ")}. Um layout novo entra como um arquivo de parser, sem mexer no resto do módulo.`,
      },
    );
  }

  const lido = parser.parse(texto);
  const conferencia = conferir(lido, OrigemLeitura.PARSER);

  const emConferencia = conferencia.lancamentos.filter(
    (lancamento) => !podeEntrarNoOfx({ ...lancamento, conferido: false }),
  ).length;

  // Grava a leitura antes de decidir sobre o OFX: mesmo sem poder gerar o
  // arquivo, o que foi lido precisa ficar visível para alguém entender por quê.
  await prisma.$transaction([
    prisma.lancamento.deleteMany({ where: { extratoId } }),
    prisma.extratoImportado.update({
      where: { id: extratoId },
      data: {
        banco: lido.banco,
        agencia: lido.agencia ?? null,
        conta: lido.conta ?? null,
        competenciaInicio: lido.competenciaInicio ?? null,
        competenciaFim: lido.competenciaFim ?? null,
        saldoInicial: lido.saldoInicial ?? null,
        saldoFinal: lido.saldoFinal ?? null,
        origemLeitura: OrigemLeitura.PARSER,
        parserUsado: parser.banco,
        diferencaSaldo: conferencia.diferencaSaldo ?? null,
        status: StatusExtrato.PROCESSADO,
        erro: conferencia.impedimentos.join(" ") || null,
      },
    }),
    prisma.lancamento.createMany({
      data: conferencia.lancamentos.map((lancamento) => ({
        extratoId,
        ordem: lancamento.ordem,
        data: lancamento.data,
        historico: lancamento.historico,
        valor: lancamento.valor,
        confianca: lancamento.confianca,
        motivoConferencia: lancamento.motivoConferencia ?? null,
      })),
    }),
  ]);

  const ofxGerado = await tentarGerarOfx(extratoId, contexto);

  return {
    extratoId,
    banco: lido.banco,
    lancamentos: conferencia.lancamentos.length,
    emConferencia,
    ofxGerado,
  };
}

/**
 * Gera o OFX se houver o que gerar.
 *
 * Não gera quando o saldo não fecha: melhor não entregar do que entregar
 * errado. Também não gera enquanto todo lançamento estiver na fila — um OFX
 * vazio é pior que nenhum.
 */
export async function tentarGerarOfx(
  extratoId: string,
  contexto?: ContextoExecucao,
): Promise<boolean> {
  const extrato = await prisma.extratoImportado.findUniqueOrThrow({
    where: { id: extratoId },
    include: { lancamentos: { orderBy: { ordem: "asc" } } },
  });

  const diferenca = extrato.diferencaSaldo
    ? Number(extrato.diferencaSaldo)
    : 0;

  if (diferenca !== 0) return false;

  const aprovados = extrato.lancamentos.filter((lancamento) =>
    podeEntrarNoOfx(lancamento),
  );

  if (aprovados.length === 0) return false;

  const ofx = gerarOfx({
    banco: extrato.banco ?? "Banco não identificado",
    agencia: extrato.agencia ?? undefined,
    conta: extrato.conta ?? undefined,
    competenciaInicio: extrato.competenciaInicio ?? aprovados[0].data,
    competenciaFim:
      extrato.competenciaFim ?? aprovados[aprovados.length - 1].data,
    saldoFinal: extrato.saldoFinal ? Number(extrato.saldoFinal) : undefined,
    lancamentos: aprovados.map((lancamento) => ({
      data: lancamento.data,
      historico: lancamento.historico,
      valor: Number(lancamento.valor),
      identificador: identificadorDoLancamento({
        extratoId,
        ordem: lancamento.ordem,
      }),
    })),
  });

  await prisma.artefato.deleteMany({
    where: { execucaoId: extratoId, tipo: TipoArtefato.ARQUIVO },
  });

  // O artefato é indexado pelo extrato, e não pela execução, porque o OFX é
  // regerado quando alguém confere um lançamento — fora de qualquer execução.
  await prisma.artefato.create({
    data: {
      execucaoId: extratoId,
      tipo: TipoArtefato.ARQUIVO,
      nome: `${extrato.arquivoNome.replace(/\.[^.]+$/, "")}.ofx`,
      mimeType: "application/x-ofx",
      conteudo: {
        ofx,
        lancamentos: aprovados.length,
        totalLido: extrato.lancamentos.length,
      },
    },
  });

  if (contexto) {
    await contexto.registrarArtefato({
      tipo: TipoArtefato.REGISTRO_DE_ENVIO,
      nome: `OFX de ${extrato.arquivoNome}`,
      conteudo: {
        banco: extrato.banco,
        lancamentosNoArquivo: aprovados.length,
        lancamentosLidos: extrato.lancamentos.length,
        saldoFinal: extrato.saldoFinal
          ? formatarReais(Number(extrato.saldoFinal))
          : null,
      },
    });
  }

  return true;
}
