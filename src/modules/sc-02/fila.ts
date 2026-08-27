/**
 * A fila de consultas.
 *
 * Portal de órgão cai, demora e derruba quem martela. Resiliência aqui é regra
 * de negócio, não detalhe: sem retry, uma queda de dez segundos deixaria
 * metade dos clientes sem leitura no dia; sem limite de concorrência, o portal
 * (real) cortaria o acesso.
 *
 * Código puro, sem banco e sem `fetch`: dá para testar cada comportamento sem
 * subir nada.
 */

export type Politica = {
  /** Quantas vezes tentar cada item, no total. */
  tentativas: number;
  /** Espera antes da 2ª tentativa; dobra a cada nova. */
  esperaBaseMs: number;
  /** Quantos itens em voo ao mesmo tempo. */
  concorrencia: number;
};

/**
 * Espera curta de propósito. Portal real merece backoff de segundos, mas a
 * rodada inteira precisa caber numa invocação de função serverless — e o que
 * está sendo demonstrado é o mecanismo, não a paciência.
 */
export const POLITICA_PADRAO: Politica = {
  tentativas: 3,
  esperaBaseMs: 400,
  // Consulta a portal é espera de rede, não trabalho de processador: 8 em voo
  // cortam o tempo da rodada pela metade sem martelar o portal. O limite existe
  // porque portal real derruba quem exagera.
  concorrencia: 8,
};

export function esperaDaTentativa(tentativa: number, politica: Politica): number {
  // tentativa 1 não espera; 2 espera base; 3 espera base × 2; e assim por diante.
  return tentativa <= 1 ? 0 : politica.esperaBaseMs * 2 ** (tentativa - 2);
}

export type TentativaRegistrada<T> = {
  tentativa: number;
  resultado: T;
};

export type ResultadoComTentativas<T> = {
  /** Todas as tentativas, na ordem — inclusive as que falharam. */
  tentativas: TentativaRegistrada<T>[];
  /** A última, que é a que vale. */
  final: T;
};

/**
 * Executa um item com retry. Toda tentativa é devolvida, não só a última:
 * consulta que falhou não pode sumir, e é o chamador que a persiste.
 */
export async function comRetry<T>(
  executar: (tentativa: number) => Promise<T>,
  deuCerto: (resultado: T) => boolean,
  politica: Politica = POLITICA_PADRAO,
  dormir: (ms: number) => Promise<void> = esperar,
): Promise<ResultadoComTentativas<T>> {
  const tentativas: TentativaRegistrada<T>[] = [];

  for (let numero = 1; numero <= politica.tentativas; numero += 1) {
    const espera = esperaDaTentativa(numero, politica);
    if (espera > 0) await dormir(espera);

    const resultado = await executar(numero);
    tentativas.push({ tentativa: numero, resultado });

    if (deuCerto(resultado)) break;
  }

  return { tentativas, final: tentativas[tentativas.length - 1].resultado };
}

/**
 * Processa a fila respeitando o limite de itens simultâneos. Um item que falha
 * não interrompe os outros: a rodada precisa terminar mesmo com portal caído.
 */
export async function processarEmLote<Item, Saida>(
  itens: Item[],
  concorrencia: number,
  processar: (item: Item) => Promise<Saida>,
): Promise<Saida[]> {
  const saidas: Saida[] = new Array(itens.length);
  let proximo = 0;

  const trabalhador = async () => {
    while (proximo < itens.length) {
      const indice = proximo;
      proximo += 1;
      saidas[indice] = await processar(itens[indice]);
    }
  };

  const trabalhadores = Array.from(
    { length: Math.max(1, Math.min(concorrencia, itens.length)) },
    trabalhador,
  );

  await Promise.all(trabalhadores);
  return saidas;
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
