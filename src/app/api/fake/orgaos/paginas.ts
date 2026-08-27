import {
  NOME_ORGAO,
  type Comportamento,
  type OrgaoSlug,
} from "./comportamento";

/**
 * As páginas do portal-fake.
 *
 * HTML de verdade, com formulário de verdade — feio de propósito, parecido com
 * portal de órgão. É o que o adapter de navegador (Playwright) preenche e o que
 * o adapter HTTP raspa. Os marcadores `data-*` existem para que a leitura da
 * resposta não dependa de texto visível, que muda.
 */

const ESTILO = `
  body { font-family: Verdana, Arial, sans-serif; background: #f2f2f2; margin: 0; color: #1a1a1a; }
  .barra { background: #1a3a6b; color: #fff; padding: 12px 20px; font-weight: bold; }
  .caixa { background: #fff; border: 1px solid #ccc; margin: 24px auto; padding: 20px; max-width: 640px; }
  label { display: block; font-size: 13px; margin-bottom: 4px; }
  input[type=text] { width: 260px; padding: 6px; border: 1px solid #999; font-family: monospace; }
  button { margin-top: 12px; padding: 8px 18px; background: #1a3a6b; color: #fff; border: 0; cursor: pointer; }
  .resultado { border-left: 6px solid #666; padding: 12px 16px; margin-top: 16px; background: #fafafa; }
  .regular { border-color: #1a7f37; }
  .irregular { border-color: #b35900; }
  .erro { border-color: #a11; }
  .rodape { font-size: 11px; color: #666; padding: 12px 20px; }
  code { font-family: monospace; }
`;

function moldura(titulo: string, corpo: string): string {
  return `<!doctype html>
<html lang="pt-BR">
<head><meta charset="utf-8"><title>${titulo}</title><style>${ESTILO}</style></head>
<body>
  <div class="barra">${titulo}</div>
  <div class="caixa">${corpo}</div>
  <div class="rodape">
    Portal simulado, servido pelo próprio projeto para o desafio técnico.
    Nenhum órgão real é consultado e nenhum dado aqui é verdadeiro.
  </div>
</body>
</html>`;
}

export function paginaDeConsulta(orgao: OrgaoSlug): string {
  return moldura(
    `${NOME_ORGAO[orgao]} — Consulta de regularidade`,
    `<form method="post" data-formulario="consulta">
      <label for="cnpj">CNPJ do contribuinte (somente números)</label>
      <input type="text" id="cnpj" name="cnpj" maxlength="14" required>
      <button type="submit" name="consultar">Consultar</button>
    </form>
    <p style="font-size:12px;color:#666">
      Para forçar um cenário na demonstração, acrescente
      <code>?simular=timeout</code> à URL. Valores aceitos: regular, irregular,
      indisponivel, timeout, fora-do-ar, sessao-expirada, formato-inesperado.
    </p>`,
  );
}

export function paginaDeResultado(
  orgao: OrgaoSlug,
  cnpj: string,
  comportamento: Comportamento,
): { html: string; status: number } {
  const cabecalho = `${NOME_ORGAO[orgao]} — Resultado da consulta`;
  const identificacao = `<p>CNPJ consultado: <code data-cnpj>${cnpj}</code></p>`;

  switch (comportamento.tipo) {
    case "regular":
      return {
        status: 200,
        html: moldura(
          cabecalho,
          `${identificacao}
           <div class="resultado regular" data-situacao="REGULAR">
             <strong>Não constam pendências</strong>
             <p data-detalhe>Certidão negativa emitida nesta consulta.</p>
           </div>`,
        ),
      };

    case "irregular":
      return {
        status: 200,
        html: moldura(
          cabecalho,
          `${identificacao}
           <div class="resultado irregular" data-situacao="IRREGULAR">
             <strong>Constam pendências</strong>
             <p data-detalhe>${comportamento.pendencia}</p>
           </div>`,
        ),
      };

    case "indisponivel":
      return {
        status: 200,
        html: moldura(
          cabecalho,
          `${identificacao}
           <div class="resultado" data-situacao="INDISPONIVEL">
             <strong>Consulta indisponível para este contribuinte</strong>
             <p data-detalhe>Base em processamento. Tente novamente mais tarde.</p>
           </div>`,
        ),
      };

    case "sessao-expirada":
      // Responde 200, e é isso que torna o caso traiçoeiro: quem só olha o
      // código HTTP acha que deu certo.
      return {
        status: 200,
        html: moldura(
          cabecalho,
          `<div class="resultado erro" data-erro="SESSAO_EXPIRADA">
             <strong>Sua sessão expirou</strong>
             <p>Refaça o acesso para continuar a consulta.</p>
           </div>`,
        ),
      };

    case "fora-do-ar":
      return {
        status: 503,
        html: moldura(
          "Serviço indisponível",
          `<div class="resultado erro">
             <strong>Serviço temporariamente indisponível</strong>
             <p>Estamos em manutenção. Tente novamente em alguns minutos.</p>
           </div>`,
        ),
      };

    case "formato-inesperado":
      // Nem HTML: o portal mudou e ninguém avisou.
      return { status: 200, html: "OK|0|SEM-DADOS|##" };

    case "timeout":
      // Tratado antes de chegar aqui: a rota apenas demora.
      return { status: 200, html: moldura(cabecalho, identificacao) };
  }
}
