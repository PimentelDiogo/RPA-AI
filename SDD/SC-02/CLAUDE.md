# SC-02 — contrato do módulo

Vale para `SDD/SC-02/`, `src/modules/sc-02/`, `src/app/api/_fake/orgaos/` e as tabelas
`SituacaoFiscal` e `ConsultaTentativa`.
Projeto completo em [`SDD.md`](SDD.md) · Contrato geral em [`../../CLAUDE.md`](../../CLAUDE.md).

## Identificação

| | |
|---|---|
| Código | `SC-02` |
| Nome | Painel de situação fiscal dos clientes |
| Natureza | **RPA** |
| Área / perfil | `PROCESSOS` — enxergam `admin` e operador de Processos |
| Frequência | Diária às 6h, `America/Sao_Paulo` |
| Dor medida | 54 h/mês |

## Não negociáveis

1. **Consulta que falhou não pode sumir.** Toda tentativa é persistida em
   `ConsultaTentativa` — hora, órgão, erro, resposta bruta. É a armadilha que o
   enunciado marca neste processo.
2. **Duas tabelas, não uma.** `SituacaoFiscal` guarda a última leitura **bem-sucedida**;
   `ConsultaTentativa` guarda todas. Falha **nunca** sobrescreve nem apaga a situação
   anterior.
3. **Três estados no painel, nunca dois.** Regular, irregular e **não conseguimos
   perguntar**. O terceiro tem faixa própria e jamais se disfarça de regular.
4. **Idade do dado sempre visível.** "Regular há 2 dias" — porque a planilha de hoje
   "nasce vencida", e é isso que o módulo corrige.
5. **Resiliência é regra de negócio, não detalhe.** 3 tentativas, backoff exponencial,
   concorrência máxima de 4. Não remover para "ficar mais rápido".
6. **Dois adapters atrás do mesmo port.** `orgao-http` roda na nuvem; `orgao-playwright`
   dirige um navegador de verdade contra o portal-fake, local e no CI. Um RPA que nunca
   navegou não é RPA.
7. **O portal-fake erra de propósito.** Timeout, 503, sessão expirada e resposta
   malformada são injetados por seed determinístico. Não "consertar" o fake para a demo
   ficar bonita — o erro é parte da demonstração.
8. **Rodada com qualquer falha é `SUCESSO_PARCIAL`**, nunca `SUCESSO`.

## Fronteira — nunca chamar direto

`ConsultaOrgao` é o único ponto de contato com o mundo. **A credencial e o certificado
digital entram aqui** — deixar o lugar visível e comentado no adapter.

## O que vem pronto — não reimplementar

Histórico, duração, autoria, item a item, agendamento, permissão e tratamento de erro
vêm de `src/lib/execucao/` e `src/lib/auth/`.

## Cores

Carmim **só** em falha de execução. Irregularidade fiscal é **âmbar** (pendência do
cliente, não erro do sistema), e a faixa "não conseguimos consultar" também.

## Ao terminar

Checklist da seção 10 do [`SDD.md`](SDD.md) e suposições em
[`../../docs/SUPOSICOES.md`](../../docs/SUPOSICOES.md), no mesmo commit.
