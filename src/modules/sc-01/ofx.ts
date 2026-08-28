/**
 * Gerador de OFX 1.0.2 (SGML).
 *
 * Escrito à mão de propósito: OFX 1.0.2 não é XML — é SGML com tags sem
 * fechamento nos campos simples, e as bibliotecas disponíveis ou geram a versão
 * 2 (XML) ou tratam apenas leitura. É a versão que os sistemas contábeis
 * brasileiros importam, então é a que o portal produz.
 *
 * O que o formato exige e que costuma ser esquecido: o cabeçalho com as linhas
 * `chave:valor` antes do `<OFX>`, datas no formato `AAAAMMDDHHMMSS`, e um
 * `FITID` único e estável por lançamento — sem ele o sistema contábil não sabe
 * distinguir reimportação de lançamento novo, e duplica.
 */

export type LancamentoOfx = {
  data: Date;
  historico: string;
  /** Negativo é débito. */
  valor: number;
  /** Identificador estável do lançamento dentro do extrato. */
  identificador: string;
};

export type DadosOfx = {
  banco: string;
  agencia?: string;
  conta?: string;
  competenciaInicio: Date;
  competenciaFim: Date;
  saldoFinal?: number;
  lancamentos: LancamentoOfx[];
  /** Momento da geração. Injetável para o teste ser determinístico. */
  geradoEm?: Date;
};

/** `AAAAMMDDHHMMSS` no fuso da operação, como o formato pede. */
function dataOfx(valor: Date, apenasData = false): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(valor);

  const parte = (tipo: string) =>
    partes.find((item) => item.type === tipo)?.value ?? "00";

  const dia = `${parte("year")}${parte("month")}${parte("day")}`;

  return apenasData
    ? `${dia}000000`
    : `${dia}${parte("hour")}${parte("minute")}${parte("second")}`;
}

/**
 * Data pura (lançamento) não passa por conversão de fuso: ela já veio como
 * data, e reinterpretá-la em São Paulo a jogaria para o dia anterior.
 */
function dataPuraOfx(valor: Date): string {
  const ano = valor.getUTCFullYear();
  const mes = String(valor.getUTCMonth() + 1).padStart(2, "0");
  const dia = String(valor.getUTCDate()).padStart(2, "0");
  return `${ano}${mes}${dia}000000`;
}

function valorOfx(valor: number): string {
  return valor.toFixed(2);
}

/** O formato não aceita `&`, `<` e `>` crus no conteúdo. */
function texto(valor: string): string {
  return valor
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .trim();
}

export function gerarOfx(dados: DadosOfx): string {
  const agora = dados.geradoEm ?? new Date();
  const linhas: string[] = [];

  // Cabeçalho SGML — não é XML, e a linha em branco antes do <OFX> é exigida.
  linhas.push(
    "OFXHEADER:100",
    "DATA:OFXSGML",
    "VERSION:102",
    "SECURITY:NONE",
    "ENCODING:USASCII",
    "CHARSET:1252",
    "COMPRESSION:NONE",
    "OLDFILEUID:NONE",
    "NEWFILEUID:NONE",
    "",
  );

  linhas.push("<OFX>");
  linhas.push("<SIGNONMSGSRSV1>");
  linhas.push("<SONRS>");
  linhas.push("<STATUS>");
  linhas.push("<CODE>0");
  linhas.push("<SEVERITY>INFO");
  linhas.push("</STATUS>");
  linhas.push(`<DTSERVER>${dataOfx(agora)}`);
  linhas.push("<LANGUAGE>POR");
  linhas.push("</SONRS>");
  linhas.push("</SIGNONMSGSRSV1>");

  linhas.push("<BANKMSGSRSV1>");
  linhas.push("<STMTTRNRS>");
  linhas.push("<TRNUID>1");
  linhas.push("<STATUS>");
  linhas.push("<CODE>0");
  linhas.push("<SEVERITY>INFO");
  linhas.push("</STATUS>");
  linhas.push("<STMTRS>");
  linhas.push("<CURDEF>BRL");

  linhas.push("<BANKACCTFROM>");
  linhas.push(`<BANKID>${texto(dados.banco)}`);
  if (dados.agencia) linhas.push(`<BRANCHID>${texto(dados.agencia)}`);
  linhas.push(`<ACCTID>${texto(dados.conta ?? "SEM-CONTA")}`);
  linhas.push("<ACCTTYPE>CHECKING");
  linhas.push("</BANKACCTFROM>");

  linhas.push("<BANKTRANLIST>");
  linhas.push(`<DTSTART>${dataPuraOfx(dados.competenciaInicio)}`);
  linhas.push(`<DTEND>${dataPuraOfx(dados.competenciaFim)}`);

  for (const lancamento of dados.lancamentos) {
    linhas.push("<STMTTRN>");
    linhas.push(`<TRNTYPE>${lancamento.valor < 0 ? "DEBIT" : "CREDIT"}`);
    linhas.push(`<DTPOSTED>${dataPuraOfx(lancamento.data)}`);
    linhas.push(`<TRNAMT>${valorOfx(lancamento.valor)}`);
    linhas.push(`<FITID>${texto(lancamento.identificador)}`);
    linhas.push(`<MEMO>${texto(lancamento.historico)}`);
    linhas.push("</STMTTRN>");
  }

  linhas.push("</BANKTRANLIST>");

  if (dados.saldoFinal !== undefined) {
    linhas.push("<LEDGERBAL>");
    linhas.push(`<BALAMT>${valorOfx(dados.saldoFinal)}`);
    linhas.push(`<DTASOF>${dataPuraOfx(dados.competenciaFim)}`);
    linhas.push("</LEDGERBAL>");
  }

  linhas.push("</STMTRS>");
  linhas.push("</STMTTRNRS>");
  linhas.push("</BANKMSGSRSV1>");
  linhas.push("</OFX>");

  return `${linhas.join("\r\n")}\r\n`;
}

/**
 * Identificador estável de um lançamento.
 *
 * Precisa ser o mesmo se o arquivo for reimportado, e diferente entre dois
 * lançamentos parecidos no mesmo dia — daí a ordem entrar na conta.
 */
export function identificadorDoLancamento(dados: {
  extratoId: string;
  ordem: number;
}): string {
  return `${dados.extratoId.slice(-12)}-${String(dados.ordem).padStart(4, "0")}`;
}
