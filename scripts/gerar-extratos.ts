/**
 * Gera os extratos bancários sintéticos do SC-01, em PDF.
 *
 * O enunciado é explícito: *"os dados são seus… extratos e notas que você mesmo
 * produziu"*. Estes arquivos são a massa do módulo — ficam versionados em
 * `tests/fixtures/sc-01/` e alimentam tanto o seed quanto a demonstração.
 *
 * Os bancos são fictícios, e cada um imprime de um jeito diferente de
 * propósito: é esse o problema que o registry de parsers resolve.
 *
 *   npx tsx scripts/gerar-extratos.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { PDFDocument, StandardFonts } from "pdf-lib";

const DESTINO = join(process.cwd(), "tests", "fixtures", "sc-01");

/** PDF com texto nativo, em fonte monoespaçada — como extrato de banco. */
async function pdf(linhas: string[]): Promise<Uint8Array> {
  const documento = await PDFDocument.create();
  const fonte = await documento.embedFont(StandardFonts.Courier);

  let pagina = documento.addPage([595, 842]); // A4
  let y = 800;

  for (const linha of linhas) {
    if (y < 40) {
      pagina = documento.addPage([595, 842]);
      y = 800;
    }

    pagina.drawText(linha, { x: 40, y, size: 9, font: fonte });
    y -= 13;
  }

  return documento.save();
}

/** Formata em real brasileiro sem o símbolo, como o extrato faz. */
function reais(valor: number): string {
  return Math.abs(valor)
    .toFixed(2)
    .replace(".", ",")
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

type Movimento = { dia: string; historico: string; valor: number };

const MOVIMENTOS: Movimento[] = [
  { dia: "31/07", historico: "TRANSFERENCIA RECEBIDA CLIENTE", valor: 1250.0 },
  { dia: "01/08", historico: "PAGAMENTO FORNECEDOR ALFA", valor: -430.55 },
  { dia: "04/08", historico: "DEPOSITO EM DINHEIRO", valor: 890.0 },
  { dia: "07/08", historico: "TARIFA MANUTENCAO CONTA", valor: -59.9 },
  { dia: "11/08", historico: "PIX RECEBIDO SERVICOS PRESTADOS", valor: 2340.75 },
  { dia: "14/08", historico: "PAGAMENTO FOLHA DE PAGAMENTO", valor: -1875.2 },
  { dia: "18/08", historico: "RECEBIMENTO DUPLICATA 4471", valor: 615.4 },
  { dia: "21/08", historico: "DEBITO AUTOMATICO ENERGIA", valor: -312.18 },
  { dia: "25/08", historico: "PIX RECEBIDO CLIENTE MENSALIDADE", valor: 1100.0 },
  { dia: "28/08", historico: "PAGAMENTO IMPOSTO MUNICIPAL", valor: -248.63 },
];

const SALDO_INICIAL = 10000;

function saldoFinal(movimentos: Movimento[]): number {
  return movimentos.reduce((total, m) => total + m.valor, SALDO_INICIAL);
}

// ---------------------------------------------------------------------------
// Um layout por banco. É a diferença entre eles que dá sentido ao registry.
// ---------------------------------------------------------------------------

function aurora(movimentos: Movimento[]): string[] {
  const linhas = [
    "BANCO AURORA S.A.",
    "EXTRATO DE CONTA CORRENTE",
    "Agencia: 0412-7   Conta: 98765-4",
    "Periodo: 31/07/2026 a 28/08/2026",
    "",
    `SALDO ANTERIOR${" ".repeat(30)}${reais(SALDO_INICIAL)} C`,
    "",
  ];

  for (const m of movimentos) {
    const valor = `${reais(m.valor)} ${m.valor < 0 ? "D" : "C"}`;
    const espaco = Math.max(2, 52 - m.historico.length - valor.length);
    linhas.push(`${m.dia}/2026  ${m.historico}${" ".repeat(espaco)}${valor}`);
  }

  linhas.push(
    "",
    `SALDO FINAL${" ".repeat(33)}${reais(saldoFinal(movimentos))} C`,
  );

  return linhas;
}

function meridiano(movimentos: Movimento[]): string[] {
  const linhas = [
    "BANCO MERIDIANO",
    "EXTRATO ELETRONICO AG=1234 CC=567890-1",
    `SALDO_INICIAL=${SALDO_INICIAL.toFixed(2)}`,
  ];

  for (const m of movimentos) {
    const [dia, mes] = m.dia.split("/");
    linhas.push(`2026-${mes}-${dia}|${m.historico}|${m.valor.toFixed(2)}`);
  }

  linhas.push(`SALDO_FINAL=${saldoFinal(movimentos).toFixed(2)}`);
  return linhas;
}

function pampa(movimentos: Movimento[]): string[] {
  const linhas = [
    "BANCO PAMPA",
    "COMPETENCIA 08/2026",
    "AG 0987-1  CONTA 11223-4",
    `SALDO ANT ....... +${reais(SALDO_INICIAL)}`,
    "",
  ];

  for (const [indice, m] of movimentos.entries()) {
    // O Pampa trunca histórico longo — e é isso que produz a ressalva.
    const historico =
      indice === 5 ? `${m.historico.slice(0, 18)}...` : m.historico;
    const valor = `${m.valor < 0 ? "-" : "+"}${reais(m.valor)}`;
    const pontos = ".".repeat(Math.max(3, 46 - historico.length - valor.length));
    linhas.push(`${m.dia} ${historico} ${pontos} ${valor}`);
  }

  linhas.push("", `SALDO ATUAL ..... +${reais(saldoFinal(movimentos))}`);
  return linhas;
}

/** Layout que nenhum parser conhece — o caminho de leitura assistida. */
function bancoDesconhecido(movimentos: Movimento[]): string[] {
  const linhas = [
    "COOPERATIVA DE CREDITO HORIZONTE",
    "DEMONSTRATIVO DE MOVIMENTACAO",
    "",
    "  DATA        DESCRICAO                          VALOR (R$)",
  ];

  for (const m of movimentos) {
    linhas.push(
      `  ${m.dia}.2026   ${m.historico.padEnd(34)} ${m.valor.toFixed(2).padStart(12)}`,
    );
  }

  return linhas;
}

/** Aurora com um lançamento a menos: a soma não fecha com o saldo declarado. */
function auroraComFuro(): string[] {
  const completo = aurora(MOVIMENTOS);
  // Remove uma linha de lançamento e mantém o saldo final — é o extrato que o
  // portal precisa recusar em vez de converter errado.
  return completo.filter((linha) => !linha.includes("DEPOSITO EM DINHEIRO"));
}

async function main() {
  mkdirSync(DESTINO, { recursive: true });

  const arquivos: [string, string[]][] = [
    ["aurora-agosto-2026.pdf", aurora(MOVIMENTOS)],
    ["meridiano-agosto-2026.pdf", meridiano(MOVIMENTOS)],
    ["pampa-agosto-2026.pdf", pampa(MOVIMENTOS)],
    ["horizonte-layout-desconhecido.pdf", bancoDesconhecido(MOVIMENTOS)],
    ["aurora-soma-nao-fecha.pdf", auroraComFuro()],
  ];

  for (const [nome, linhas] of arquivos) {
    const bytes = await pdf(linhas);
    writeFileSync(join(DESTINO, nome), bytes);
    console.log(`[extratos] ${nome} — ${linhas.length} linhas, ${bytes.length} bytes`);
  }

  console.log(`\n[extratos] gerados em ${DESTINO}`);
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
