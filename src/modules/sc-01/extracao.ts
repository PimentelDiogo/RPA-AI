import { ErroDeNegocio } from "@/lib/execucao/erros";

/**
 * Extração do texto do arquivo.
 *
 * É o **caminho determinístico**, e vem primeiro: PDF gerado por sistema
 * bancário quase sempre tem texto nativo, e ler esse texto é exato, gratuito e
 * instantâneo. Só o que não tem texto — foto, digitalização — precisa de
 * interpretação, e é aí que a IA entra.
 */

export type TextoExtraido = {
  texto: string;
  paginas: number;
  /**
   * Falso quando o arquivo não tem texto para extrair: é imagem. O módulo usa
   * isso para decidir se cai no caminho de interpretação.
   */
  temTextoNativo: boolean;
};

/** Menos que isto por página não é texto de extrato: é ruído de digitalização. */
const MINIMO_DE_CARACTERES = 40;

export async function extrairTexto(
  conteudo: Uint8Array,
  mimeType: string,
): Promise<TextoExtraido> {
  if (mimeType.startsWith("image/")) {
    return { texto: "", paginas: 1, temTextoNativo: false };
  }

  if (mimeType === "text/plain") {
    const texto = new TextDecoder().decode(conteudo);
    return { texto, paginas: 1, temTextoNativo: texto.trim().length > 0 };
  }

  if (mimeType !== "application/pdf") {
    throw new ErroDeNegocio(
      `Não sei ler arquivo do tipo ${mimeType}.`,
      { sugestao: "Envie o extrato em PDF ou como imagem." },
    );
  }

  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const documento = await getDocumentProxy(conteudo);
    const { text, totalPages } = await extractText(documento, {
      mergePages: true,
    });

    const texto = Array.isArray(text) ? text.join("\n") : text;

    return {
      texto,
      paginas: totalPages,
      temTextoNativo: texto.trim().length >= MINIMO_DE_CARACTERES,
    };
  } catch (causa) {
    throw new ErroDeNegocio(
      "Não foi possível ler o arquivo. Ele pode estar corrompido ou protegido por senha.",
      { causa },
    );
  }
}
