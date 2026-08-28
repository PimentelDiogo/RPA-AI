import { randomUUID } from "node:crypto";

import { prisma } from "@/lib/db";
import { ErroDeNegocio } from "@/lib/execucao/erros";
import type {
  ArquivoGuardado,
  FileStorage,
} from "@/modules/sc-01/ports/file-storage";

/**
 * Guarda o arquivo no Postgres.
 *
 * Escolha consciente para esta entrega: a hospedagem é serverless e não tem
 * disco persistente, e um bucket exigiria credencial que o desafio não
 * concede. Extrato bancário tem dezenas de kilobytes — cabe.
 *
 * Onde entraria o real:
 *
 *   const blob = await put(nome, conteudo, { access: "private" });  ← credencial
 *   return { chave: blob.url, … };
 *
 * O port não mudaria.
 */
const TAMANHO_MAXIMO = 8 * 1024 * 1024;

export class StorageBanco implements FileStorage {
  async guardar(arquivo: {
    nome: string;
    mimeType: string;
    conteudo: Uint8Array;
  }): Promise<ArquivoGuardado> {
    if (arquivo.conteudo.byteLength === 0) {
      throw new ErroDeNegocio("O arquivo enviado está vazio.");
    }

    if (arquivo.conteudo.byteLength > TAMANHO_MAXIMO) {
      throw new ErroDeNegocio(
        `O arquivo tem ${Math.round(arquivo.conteudo.byteLength / 1024 / 1024)} MB e o limite é 8 MB.`,
        { sugestao: "Envie o extrato de um mês por vez." },
      );
    }

    const chave = randomUUID();

    await prisma.arquivoArmazenado.create({
      data: {
        chave,
        nome: arquivo.nome,
        mimeType: arquivo.mimeType,
        tamanho: arquivo.conteudo.byteLength,
        conteudo: Buffer.from(arquivo.conteudo),
      },
    });

    return {
      chave,
      nome: arquivo.nome,
      mimeType: arquivo.mimeType,
      tamanho: arquivo.conteudo.byteLength,
    };
  }

  async ler(chave: string): Promise<Uint8Array> {
    const arquivo = await prisma.arquivoArmazenado.findUnique({
      where: { chave },
      select: { conteudo: true },
    });

    if (!arquivo) {
      throw new ErroDeNegocio(
        "O arquivo do extrato não foi encontrado no armazenamento.",
      );
    }

    return new Uint8Array(arquivo.conteudo);
  }
}
