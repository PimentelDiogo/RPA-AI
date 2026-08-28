/**
 * Fronteira de armazenamento de arquivo.
 *
 * **Aqui entraria o S3, o Vercel Blob ou o gerenciador de documentos do
 * escritório.** O adapter desta entrega guarda os bytes no próprio Postgres:
 * hospedagem serverless não tem disco que sobreviva à requisição, e um bucket
 * de verdade exigiria credencial que o desafio não concede.
 *
 * O módulo conhece só esta interface. Trocar o adapter não muda nada no
 * parser, na validação, na geração do OFX ou na tela.
 */
export type ArquivoGuardado = {
  chave: string;
  nome: string;
  mimeType: string;
  tamanho: number;
};

export interface FileStorage {
  guardar(arquivo: {
    nome: string;
    mimeType: string;
    conteudo: Uint8Array;
  }): Promise<ArquivoGuardado>;

  ler(chave: string): Promise<Uint8Array>;
}
