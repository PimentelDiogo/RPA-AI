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

const FIXTURES = join(process.cwd(), "tests", "fixtures", "sc-01");
/**
 * Os arquivos de demonstração ficam à parte dos usados em teste.
 *
 * O seed importa as fixtures, e o portal recusa reenvio do mesmo arquivo por
 * hash — o que é o comportamento correto, mas impede demonstrar um envio ao
 * vivo. Esta segunda leva, de outra competência, existe para isso.
 */
const DEMO = join(process.cwd(), "tests", "fixtures", "sc-01", "demo");

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

type Competencia = {
  /** `MM/AAAA`, como o extrato imprime. */
  rotulo: string;
  mes: string;
  ano: string;
  periodo: string;
  movimentos: Movimento[];
};

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

/** Segunda competência, para envio ao vivo. Valores diferentes de propósito. */
const MOVIMENTOS_SETEMBRO: Movimento[] = [
  { dia: "31/08", historico: "TED RECEBIDA CLIENTE MENSALIDADE", valor: 1840.0 },
  { dia: "02/09", historico: "PAGAMENTO FORNECEDOR BETA", valor: -723.4 },
  { dia: "05/09", historico: "PIX RECEBIDO HONORARIOS", valor: 3150.9 },
  { dia: "09/09", historico: "TARIFA PACOTE SERVICOS", valor: -74.5 },
  { dia: "12/09", historico: "PAGAMENTO ALUGUEL SALA COMERCIAL", valor: -2400.0 },
  { dia: "16/09", historico: "RECEBIMENTO DUPLICATA 5182", valor: 980.25 },
  { dia: "19/09", historico: "DEBITO AUTOMATICO TELEFONIA", valor: -189.9 },
  { dia: "23/09", historico: "DEPOSITO EM CHEQUE COMPENSADO", valor: 1420.0 },
  { dia: "26/09", historico: "PAGAMENTO GUIA PREVIDENCIARIA", valor: -1108.75 },
  { dia: "30/09", historico: "PIX RECEBIDO CLIENTE AVULSO", valor: 560.0 },
];

const AGOSTO: Competencia = {
  rotulo: "08/2026",
  mes: "08",
  ano: "2026",
  periodo: "31/07/2026 a 28/08/2026",
  movimentos: MOVIMENTOS,
};

const SETEMBRO: Competencia = {
  rotulo: "09/2026",
  mes: "09",
  ano: "2026",
  periodo: "31/08/2026 a 30/09/2026",
  movimentos: MOVIMENTOS_SETEMBRO,
};

const SALDO_INICIAL = 10000;

function saldoFinal(movimentos: Movimento[]): number {
  return movimentos.reduce((total, m) => total + m.valor, SALDO_INICIAL);
}

// ---------------------------------------------------------------------------
// Um layout por banco. É a diferença entre eles que dá sentido ao registry.
// ---------------------------------------------------------------------------

function aurora(c: Competencia): string[] {
  const movimentos = c.movimentos;
  const linhas = [
    "BANCO AURORA S.A.",
    "EXTRATO DE CONTA CORRENTE",
    "Agencia: 0412-7   Conta: 98765-4",
    `Periodo: ${c.periodo}`,
    "",
    `SALDO ANTERIOR${" ".repeat(30)}${reais(SALDO_INICIAL)} C`,
    "",
  ];

  for (const m of movimentos) {
    const valor = `${reais(m.valor)} ${m.valor < 0 ? "D" : "C"}`;
    const espaco = Math.max(2, 52 - m.historico.length - valor.length);
    linhas.push(`${m.dia}/${c.ano}  ${m.historico}${" ".repeat(espaco)}${valor}`);
  }

  linhas.push(
    "",
    `SALDO FINAL${" ".repeat(33)}${reais(saldoFinal(movimentos))} C`,
  );

  return linhas;
}

function meridiano(c: Competencia): string[] {
  const movimentos = c.movimentos;
  const linhas = [
    "BANCO MERIDIANO",
    "EXTRATO ELETRONICO AG=1234 CC=567890-1",
    `SALDO_INICIAL=${SALDO_INICIAL.toFixed(2)}`,
  ];

  for (const m of movimentos) {
    const [dia, mes] = m.dia.split("/");
    linhas.push(`${c.ano}-${mes}-${dia}|${m.historico}|${m.valor.toFixed(2)}`);
  }

  linhas.push(`SALDO_FINAL=${saldoFinal(movimentos).toFixed(2)}`);
  return linhas;
}

function pampa(c: Competencia): string[] {
  const movimentos = c.movimentos;
  const linhas = [
    "BANCO PAMPA",
    `COMPETENCIA ${c.rotulo}`,
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
function bancoDesconhecido(c: Competencia): string[] {
  const movimentos = c.movimentos;
  const linhas = [
    "COOPERATIVA DE CREDITO HORIZONTE",
    "DEMONSTRATIVO DE MOVIMENTACAO",
    "",
    "  DATA        DESCRICAO                          VALOR (R$)",
  ];

  for (const m of movimentos) {
    linhas.push(
      `  ${m.dia}.${c.ano}   ${m.historico.padEnd(34)} ${m.valor.toFixed(2).padStart(12)}`,
    );
  }

  return linhas;
}

/**
 * Aurora com um lançamento a menos.
 *
 * O saldo final continua sendo o da movimentação completa, então a soma não
 * fecha — é o extrato que o portal precisa recusar em vez de converter errado.
 * O histórico removido vem por parâmetro porque cada competência tem os seus.
 */
function auroraComFuro(c: Competencia, historicoRemovido: string): string[] {
  const completo = aurora(c);
  const semALinha = completo.filter(
    (linha) => !linha.includes(historicoRemovido),
  );

  if (semALinha.length === completo.length) {
    throw new Error(
      `"${historicoRemovido}" não existe na competência ${c.rotulo} — o furo não seria criado.`,
    );
  }

  return semALinha;
}

async function gerar(pasta: string, arquivos: [string, string[]][]) {
  mkdirSync(pasta, { recursive: true });

  for (const [nome, linhas] of arquivos) {
    const bytes = await pdf(linhas);
    writeFileSync(join(pasta, nome), bytes);
    console.log(`  ${nome.padEnd(38)} ${linhas.length} linhas, ${bytes.length} bytes`);
  }
}

async function main() {
  console.log("[extratos] massa usada pelos testes e pelo seed:");
  await gerar(FIXTURES, [
    ["aurora-agosto-2026.pdf", aurora(AGOSTO)],
    ["meridiano-agosto-2026.pdf", meridiano(AGOSTO)],
    ["pampa-agosto-2026.pdf", pampa(AGOSTO)],
    ["horizonte-layout-desconhecido.pdf", bancoDesconhecido(AGOSTO)],
    ["aurora-soma-nao-fecha.pdf", auroraComFuro(AGOSTO, "DEPOSITO EM DINHEIRO")],
  ]);

  console.log("\n[extratos] arquivos para enviar ao vivo (competência seguinte):");
  await gerar(DEMO, [
    ["aurora-setembro-2026.pdf", aurora(SETEMBRO)],
    ["meridiano-setembro-2026.pdf", meridiano(SETEMBRO)],
    ["pampa-setembro-2026.pdf", pampa(SETEMBRO)],
    ["horizonte-setembro-2026.pdf", bancoDesconhecido(SETEMBRO)],
    [
      "aurora-setembro-soma-nao-fecha.pdf",
      auroraComFuro(SETEMBRO, "PIX RECEBIDO HONORARIOS"),
    ],
  ]);

  console.log(
    [
      "",
      "Os de agosto o seed já importa — reenviá-los é recusado por hash, que é o",
      "comportamento correto. Use os de setembro para demonstrar um envio ao vivo:",
      "",
      "  aurora-setembro-2026.pdf             parser reconhece, OFX é gerado",
      "  horizonte-setembro-2026.pdf          layout desconhecido: cai na leitura por IA",
      "  aurora-setembro-soma-nao-fecha.pdf   soma não fecha: OFX não é gerado",
      "",
    ].join("\n"),
  );
}

main().catch((erro) => {
  console.error(erro);
  process.exitCode = 1;
});
