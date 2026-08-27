import { FaixaVencimento } from "@/generated/prisma/enums";
import { prisma } from "@/lib/db";
import { janelaConfigurada } from "@/modules/sc-20/configuracao";
import { classificar, diasRestantes, ORDEM_FAIXA } from "@/modules/sc-20/regua";

/**
 * Leituras que a tela do SC-20 faz. Ficam aqui, e não no componente, porque
 * "o que mudou desde o último aviso" é regra do processo — a mesma que a régua
 * aplica na execução — e não detalhe de renderização.
 */

export type LinhaPainel = {
  id: string;
  cliente: string;
  titular: string;
  tipo: string;
  emissor: string;
  validade: Date;
  dias: number;
  faixa: FaixaVencimento;
  /** Faixa do último aviso comunicado, ou null se nunca foi avisado. */
  faixaAvisada: FaixaVencimento | null;
  temContato: boolean;
};

export type Painel = {
  janelaDias: number;
  linhas: LinhaPainel[];
  contagem: Record<FaixaVencimento, number>;
  /** Só o que mudou: entrou na janela agora ou trocou de faixa desde o aviso. */
  novidades: LinhaPainel[];
  foraDaJanela: number;
};

export async function carregarPainel(agora = new Date()): Promise<Painel> {
  const janelaDias = await janelaConfigurada();

  const certificados = await prisma.certificado.findMany({
    where: { ativo: true },
    include: {
      cliente: {
        select: {
          razaoSocial: true,
          nomeFantasia: true,
          _count: { select: { contatos: { where: { ativo: true } } } },
        },
      },
      avisos: {
        where: { suprimido: false },
        orderBy: { registradoEm: "desc" },
        take: 1,
        select: { faixa: true },
      },
    },
    orderBy: { validade: "asc" },
  });

  const linhas: LinhaPainel[] = [];
  let foraDaJanela = 0;

  for (const certificado of certificados) {
    const dias = diasRestantes(certificado.validade, agora);
    const faixa = classificar(dias, janelaDias);

    if (faixa === null) {
      foraDaJanela += 1;
      continue;
    }

    linhas.push({
      id: certificado.id,
      cliente:
        certificado.cliente.nomeFantasia ?? certificado.cliente.razaoSocial,
      titular: certificado.titular,
      tipo: certificado.tipo,
      emissor: certificado.emissor,
      validade: certificado.validade,
      dias,
      faixa,
      faixaAvisada: certificado.avisos[0]?.faixa ?? null,
      temContato: certificado.cliente._count.contatos > 0,
    });
  }

  const contagem = Object.fromEntries(
    ORDEM_FAIXA.map((faixa) => [
      faixa,
      linhas.filter((linha) => linha.faixa === faixa).length,
    ]),
  ) as Record<FaixaVencimento, number>;

  // A resposta direta à armadilha: em vez da lista inteira, o que mudou.
  const novidades = linhas.filter((linha) => linha.faixa !== linha.faixaAvisada);

  return { janelaDias, linhas, contagem, novidades, foraDaJanela };
}

export type LinhaAviso = {
  id: string;
  certificado: string;
  destinatario: string | null;
  faixa: FaixaVencimento;
  diasRestantes: number;
  conteudo: string;
  registradoEm: Date;
  suprimido: boolean;
  motivoSupressao: string | null;
};

export async function carregarAvisos(limite = 40): Promise<LinhaAviso[]> {
  const avisos = await prisma.avisoCertificado.findMany({
    orderBy: { registradoEm: "desc" },
    take: limite,
    include: {
      contato: { select: { nome: true, email: true } },
      certificado: {
        select: {
          titular: true,
          tipo: true,
          cliente: { select: { razaoSocial: true, nomeFantasia: true } },
        },
      },
    },
  });

  return avisos.map((aviso) => ({
    id: aviso.id,
    certificado: `${
      aviso.certificado.cliente.nomeFantasia ??
      aviso.certificado.cliente.razaoSocial
    } — ${aviso.certificado.tipo} de ${aviso.certificado.titular}`,
    destinatario: aviso.contato
      ? `${aviso.contato.nome} <${aviso.contato.email}>`
      : null,
    faixa: aviso.faixa,
    diasRestantes: aviso.diasRestantes,
    conteudo: aviso.conteudo,
    registradoEm: aviso.registradoEm,
    suprimido: aviso.suprimido,
    motivoSupressao: aviso.motivoSupressao,
  }));
}
