import {
  FaixaVencimento,
  StatusItem,
  TipoArtefato,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { ErroDeNegocio } from "@/lib/execucao/erros";
import type { ContextoExecucao, ResultadoHandler } from "@/lib/execucao/motor";
import { NotificadorOutbox } from "@/modules/sc-20/adapters/notificador-outbox";
import type { Notificador } from "@/modules/sc-20/ports/notificador";
import {
  classificar,
  decidir,
  diasRestantes,
  redigirAviso,
  ROTULO_FAIXA,
} from "@/modules/sc-20/regua";
import { janelaConfigurada } from "@/modules/sc-20/configuracao";

/**
 * Handler do SC-20.
 *
 * Percorre os certificados ativos, decide quem precisa de aviso e registra o
 * que foi comunicado — e o que foi deliberadamente calado. Histórico, duração,
 * autoria e tratamento de erro vêm do motor de execução; aqui só existe a
 * regra do processo.
 */
export async function handlerSc20(
  contexto: ContextoExecucao,
  notificador: Notificador = new NotificadorOutbox(),
  agora: Date = new Date(),
): Promise<ResultadoHandler> {
  const janelaDias = await janelaConfigurada();

  const certificados = await prisma.certificado.findMany({
    where: { ativo: true },
    include: {
      cliente: {
        select: {
          razaoSocial: true,
          nomeFantasia: true,
          contatos: { where: { ativo: true } },
        },
      },
      // Só o último aviso efetivamente comunicado interessa: supressão não
      // conta, porque ninguém a recebeu.
      avisos: {
        where: { suprimido: false },
        orderBy: { registradoEm: "desc" },
        take: 1,
      },
    },
    orderBy: { validade: "asc" },
  });

  let naJanela = 0;
  let avisados = 0;
  let suprimidos = 0;

  /**
   * O que efetivamente saiu nesta rodada. Vira artefato no fim: o enunciado
   * pede "o registro do que foi enviado" como saída visível, e uma contagem no
   * resumo não é registro — é afirmação.
   */
  const enviados: {
    certificado: string;
    destinatario: string;
    faixa: string;
    diasRestantes: number;
  }[] = [];

  for (const certificado of certificados) {
    const dias = diasRestantes(certificado.validade, agora);
    const faixa = classificar(dias, janelaDias);

    // Fora da janela não é item: seria ruído no histórico de toda rodada.
    if (faixa === null) continue;
    naJanela += 1;

    const nomeCliente =
      certificado.cliente.nomeFantasia ?? certificado.cliente.razaoSocial;
    const referencia = `${nomeCliente} — ${certificado.tipo} de ${certificado.titular}`;

    const decisao = decidir(faixa, certificado.avisos[0]?.faixa ?? null);

    if (decisao.acao === "suprimir") {
      await registrarSupressao({
        certificadoId: certificado.id,
        execucaoId: contexto.execucaoId,
        faixa,
        dias,
        motivo: decisao.motivo,
        referencia,
      });

      suprimidos += 1;
      await contexto.registrarItem({
        referencia,
        status: StatusItem.IGNORADO,
        mensagem: `Aviso suprimido: ${decisao.motivo}.`,
        dados: { dias, faixa },
      });
      continue;
    }

    const contatos = certificado.cliente.contatos;

    if (contatos.length === 0) {
      // Falha de dado, não do sistema: o operador precisa saber para cadastrar.
      await contexto.registrarItem({
        referencia,
        status: StatusItem.FALHA,
        mensagem:
          "Nenhum contato cadastrado para este cliente — não há para quem avisar. Cadastre um contato e execute novamente.",
        dados: { dias, faixa },
      });
      continue;
    }

    try {
      for (const contato of contatos) {
        const corpo = redigirAviso({
          cliente: certificado.cliente.razaoSocial,
          titular: certificado.titular,
          tipo: certificado.tipo,
          emissor: certificado.emissor,
          validade: certificado.validade,
          dias,
          destinatario: contato.nome,
        });

        const recibo = await notificador.enviar({
          destinatario: { nome: contato.nome, email: contato.email },
          assunto: `Certificado digital de ${nomeCliente} — ${ROTULO_FAIXA[faixa]}`,
          corpo,
        });

        await prisma.avisoCertificado.create({
          data: {
            certificadoId: certificado.id,
            contatoId: contato.id,
            execucaoId: contexto.execucaoId,
            faixa,
            diasRestantes: dias,
            conteudo: corpo,
            registradoEm: recibo.enviadaEm,
          },
        });

        enviados.push({
          certificado: referencia,
          destinatario: `${contato.nome} <${contato.email}>`,
          faixa: ROTULO_FAIXA[faixa],
          diasRestantes: dias,
        });
      }

      avisados += 1;
      await contexto.registrarItem({
        referencia,
        status: StatusItem.SUCESSO,
        mensagem: `${contatos.length} aviso(s) — ${decisao.motivo}.`,
        dados: { dias, faixa },
      });
    } catch (erro) {
      // O aviso não é marcado como enviado, então a próxima rodada tenta de novo.
      await contexto.registrarItem({
        referencia,
        status: StatusItem.FALHA,
        mensagem:
          erro instanceof ErroDeNegocio || erro instanceof Error
            ? `Não foi possível avisar: ${erro.message}`
            : "Não foi possível avisar.",
        dados: { dias, faixa },
      });
    }
  }

  if (enviados.length > 0) {
    await contexto.registrarArtefato({
      tipo: TipoArtefato.REGISTRO_DE_ENVIO,
      nome: `Avisos enviados — ${enviados.length} mensagem(ns)`,
      conteudo: {
        canal: "outbox (nenhuma mensagem sai da aplicação)",
        janelaDias,
        mensagens: enviados,
      },
    });
  }

  return {
    resumo: `${certificados.length} certificados · ${naJanela} na janela de ${janelaDias} dias · ${avisados} avisados · ${suprimidos} suprimidos`,
  };
}

async function registrarSupressao(dados: {
  certificadoId: string;
  execucaoId: string;
  faixa: FaixaVencimento;
  dias: number;
  motivo: string;
  referencia: string;
}) {
  // A supressão é registro de primeira classe: sem ela ninguém sabe se o
  // sistema calou por decisão ou por falha.
  await prisma.avisoCertificado.create({
    data: {
      certificadoId: dados.certificadoId,
      execucaoId: dados.execucaoId,
      faixa: dados.faixa,
      diasRestantes: dados.dias,
      conteudo: `Aviso não enviado sobre ${dados.referencia}.`,
      suprimido: true,
      motivoSupressao: dados.motivo,
    },
  });
}
