import { hash, verify } from "@node-rs/argon2";

/**
 * Hash de senha com argon2id.
 *
 * Parâmetros acima do mínimo recomendado pela OWASP (19 MiB de memória,
 * 2 iterações). Senha em claro não é persistida nem registrada em log em
 * nenhum ponto do sistema.
 */
const PARAMETROS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function gerarHashDeSenha(senha: string): Promise<string> {
  return hash(senha, PARAMETROS);
}

export async function senhaConfere(
  senha: string,
  senhaHash: string,
): Promise<boolean> {
  try {
    return await verify(senhaHash, senha, PARAMETROS);
  } catch {
    // Hash malformado ou de outro algoritmo: trata como senha errada, sem
    // vazar a diferença para quem está tentando entrar.
    return false;
  }
}
