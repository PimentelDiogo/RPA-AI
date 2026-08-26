/**
 * Formatação de tela. Tudo em pt-BR e no fuso de São Paulo, porque é onde a
 * operação está — data de execução com fuso errado é a diferença entre "rodou
 * ontem" e "rodou hoje".
 */
const FUSO = "America/Sao_Paulo";

const DATA_HORA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: FUSO,
});

const DATA = new Intl.DateTimeFormat("pt-BR", {
  dateStyle: "short",
  timeZone: FUSO,
});

export function formatarDataHora(valor: Date): string {
  return DATA_HORA.format(valor);
}

export function formatarData(valor: Date): string {
  return DATA.format(valor);
}

/** Duração legível: milissegundos não dizem nada para quem opera. */
export function formatarDuracao(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms} ms`;

  const segundos = Math.round(ms / 100) / 10;
  if (segundos < 60) return `${segundos.toString().replace(".", ",")} s`;

  const minutos = Math.floor(segundos / 60);
  const resto = Math.round(segundos % 60);
  return `${minutos} min ${resto.toString().padStart(2, "0")} s`;
}

/** 41688555000155 → 41.688.555/0001-55 */
export function formatarCnpj(cnpj: string): string {
  return cnpj.replace(
    /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
    "$1.$2.$3/$4-$5",
  );
}
