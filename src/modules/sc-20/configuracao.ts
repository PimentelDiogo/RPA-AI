import { prisma } from "@/lib/db";
import { JANELA_PADRAO_DIAS } from "@/modules/sc-20/regua";

/**
 * Janela de alerta do SC-20.
 *
 * Vive no banco, e não como constante no código, porque é regra de negócio que
 * a operação ajusta: quem trabalha com certificado sabe melhor que o
 * desenvolvedor quanta antecedência resolve. O padrão de 60 dias é o que o
 * enunciado cita no painel.
 */
const ID_UNICO = "unica";

export const JANELAS_PERMITIDAS = [30, 45, 60, 90, 120] as const;

export async function janelaConfigurada(): Promise<number> {
  const configuracao = await prisma.configuracaoSc20.findUnique({
    where: { id: ID_UNICO },
    select: { janelaDias: true },
  });

  return configuracao?.janelaDias ?? JANELA_PADRAO_DIAS;
}

export async function definirJanela(dias: number): Promise<void> {
  if (!JANELAS_PERMITIDAS.includes(dias as (typeof JANELAS_PERMITIDAS)[number])) {
    throw new Error(`Janela inválida: ${dias}`);
  }

  await prisma.configuracaoSc20.upsert({
    where: { id: ID_UNICO },
    create: { id: ID_UNICO, janelaDias: dias },
    update: { janelaDias: dias },
  });
}
