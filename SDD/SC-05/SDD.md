# SC-05 — Bloqueio e desbloqueio de clientes inadimplentes

> **Natureza:** RPA · **Complexidade:** Média · **Frequência:** Sob demanda
> **Setor:** Tecnologia · **Medição do mapeamento interno:** 11 h/mês
> **Estado:** especificado, implementação pendente

---

## 1. O que o enunciado diz

**Hoje.** Quando um cliente fica inadimplente, alguém repete a mesma sequência de passos
em vários sistemas que não se integram, um de cada vez. Quando ele acerta a dívida,
repete tudo ao contrário.

**Onde dói.** Dez minutos por registro, cerca de 63 registros por mês, 11 horas. E como é
manual, sempre sobra um sistema em que o bloqueio não foi aplicado.

**Esperado.** Uma ação no portal executa a sequência inteira, mostra o que foi feito em
cada sistema e permite desfazer quando o cliente renegocia.

**Atenção.** *O cliente não é desativado no sistema de tarefas, porque a maioria
renegocia depois e recriar o histórico dá mais trabalho. O que se faz é trocar o
responsável das tarefas por um marcador de bloqueado. Reproduza isso, e saiba voltar
atrás.*

### Por que este processo entra no escopo

É o único dos quatro que exercita **orquestração com desfazer**. "Sempre sobra um sistema
em que o bloqueio não foi aplicado" é um problema de transação distribuída em roupa de
contabilidade — e a resposta a ele é a peça técnica mais interessante da entrega.

---

## 2. As duas armadilhas

**A que o enunciado marca explicitamente:** no sistema de tarefas, **não desativar** o
cliente. Trocar o responsável das tarefas por um marcador de bloqueado, guardando quem
era o responsável original — senão não há como voltar atrás.

**A que o enunciado implica em "sempre sobra um sistema":** falha parcial. Se o passo 2
de 3 falha, o cliente fica bloqueado em um sistema e livre em outro, e ninguém sabe.
A resposta é uma **saga**: passos idempotentes, cada um com o seu `compensate()`,
e um estado que diz exatamente onde parou.

---

## 3. A saga

```
BLOQUEIO                                    DESBLOQUEIO = compensação, ordem inversa
1. SistemaFinanceiro.marcarInadimplente()   3'. SistemaTarefas.devolverResponsavel()
2. PortalCliente.revogarAcesso()            2'. PortalCliente.restaurarAcesso()
3. SistemaTarefas.trocarResponsavel()       1'. SistemaFinanceiro.limparInadimplencia()
```

**O desbloqueio não é uma segunda rotina.** É a compensação da mesma saga, executada na
ordem inversa — mesmo código, mesmos passos, mesma tela. Duas rotinas separadas
divergiriam na primeira manutenção, que é exatamente o problema de hoje.

Propriedades exigidas de cada passo:

| Propriedade | Por quê |
|-------------|---------|
| **Idempotente** | Retomar uma saga não pode bloquear duas vezes nem quebrar por já estar bloqueado |
| **`compensate()` próprio** | Desfazer é responsabilidade de quem fez |
| **Estado persistido antes e depois** | Se o processo morrer entre dois passos, a retomada sabe onde estava |
| **Declarado como dado** | O executor é genérico; a sequência é uma lista, não código espalhado |

### Falha parcial — o que acontece de verdade

Passo falha → a saga **para**, não continua. O estado fica `PARCIAL`, a tela mostra o que
já foi aplicado e o que não foi, e oferece duas ações explícitas:

- **Retomar** — tenta de novo a partir do passo que falhou;
- **Reverter** — compensa o que já foi aplicado e volta o cliente ao estado anterior.

Nada é decidido sozinho. "Achei que bloqueou" é justamente o defeito que o módulo existe
para eliminar.

---

## 4. Suposições

| # | Suposição | Porque |
|---|-----------|--------|
| 1 | São três sistemas: financeiro, portal do cliente e sistema de tarefas | O enunciado diz "vários sistemas" e detalha apenas o de tarefas |
| 2 | O bloqueio é sempre por cliente inteiro, nunca por serviço | O enunciado fala em "cliente inadimplente", sem granularidade menor |
| 3 | O marcador de bloqueado no sistema de tarefas é um usuário-robô dedicado | Precisa ser um responsável válido para as tarefas continuarem existindo |
| 4 | O responsável original é guardado por tarefa, não por cliente | Tarefas de um mesmo cliente podem ter responsáveis diferentes; devolver todas para uma pessoa só perderia informação |
| 5 | Um cliente já bloqueado não é bloqueado de novo | Idempotência: a ação é recusada com mensagem clara |
| 6 | Só o `admin` dispara bloqueio | É ação com efeito sobre o cliente; o enunciado põe o processo no setor de Tecnologia |

---

## 5. Arquitetura

### Fronteiras mockadas — onde entraria o real

| Port | Operações | Adapter desta entrega | O que entraria no lugar |
|------|-----------|----------------------|-------------------------|
| `SistemaFinanceiro` | `marcarInadimplente` / `limparInadimplencia` | Mock em memória + banco | ERP financeiro do escritório |
| `PortalCliente` | `revogarAcesso` / `restaurarAcesso` | Mock | Portal real do cliente |
| `SistemaTarefas` | `trocarResponsavel` / `devolverResponsavel` | Mock que **guarda o responsável original por tarefa** | Sistema de tarefas do escritório |

Os três mocks têm estado visível no portal, para a demonstração mostrar o antes e o
depois em cada um. **A credencial de cada sistema entra no adapter real.**

### O que não pode ser falso

O executor de saga, a idempotência dos passos, a compensação em ordem inversa, a
detecção e o tratamento de falha parcial, e a preservação do responsável original.

---

## 6. Modelo de dados

```
EstadoBloqueio    enum: LIVRE | BLOQUEADO | PARCIAL | REVERTENDO
DirecaoSaga       enum: BLOQUEIO | DESBLOQUEIO
StatusPasso       enum: PENDENTE | APLICADO | FALHOU | COMPENSADO

BloqueioCliente
  id, clienteId → Cliente  @unique
  estado         EstadoBloqueio
  motivo         texto
  bloqueadoEm, desbloqueadoEm

SagaBloqueio
  id, clienteId → Cliente, execucaoId → Execucao
  direcao        DirecaoSaga
  passoAtual     int
  concluida      boolean

PassoSaga
  id, sagaId → SagaBloqueio
  ordem          int
  sistema        texto            "SistemaFinanceiro" | "PortalCliente" | "SistemaTarefas"
  acao           texto
  status         StatusPasso
  erro           texto            mensagem legível
  estadoAnterior json             o que era antes — é o que permite compensar
  iniciadoEm, concluidoEm
```

`estadoAnterior` é o coração do desfazer: sem guardar o responsável original de cada
tarefa, o desbloqueio devolveria o cliente a um estado inventado.

---

## 7. Fluxo de execução

1. O operador escolhe o cliente, informa o motivo e confirma.
2. A saga é criada com os três passos em `PENDENTE`.
3. Cada passo, em ordem: grava `estadoAnterior` → executa → marca `APLICADO` → registra
   item no histórico.
4. **Se um passo falha:** marca `FALHOU`, para a saga, deixa o cliente em `PARCIAL` e a
   execução em `SUCESSO_PARCIAL`. Nada é revertido automaticamente — quem decide é gente.
5. **Desbloqueio:** mesma saga, `direcao = DESBLOQUEIO`, passos na ordem inversa
   chamando `compensate()` com o `estadoAnterior` gravado.

Resumo: `"Trigo de Ouro bloqueado em 3 sistemas"` ou
`"Trigo de Ouro — bloqueio parcial: falhou no portal do cliente"`.

### Tratamento de erro

| Situação | Comportamento |
|----------|---------------|
| Sistema fora do ar | Passo `FALHOU` com mensagem legível; saga para em `PARCIAL` |
| Cliente já bloqueado | `ErroDeNegocio` antes de começar; nada é executado |
| Falha ao compensar | Estado `REVERTENDO` com o passo que resistiu em destaque — o pior caso possível, e precisa ser visível, não silencioso |
| Processo morre no meio | O estado no banco diz onde parou; a tela oferece retomar ou reverter |

---

## 8. Agendamento

**Sob demanda, por natureza** — o gatilho é uma decisão comercial, não o relógio.
O agendamento diário apenas **verifica consistência**: aponta cliente marcado como
bloqueado cujo estado nos sistemas divergiu, que é o "sempre sobra um sistema" aparecendo
depois do fato.

| Item | Valor |
|------|-------|
| Cron da verificação | `0 7 * * *` |
| Disparo principal | Manual, pelo portal |

---

## 9. Saída visível no portal

Tela `/modulos/sc-05`:

1. **Lista de clientes** com o estado atual: livre, bloqueado ou **parcial** (em âmbar,
   pedindo decisão).
2. **Ação de bloquear / desbloquear**, com confirmação e motivo obrigatório.
3. **Linha do tempo da execução** — a tela principal do módulo: sistema, ação, resultado
   e hora, passo a passo. É o que mostra que **não sobrou sistema sem bloqueio**.
4. **Estado dos três sistemas mockados**, lado a lado, para o antes e depois.
5. Histórico de execuções.

### Permissão

Área `TECNOLOGIA`. Enxerga: `admin`. Nenhum dos operadores semeados tem essa área — de
propósito: é a demonstração mais clara de que a regra de perfil vale.

---

## 10. Como rodar e testar

### 10.1 Preparar

```bash
cp .env.example .env
npm install && npm run db:up && npm run db:migrate && npm run db:seed
npm run dev
```

### 10.2 Teste automatizado

```bash
npx vitest run tests/sc-05-saga.test.ts          # ordem, idempotência, compensação inversa
npx vitest run tests/sc-05-falha-parcial.test.ts # para no passo que falhou; retoma; reverte
npx vitest run tests/sc-05-tarefas.test.ts       # troca de responsável, nunca desativação
```

O teste `sc-05-tarefas` é o que guarda a armadilha do enunciado: ele falha se alguém
trocar a troca de responsável por uma desativação de cliente.

### 10.3 Teste manual — caminho feliz

1. Entre com `admin@sheepcontabil.com.br` / `sheep2026` e abra **SC-05**.
2. Escolha um cliente **livre**, informe o motivo e clique em **Bloquear**.
3. Confira a linha do tempo: três passos, três sistemas, com hora e resultado.
4. No bloco dos sistemas mockados, verifique que no **sistema de tarefas** o cliente
   **continua ativo** — o que mudou foi o responsável das tarefas, agora o marcador de
   bloqueado. O responsável original está guardado.
5. Clique em **Desbloquear**. Confira que os passos rodam **na ordem inversa** e que cada
   tarefa volta para o **responsável original**, não para um padrão.

### 10.4 Teste manual — falha parcial (o mais importante)

O mock aceita instrução para falhar num sistema específico:

```bash
curl -X POST http://localhost:3000/api/fake/sistemas/configurar \
  -H "Content-Type: application/json" \
  -d '{"sistema":"PortalCliente","falhar":true}'
```

1. Bloqueie um cliente. O passo 2 vai falhar.
2. Confira que:
   - A execução terminou em **Sucesso parcial**;
   - A linha do tempo mostra o passo 1 **aplicado**, o passo 2 **falhou** e o passo 3
     **não executado** — a saga parou, não continuou;
   - O cliente está em estado **Parcial**, em âmbar;
   - A tela oferece **Retomar** e **Reverter**, e **nada** foi decidido sozinho.
3. Restaure o sistema e clique em **Retomar**:
   ```bash
   curl -X POST http://localhost:3000/api/fake/sistemas/configurar \
     -H "Content-Type: application/json" -d '{"sistema":"PortalCliente","falhar":false}'
   ```
   A saga continua **do passo 2**, sem repetir o passo 1 — é o teste de idempotência.
4. Repita o cenário e, desta vez, clique em **Reverter**: o passo 1 é compensado e o
   cliente volta a **Livre**.

### 10.5 Teste de permissão

Entre com `processos@sheepcontabil.com.br` e tente `http://localhost:3000/modulos/sc-05`:
deve cair em página não encontrada.

### 10.6 Verificação agendada

```bash
curl -X POST http://localhost:3000/api/scheduler/tick \
  -H "Authorization: Bearer $SCHEDULER_TOKEN"
```

Aponta divergência entre o estado registrado e o estado dos sistemas.

---

## 11. Checklist da seção 05

- [ ] Identificado como `SC-05` na home e na tela
- [ ] Disparo sob demanda + verificação agendada de consistência
- [ ] Histórico com data, duração, quem disparou, resultado
- [ ] Falha com mensagem legível e falha parcial **visível**, nunca silenciosa
- [ ] Saída visível: linha do tempo por execução + estado dos três sistemas
- [ ] Desfazer funcionando, pela mesma saga, em ordem inversa
- [ ] Cliente **não** é desativado no sistema de tarefas
- [ ] Perfil respeitado: só `admin`

---

## 12. O que faria com mais tempo

- Bloqueio agendado a partir do vencimento da fatura, fechando o ciclo com o financeiro.
- Aviso ao cliente antes do bloqueio, reaproveitando o `Notificador` do SC-20.
- Um quarto sistema plugado sem tocar no executor, para provar que a saga é dado.
