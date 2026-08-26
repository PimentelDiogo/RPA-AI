/**
 * Assinatura da SheepContabil, redesenhada em SVG a partir do logo do
 * enunciado: o carneiro dentro do quadrado de cantos arredondados, com a
 * listra âmbar embaixo, e o nome em duas cores.
 *
 * É SVG e não imagem porque a assinatura precisa funcionar sobre fundo claro,
 * sobre o grafite da marca e sobre o turquesa — aqui isso é uma propriedade,
 * não três arquivos.
 */
type Fundo = "claro" | "tinta" | "turquesa";

const CORES: Record<
  Fundo,
  { selo: string; carneiro: string; sheep: string; contabil: string }
> = {
  claro: {
    selo: "var(--sheep-petroleo)",
    carneiro: "#ffffff",
    sheep: "var(--sheep-tinta)",
    contabil: "var(--sheep-petroleo)",
  },
  tinta: {
    selo: "var(--sheep-turquesa)",
    carneiro: "#ffffff",
    sheep: "#ffffff",
    contabil: "var(--sheep-turquesa)",
  },
  turquesa: {
    selo: "#ffffff",
    carneiro: "var(--sheep-tinta)",
    sheep: "var(--sheep-tinta)",
    contabil: "#ffffff",
  },
};

export function Marca({
  fundo = "claro",
  altura = 32,
}: {
  fundo?: Fundo;
  altura?: number;
}) {
  const cor = CORES[fundo];

  return (
    <span className="inline-flex items-center gap-2.5" aria-label="SheepContabil">
      <svg
        width={altura}
        height={altura}
        viewBox="0 0 64 64"
        role="img"
        aria-hidden="true"
        focusable="false"
      >
        <rect width="64" height="64" rx="16" fill={cor.selo} />
        {/* corpo */}
        <circle cx="34" cy="30" r="13" fill={cor.carneiro} />
        <circle cx="24" cy="26" r="8" fill={cor.carneiro} />
        <circle cx="44" cy="26" r="7" fill={cor.carneiro} />
        <circle cx="42" cy="38" r="8" fill={cor.carneiro} />
        {/* cabeça e olho */}
        <circle cx="21" cy="33" r="6.5" fill={cor.carneiro} />
        <circle cx="19" cy="32" r="1.7" fill={cor.selo} />
        {/* patas */}
        <rect x="26" y="41" width="3.4" height="7" rx="1.7" fill={cor.carneiro} />
        <rect x="34" y="41" width="3.4" height="7" rx="1.7" fill={cor.carneiro} />
        <rect x="42" y="41" width="3.4" height="7" rx="1.7" fill={cor.carneiro} />
        {/* chão âmbar */}
        <rect
          x="18"
          y="49"
          width="30"
          height="3.4"
          rx="1.7"
          fill="var(--sheep-ambar)"
        />
      </svg>
      <span
        className="font-display text-lg leading-none font-extrabold tracking-tight"
        style={{ color: cor.sheep }}
      >
        Sheep
        <span style={{ color: cor.contabil }}>Contabil</span>
      </span>
    </span>
  );
}
