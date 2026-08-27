# SC-20 — contrato do módulo

Vale para todo trabalho em `SDD/SC-20/`, `src/modules/sc-20/` e nas tabelas
`Certificado`, `ContatoAviso` e `AvisoCertificado`.
Projeto completo em [`SDD.md`](SDD.md) · Contrato geral em [`../../CLAUDE.md`](../../CLAUDE.md).

## Identificação

| | |
|---|---|
| Código | `SC-20` |
| Nome | Vencimento de certificado digital |
| Natureza | **Controle sistematizado** (a única das três no escopo — não trocar sem decisão registrada) |
| Área / perfil | `PROCESSOS` — enxergam `admin` e operador de Processos |
| Frequência | Diária às 8h, `America/Sao_Paulo` |
| Dor medida | 2 h/mês |

## Não negociáveis

1. **Aviso repetido é o defeito, não o objetivo.** Se a faixa do certificado não mudou
   desde o último aviso, **suprime** — e grava a supressão. Nunca reenviar a lista
   inteira a cada rodada. É a armadilha que o enunciado marca neste processo.
2. **O gatilho é mudança de faixa**, não passagem de tempo. 45 → 44 dias não gera nada;
   cruzar para ≤30 gera.
3. **A faixa fica gravada no aviso.** É ela que a rodada seguinte compara. Guardar só a
   data não responde "mudou alguma coisa?".
4. **Nada sai da aplicação.** O port `Notificador` só tem o adapter `outbox`, que grava e
   exibe. A credencial de e-mail/WhatsApp entraria no adapter real — deixar o ponto
   visível e comentado.
5. **Dias restantes, não só a data.** O painel mostra quanto tempo resta; é o que o
   enunciado pede e o que torna a informação acionável.
6. **Janela configurável**, com 60 dias de padrão. Não cravar 60 no código.
7. **Datas no fuso `America/Sao_Paulo`.** Vencimento com fuso errado erra por um dia,
   e um dia importa aqui.
8. **Massa do seed é relativa ao dia da execução**, nunca datas fixas: o painel precisa
   fazer sentido em qualquer dia de demonstração.

## O que vem pronto — não reimplementar

Histórico, duração, autoria, item a item, agendamento, permissão e tratamento de erro
vêm de `src/lib/execucao/` e `src/lib/auth/`. Este módulo implementa **apenas o handler**
e as suas tabelas.

## Cores

Carmim (`--sheep-carmim`) **só** em certificado vencido e em item que falhou. Faixas ≤15
e ≤30 usam âmbar (pendência). Nunca hex literal em componente — só tokens.

## Ao terminar

Verificar contra o checklist da seção 11 do [`SDD.md`](SDD.md) e registrar qualquer
suposição nova em [`../../docs/SUPOSICOES.md`](../../docs/SUPOSICOES.md), no mesmo
commit em que a decisão entra no código.
