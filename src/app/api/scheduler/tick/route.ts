import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";

import { executarTick } from "@/lib/agendamento/tick";

/**
 * POST /api/scheduler/tick
 *
 * Porta de entrada do agendador. Quem chama é o cron do GitHub Actions
 * (`.github/workflows/agendador.yml`), a cada 15 minutos.
 *
 * O cron mora fora da aplicação de propósito: o plano gratuito da hospedagem
 * limita agendamento próprio a uma execução diária, e "roda sozinho na
 * frequência que o catálogo indica" é requisito, não conveniência. Como bônus,
 * o agendamento fica visível no repositório como infraestrutura.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!autorizado(request)) {
    // Sem detalhe do motivo: o endpoint dispara automação, e não deve ajudar
    // quem está testando token.
    return NextResponse.json({ erro: "Não autorizado." }, { status: 401 });
  }

  try {
    const resultado = await executarTick();
    return NextResponse.json(resultado);
  } catch (erro) {
    // O tick roda sem ninguém olhando: o erro precisa ficar no log do servidor,
    // porque não há tela para mostrá-lo neste momento.
    console.error("[agendador] tick falhou:", erro);
    return NextResponse.json(
      { erro: "O agendador falhou. O detalhe foi registrado no log do servidor." },
      { status: 500 },
    );
  }
}

function autorizado(request: Request): boolean {
  const esperado = process.env.SCHEDULER_TOKEN;

  // Sem token configurado o endpoint fica fechado, nunca aberto: falhar para o
  // lado seguro é o comportamento certo quando falta configuração.
  if (!esperado) return false;

  const recebido = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!recebido) return false;

  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}
