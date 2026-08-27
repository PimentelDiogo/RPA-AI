# SC-05 — contrato do módulo

Vale para `SDD/SC-05/`, `src/modules/sc-05/`, `src/app/api/_fake/sistemas/` e as tabelas
`BloqueioCliente`, `SagaBloqueio` e `PassoSaga`.
Projeto completo em [`SDD.md`](SDD.md) · Contrato geral em [`../../CLAUDE.md`](../../CLAUDE.md).

## Identificação

| | |
|---|---|
| Código | `SC-05` |
| Nome | Bloqueio e desbloqueio de clientes inadimplentes |
| Natureza | **RPA** |
| Área / perfil | `TECNOLOGIA` — enxerga apenas `admin` |
| Frequência | Sob demanda + verificação diária de consistência |
| Dor medida | 11 h/mês |

## Não negociáveis

1. **O cliente NÃO é desativado no sistema de tarefas.** Troca-se o responsável das
   tarefas por um marcador de bloqueado, guardando o responsável original **por tarefa**.
   É a armadilha que o enunciado marca — e há um teste que falha se isso for violado.
2. **O desbloqueio é a compensação da mesma saga, em ordem inversa.** Nunca uma segunda
   rotina: duas rotinas divergem na primeira manutenção, que é o problema de hoje.
3. **Todo passo é idempotente e tem `compensate()` próprio.** Retomar não pode bloquear
   duas vezes nem quebrar por já estar bloqueado.
4. **`estadoAnterior` é gravado antes de cada passo.** Sem ele o desfazer devolve o
   cliente a um estado inventado.
5. **Falha parcial para a saga — não continua e não reverte sozinha.** Estado `PARCIAL`,
   o que foi aplicado fica visível, e a tela oferece **Retomar** ou **Reverter**.
   "Achei que bloqueou" é o defeito que este módulo existe para eliminar.
6. **A sequência é dado, não código espalhado.** Executor genérico; os passos são uma
   lista declarada. Acrescentar um quarto sistema não pode exigir tocar no executor.
7. **Ação com efeito sobre o cliente exige confirmação e motivo.** Sem motivo, não executa.

## Fronteiras — nunca chamar direto

`SistemaFinanceiro`, `PortalCliente` e `SistemaTarefas` são ports com adapter mock.
**A credencial de cada sistema entra no adapter real** — deixar o ponto visível.
O mock aceita ser configurado para falhar: é assim que a falha parcial é demonstrada, e
não deve ser removido.

## O que vem pronto — não reimplementar

Histórico, duração, autoria, item a item, agendamento, permissão e tratamento de erro
vêm de `src/lib/execucao/` e `src/lib/auth/`.

## Cores

Carmim **só** em passo que falhou. Estado `PARCIAL` é **âmbar**: é pendência que pede
decisão, não erro consumado.

## Ao terminar

Checklist da seção 11 do [`SDD.md`](SDD.md) e suposições em
[`../../docs/SUPOSICOES.md`](../../docs/SUPOSICOES.md), no mesmo commit.
