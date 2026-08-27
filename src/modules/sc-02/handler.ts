import {
  StatusItem,
  type OrgaoConsultado,
  type SituacaoApurada,
} from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import type { ContextoExecucao, ResultadoHandler } from "@/lib/execucao/motor";
import { OrgaoHttp } from "@/modules/sc-02/adapters/orgao-http";
import { comRetry, POLITICA_PADRAO, processarEmLote, type Politica } from "@/modules/sc-02/fila";
import { ORGAOS_ATIVOS, ROTULO_ORGAO } from "@/modules/sc-02/orgaos";
import type { ConsultaOrgao } from "@/modules/sc-02/ports/consulta-orgao";

/**
 * Handler do SC-02.
 *
 * Monta a fila de cliente × órgão, consulta com retry e limite de
 * concorrência, e **persiste toda tentativa** — a que deu certo e a que não.
 *
 * A leitura bem-sucedida atualiza `situacao_fiscal`; a que falhou não encosta
 * nela. É o que permite o painel dizer "irregular" e "não conseguimos
 * perguntar" como coisas diferentes, que é a armadilha deste processo.
 */
/**
 * Quanto tempo a rodada pode gastar antes de parar por conta própria.
 *
 * A hospedagem encerra a função em 60 segundos, sem cerimônia: o que estivesse
 * em andamento sumiria sem registro — exatamente o que a armadilha deste
 * processo proíbe. Então a rodada para antes, e diz o que não deu tempo de
 * consultar.
 */
const ORCAMENTO_PADRAO_MS = 45_000;

export async function handlerSc02(
  contexto: ContextoExecucao,
  consulta: ConsultaOrgao = new OrgaoHttp(),
  politica: Politica = POLITICA_PADRAO,
  orcamentoMs: number = ORCAMENTO_PADRAO_MS,
): Promise<ResultadoHandler> {
  const prazo = Date.now() + orcamentoMs;
  const clientes = await prisma.cliente.findMany({
    where: { ativo: true },
    select: { id: true, cnpj: true, razaoSocial: true, nomeFantasia: true },
    orderBy: { razaoSocial: "asc" },
  });

  type Par = {
    clienteId: string;
    cnpj: string;
    nome: string;
    orgao: OrgaoConsultado;
  };

  const fila: Par[] = clientes.flatMap((cliente) =>
    ORGAOS_ATIVOS.map((orgao) => ({
      clienteId: cliente.id,
      cnpj: cliente.cnpj,
      nome: cliente.nomeFantasia ?? cliente.razaoSocial,
      orgao,
    })),
  );

  const contagem = {
    regular: 0,
    irregular: 0,
    indisponivel: 0,
    semResposta: 0,
    naoConsultados: 0,
  };

  await processarEmLote(fila, politica.concorrencia, async (par) => {
    const referenciaDoPar = `${par.nome} — ${ROTULO_ORGAO[par.orgao]}`;

    if (Date.now() >= prazo) {
      // Não fica em silêncio: o par aparece no histórico como não consultado,
      // e a próxima rodada o pega. Melhor uma lacuna declarada do que uma
      // lacuna invisível.
      contagem.naoConsultados += 1;
      await contexto.registrarItem({
        referencia: referenciaDoPar,
        status: StatusItem.IGNORADO,
        mensagem:
          "Não consultado nesta rodada: o tempo disponível acabou. Será consultado na próxima.",
      });
      return;
    }

    const { tentativas, final } = await comRetry(
      () => consulta.consultar(par.cnpj, par.orgao),
      (resultado) => resultado.sucesso,
      politica,
    );

    // Toda tentativa vai para o banco, na ordem, com hora e erro. É o registro
    // que o enunciado cobra: sem ele ninguém sabe se o cliente está regular ou
    // se o robô não conseguiu perguntar.
    for (const { tentativa, resultado } of tentativas) {
      await prisma.consultaTentativa.create({
        data: {
          clienteId: par.clienteId,
          orgao: par.orgao,
          execucaoId: contexto.execucaoId,
          tentativa,
          sucesso: resultado.sucesso,
          situacao: resultado.sucesso ? resultado.situacao : null,
          erro: resultado.sucesso ? null : resultado.erro,
          respostaBruta: resultado.respostaBruta ?? null,
          origem: resultado.origem,
          duracaoMs: resultado.duracaoMs,
        },
      });
    }

    const referencia = referenciaDoPar;

    if (!final.sucesso) {
      contagem.semResposta += 1;

      const anterior = await prisma.situacaoFiscal.findUnique({
        where: { clienteId_orgao: { clienteId: par.clienteId, orgao: par.orgao } },
        select: { situacao: true, apuradaEm: true },
      });

      // A situação anterior permanece intacta, e a mensagem diz o que ainda se
      // sabe — em vez de deixar o operador no escuro.
      const contextoAnterior = anterior
        ? ` A última situação conhecida é ${anterior.situacao} de ${anterior.apuradaEm.toISOString().slice(0, 10)}.`
        : " Nunca houve leitura bem-sucedida deste par.";

      await contexto.registrarItem({
        referencia,
        status: StatusItem.FALHA,
        mensagem: `${final.erro}${contextoAnterior}`,
        dados: { tentativas: tentativas.length },
      });
      return;
    }

    await prisma.situacaoFiscal.upsert({
      where: { clienteId_orgao: { clienteId: par.clienteId, orgao: par.orgao } },
      create: {
        clienteId: par.clienteId,
        orgao: par.orgao,
        situacao: final.situacao,
        detalhe: final.detalhe ?? null,
        apuradaEm: new Date(),
        origem: final.origem,
      },
      update: {
        situacao: final.situacao,
        detalhe: final.detalhe ?? null,
        apuradaEm: new Date(),
        origem: final.origem,
      },
    });

    contar(contagem, final.situacao);

    await contexto.registrarItem({
      referencia,
      status: StatusItem.SUCESSO,
      mensagem:
        final.situacao === "REGULAR"
          ? undefined
          : `${final.situacao}: ${final.detalhe ?? "sem detalhe"}`,
      dados: { situacao: final.situacao, tentativas: tentativas.length },
    });
  });

  return {
    resumo:
      `${fila.length} consultas · ${contagem.regular} regulares · ${contagem.irregular} irregulares · ` +
      `${contagem.indisponivel} indisponíveis · ${contagem.semResposta} sem resposta` +
      (contagem.naoConsultados > 0
        ? ` · ${contagem.naoConsultados} não consultados por falta de tempo`
        : ""),
  };
}

function contar(
  contagem: { regular: number; irregular: number; indisponivel: number },
  situacao: SituacaoApurada,
) {
  if (situacao === "REGULAR") contagem.regular += 1;
  else if (situacao === "IRREGULAR") contagem.irregular += 1;
  else contagem.indisponivel += 1;
}
