# SC-20 — Vencimento de certificado digital

> **Natureza:** Controle sistematizado · **Complexidade:** Baixa · **Frequência:** Mensal
> **Setor:** Processos · **Medição do mapeamento interno:** 2 h/mês
> **Estado:** implementado e no ar em https://rpa-ai.vercel.app/modulos/sc-20

---

## 1. O que o enunciado diz

Transcrição da seção 08 do PDF. É tudo o que existe: não há acesso a sistema, base ou
pessoa para entrevistar.

**Hoje.** O vencimento dos certificados digitais dos clientes é acompanhado numa
planilha, revisada uma vez por mês.

**Onde dói.** Certificado vencido trava tudo o que depende dele: transmitir obrigação,
acessar portal de órgão, emitir nota. E a renovação não é imediata, porque depende do
cliente agir.

**Esperado.** Base de certificados por cliente com data de validade, painel do que vence
nos próximos 60 dias e aviso com antecedência para quem precisa acionar o cliente.

**Atenção.** *Aviso repetido vira ruído e para de ser lido. Registre o que já foi
comunicado e a quem, e mostre o que mudou desde o último aviso em vez de repetir a lista
inteira.*

### Por que este processo entra no escopo

É o mais barato dos quatro em esforço e o único **controle sistematizado** —
fecha a terceira natureza, deixando a entrega com 3 de 3 quando o mínimo exigido eram 2.
E a armadilha dele (aviso repetido vira ruído) é uma regra de negócio de verdade, não
enfeite: obriga a guardar estado entre execuções, que é o que separa um alerta útil de
um e-mail que ninguém abre.

---

## 2. A armadilha é o requisito central

O painel de 60 dias é a parte fácil. O que este módulo precisa provar é a **régua de
avisos**:

- Toda comunicação fica registrada: qual certificado, para quem, quando, com que conteúdo.
- A execução seguinte **não repete** o que já foi dito. Se nada mudou para aquele
  certificado, o aviso é **suprimido** — e a supressão também fica registrada, senão
  ninguém sabe se o sistema calou por decisão ou por falha.
- O que aparece é **o que mudou desde o último aviso**: certificado novo na janela,
  certificado que trocou de faixa (de ≤60 para ≤30, por exemplo) e certificado que
  venceu.

O gatilho de novo aviso é a **mudança de faixa**, não a passagem do tempo. Um
certificado que ontem estava a 45 dias e hoje está a 44 não gera nada; quando cruzar
para ≤30, gera.

---

## 3. Suposições

Registradas também em [`../../docs/SUPOSICOES.md`](../../docs/SUPOSICOES.md).

| # | Suposição | Porque |
|---|-----------|--------|
| 1 | O certificado pertence a um cliente e tem titular, tipo (A1/A3), emissor e data de validade | É o conjunto mínimo que a planilha descrita no enunciado teria; sem titular não dá para saber quem renova |
| 2 | A janela de alerta padrão é de 60 dias, mas é **configurável** | O enunciado cita 60 dias no painel; a régua de aviso diz "com antecedência" sem fixar prazo |
| 3 | As faixas são: vencido, ≤15, ≤30, ≤60 dias | O enunciado pede o painel de 60 dias e "quanto tempo resta"; faixas dão a leitura de relance que ele cobra |
| 4 | O destinatário do aviso é um contato interno da SheepContabil, não o cliente final | O enunciado diz "aviso para **quem precisa acionar o cliente**" — o alvo é interno |
| 5 | A verificação roda diariamente, mesmo o catálogo dizendo "mensal" | Mensal é a frequência da revisão manual de hoje, que é exatamente o problema: um certificado que vence no dia 3 não pode esperar a revisão do dia 30 |
| 6 | Nenhuma mensagem sai da aplicação | Regra R6 do projeto: nenhum acesso real. O envio é gravado e exibido, não transmitido |

---

## 4. Arquitetura

### Fronteira mockada — onde entraria o real

| Port | Contrato | Adapter desta entrega | O que entraria no lugar |
|------|----------|----------------------|-------------------------|
| `Notificador` | `enviar(mensagem): Promise<Recibo>` | `notificador-outbox`: grava a mensagem no banco e a exibe no portal | Provedor de e-mail (SES, Resend) ou API de WhatsApp. **A credencial entra aqui**, em variável de ambiente, e o resto do módulo não muda |

Não há outra fronteira: a base de certificados é do próprio portal. É por isso que este
módulo é o mais barato dos quatro — e por isso ele é o primeiro.

### O que não pode ser falso

O cálculo de dias restantes, a classificação em faixa, a decisão de avisar ou suprimir e
o registro do que foi comunicado. É onde ficam os testes.

---

## 5. Modelo de dados

Acrescenta ao schema do núcleo (`prisma/schema.prisma`):

```
Certificado
  id, clienteId → Cliente
  titular        nome de quem responde pelo certificado
  tipo           A1 | A3
  emissor        texto (Serasa, Certisign, Valid, Soluti…)
  validade       date
  observacao     texto opcional
  ativo          boolean   (certificado substituído fica inativo, não sumido)

ContatoAviso
  id, clienteId → Cliente
  nome, email
  ativo

AvisoCertificado                    ← a régua
  id, certificadoId → Certificado
  contatoId       → ContatoAviso
  execucaoId      → Execucao        rastreia qual rodada gerou
  faixa           VENCIDO | ATE_15 | ATE_30 | ATE_60
  diasRestantes   int               congelado no momento do aviso
  conteudo        texto             a mensagem exata que foi (ou seria) enviada
  enviadoEm       datetime
  suprimido       boolean           true quando a régua decidiu não repetir
  motivoSupressao texto opcional
```

Índice em `(certificadoId, enviadoEm desc)`: a régua consulta o último aviso de cada
certificado a cada rodada, e é a consulta mais quente do módulo.

**Por que `faixa` fica gravada no aviso:** é ela que a próxima execução compara. Guardar
só a data do último aviso não responde "mudou alguma coisa?"; guardar a faixa responde.

---

## 6. Fluxo de execução

O handler recebe o `ContextoExecucao` do motor e faz, para cada certificado ativo:

1. **Calcula** dias restantes = `validade − hoje`, no fuso `America/Sao_Paulo`.
2. **Classifica** em faixa. Fora da janela configurada (> 60 dias) → não é item, é
   ignorado silenciosamente.
3. **Busca o último aviso** daquele certificado.
4. **Decide**:
   - Sem aviso anterior e dentro da janela → **avisa** (item `SUCESSO`).
   - Faixa mudou desde o último aviso → **avisa** (item `SUCESSO`).
   - Faixa igual à do último aviso → **suprime**, grava `suprimido = true` com o motivo
     (item `IGNORADO`, para aparecer no histórico sem poluir).
5. **Monta a mensagem** e chama o `Notificador`, que grava no outbox.
6. **Registra o item** com a referência legível (`Trigo de Ouro — A1 vence em 12 dias`).

Resumo da execução, escrito para a listagem do histórico:
`"38 certificados · 4 avisos · 9 supressões"`.

### Tratamento de erro

| Situação | Comportamento |
|----------|---------------|
| Cliente sem contato de aviso cadastrado | Item `FALHA` com mensagem legível: *"Nenhum contato cadastrado para avisar sobre este certificado."* A rodada segue nos demais e termina `SUCESSO_PARCIAL` |
| Certificado com validade ausente ou inválida | Item `FALHA`, mensagem apontando o dado que falta |
| Falha do `Notificador` | Item `FALHA` com a mensagem do adapter; o aviso **não** é marcado como enviado, então a próxima rodada tenta de novo |
| Erro inesperado no meio | O motor encerra a execução como `FALHA`, mantém os itens já gravados e guarda o stack em `detalheTecnico` — a tela recebe a mensagem genérica |

---

## 7. Agendamento

| Item | Valor |
|------|-------|
| Cron | `0 8 * * *` (todo dia às 8h, `America/Sao_Paulo`) |
| Disparo manual | Botão **Executar agora** na tela do módulo |
| Como roda sozinho | Linha em `Agendamento` + `POST /api/scheduler/tick` chamado pelo cron do GitHub Actions |

A execução agendada grava `disparo = AGENDADO` e `disparadoPor = null` — no histórico
ela aparece como "Agendador", não como uma pessoa.

---

## 8. Saída visível no portal

Tela `/modulos/sc-20`, três blocos:

1. **Painel dos próximos 60 dias** — cartões por faixa com a contagem, e a tabela
   abaixo: cliente, titular, tipo, emissor, validade, **dias restantes**. Vencido em
   carmim, ≤15 e ≤30 em âmbar, ≤60 em grafite.
2. **O que mudou desde o último aviso** — a resposta direta à armadilha: só as
   entradas novas e as trocas de faixa.
3. **Histórico de avisos** — quem foi avisado, quando, de qual certificado, com o
   conteúdo da mensagem. As supressões aparecem marcadas, não escondidas.

Mais a aba de execuções do módulo, vinda do núcleo.

### Permissão

Área `PROCESSOS`. Enxergam: `admin` e o operador de Processos. O operador Contábil
recebe 404 ao tentar a URL direta — não confirmamos que o módulo existe fora da área dele.

---

## 9. Massa sintética

O seed precisa entregar o painel **com dado dentro**, cobrindo todas as faixas:

| Faixa | Quantidade | Para demonstrar |
|-------|-----------|-----------------|
| Vencido | 2 | O caso crítico, em carmim |
| ≤ 15 dias | 3 | Urgência |
| ≤ 30 dias | 4 | Faixa intermediária |
| ≤ 60 dias | 5 | Entrada na janela |
| > 60 dias | 6 | Fora da janela — provam que o filtro funciona |
| Sem contato de aviso | 1 | Provoca o item `FALHA` de propósito, para a demo mostrar erro legível |

As datas são calculadas **relativas ao dia do seed**, não fixas: o painel precisa fazer
sentido em qualquer dia que a demonstração aconteça.

Um aviso pré-existente é semeado para um dos certificados de ≤30, com a faixa antiga
`ATE_60`. Assim, a primeira execução após o seed já demonstra os três desfechos: aviso
novo, aviso por mudança de faixa e supressão.

---

## 10. Como rodar e testar

### 10.1 Preparar o ambiente

```bash
cp .env.example .env       # ajuste AUTH_SECRET: openssl rand -base64 32
npm install
npm run db:up              # Postgres em localhost:5433
npm run db:migrate
npm run db:seed
npm run dev
```

### 10.2 Teste automatizado da regra

É o que prova a armadilha. Roda sem banco e sem servidor:

```bash
npx vitest run tests/sc-20-regua.test.ts
```

Casos cobertos (14 no total, entre cálculo de prazo, classificação e régua):

| Caso | Esperado |
|------|----------|
| Certificado entra na janela pela primeira vez | Avisa |
| Mesma faixa da última rodada | Suprime, com motivo registrado |
| Faixa mudou de ≤60 para ≤30 | Avisa de novo |
| Certificado venceu desde o último aviso | Avisa, faixa `VENCIDO` |
| Certificado a 90 dias | Nem avisa nem entra no painel |
| Cliente sem contato | Item `FALHA` com mensagem legível |
| Duas execuções seguidas no mesmo dia | A segunda não gera nenhum aviso novo |

### 10.3 Teste manual pelo portal

1. Abra `http://localhost:3000` e entre com `processos@sheepcontabil.com.br` / `sheep2026`.
2. Na home, o cartão **SC-20** aparece. Clique nele.
3. Confira o **painel dos próximos 60 dias**: as faixas devem bater com a massa do
   seed (2 vencidos, 3 em ≤15, 4 em ≤30, 5 em ≤60) e os de mais de 60 dias **não**
   devem aparecer.
4. Clique em **Executar agora**.
5. Ao terminar, verifique:
   - O resumo da execução traz a contagem de avisos e supressões.
   - O bloco **"o que mudou desde o último aviso"** lista as novidades.
   - O **histórico de avisos** mostra as mensagens gravadas no outbox, com destinatário.
   - Há **um item em falha**, do certificado sem contato, com mensagem em português —
     e a execução fica como **Sucesso parcial**, não Falha nem Sucesso.
6. **Clique em Executar agora de novo, sem mudar nada.** Este é o teste da armadilha:
   a segunda rodada não pode gerar nenhum aviso novo. Todos devem sair como
   **suprimidos**, e a supressão aparece registrada.
7. Vá em **Execuções** no cabeçalho: as duas rodadas estão lá, com data, duração,
   "Marina Alencar"/seu usuário como quem disparou, e o resultado.

### 10.4 Teste do disparo agendado

Simula o cron externo, sem esperar as 8h:

```bash
curl -X POST http://localhost:3000/api/scheduler/tick \
  -H "Authorization: Bearer $SCHEDULER_TOKEN"
```

Verifique em `/execucoes` que surgiu uma execução com disparo **Agendado** e sem pessoa
associada — a coluna mostra "Agendador".

Sem o token, o endpoint responde **401**: o disparo automático não pode ser público.

### 10.5 Teste de permissão

```bash
# Entre como contabil@sheepcontabil.com.br e tente a URL direta:
http://localhost:3000/modulos/sc-20
```

Deve cair em página não encontrada — não em "acesso negado", que confirmaria a
existência do módulo.

---

## 11. Checklist da seção 05 do enunciado

- [ ] Módulo identificado pelo código `SC-20` na home e na própria tela
- [ ] Disparo sob demanda pelo portal
- [ ] Disparo agendado, sem ninguém logado
- [ ] Histórico com data, duração, quem disparou e resultado
- [ ] Falha com mensagem legível, sem stack trace na tela
- [ ] Saída visível: painel + histórico de avisos
- [ ] Perfil respeitado: só `admin` e operador de Processos
- [ ] Identidade aplicada: carmim só em falha e vencimento, âmbar em pendência

---

## 12. O que faria com mais tempo

- Anexar o arquivo do certificado (`.pfx`) ao registro, com o alerta de que a senha
  **não** deve ser guardada.
- Régua escalonada por tipo: A1 (validade de 1 ano) e A3 (até 3 anos) merecem janelas
  diferentes.
- Confirmação de leitura do aviso, fechando o ciclo "avisei" → "alguém agiu".
