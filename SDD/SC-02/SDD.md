# SC-02 — Painel de situação fiscal dos clientes

> **Natureza:** RPA · **Complexidade:** Alta · **Frequência:** Mensal
> **Setor:** Processos · **Medição do mapeamento interno:** 54 h/mês
> **Estado:** implementado e no ar em https://rpa-ai.vercel.app/modulos/sc-02 — o adapter Playwright entra numa branch própria

---

## 1. O que o enunciado diz

**Hoje.** Para saber se um cliente está regular, alguém entra num órgão por vez, consulta
e anota o resultado numa planilha. São vários órgãos por cliente, o FGTS entre eles.

**Onde dói.** 54 horas por mês, o maior consumo isolado depois dos extratos. E a planilha
nasce vencida: no dia seguinte já não vale, porque a situação muda sem avisar.

**Esperado.** Consulta agendada, resultado gravado com data e origem, e um painel que
responde de relance quem está irregular, em qual órgão e há quanto tempo.

**Atenção.** *Consulta que falhou não pode sumir. Guarde a tentativa, o erro e a hora,
senão ninguém sabe se o cliente está regular ou se o robô não conseguiu perguntar.*

### Por que este processo entra no escopo

Segunda maior dor do mapeamento, e o módulo que mais exercita o que o enunciado diz
avaliar em "falha com dignidade": fila, retry, timeout, sessão que expira, portal fora
do ar. É o RPA de verdade da entrega.

---

## 2. A armadilha define o modelo de dados

"Consulta que falhou não pode sumir" não é um detalhe de log — é a razão de existirem
**duas tabelas** em vez de uma:

| | |
|---|---|
| `SituacaoFiscal` | A última leitura **bem-sucedida**: qual era a situação, quando, de que origem |
| `ConsultaTentativa` | **Toda** tentativa: a que deu certo e a que falhou, com hora, erro e resposta bruta |

Se houvesse uma tabela só, uma consulta que falhou sobrescreveria — ou preservaria — a
situação anterior sem que ninguém soubesse qual dos dois aconteceu. Com duas, o painel
distingue três estados que **não** podem ser confundidos:

- **Regular** — perguntamos e está tudo certo.
- **Irregular** — perguntamos e há pendência.
- **Não sabemos** — não conseguimos perguntar. Aparece em faixa própria, nunca
  disfarçado de "regular".

E, porque a planilha de hoje "nasce vencida", o painel sempre mostra **a idade do dado**:
*"regular, verificado há 2 dias"* diz mais do que "regular".

---

## 3. Suposições

| # | Suposição | Porque |
|---|-----------|--------|
| 1 | Os órgãos consultados são Receita Federal, FGTS/Caixa, Previdência e Fazenda Estadual | O enunciado cita "vários órgãos, o FGTS entre eles" e não lista o resto |
| 2 | A situação de cada órgão é REGULAR, IRREGULAR ou INDISPONIVEL | É a leitura mínima que o painel precisa; certidão positiva com efeito de negativa entra como REGULAR com observação |
| 3 | A consulta é por CNPJ, sem certificado digital | Nenhum acesso real é concedido; o adapter real exigiria o certificado, e o ponto fica marcado no código |
| 4 | Cada órgão é consultado uma vez por dia por cliente | Mais que isso é bater no portal à toa; menos, e a informação envelhece |
| 5 | Falha de consulta é retentada 3 vezes com backoff exponencial | Portal de órgão cai e volta; desistir na primeira tentativa geraria "não sabemos" demais |
| 6 | Concorrência limitada a 4 consultas simultâneas | Portal de órgão real derruba quem martela — a limitação faz parte de reproduzir o problema |

---

## 4. Arquitetura

### Fronteira mockada — onde entraria o real

| Port | Contrato | Adapters | Observação |
|------|----------|----------|------------|
| `ConsultaOrgao` | `consultar(cliente, orgao): Promise<Situacao>` | `orgao-http` e `orgao-playwright` | **A credencial e o certificado digital entram aqui** |

**Órgãos simulados servidos pelo próprio repositório** em `/api/fake/orgaos/*`: páginas
HTML com formulário, que reproduzem o mundo real de propósito — latência variável,
timeout, indisponibilidade e sessão que expira, injetados por seed determinístico (mesmo
cliente, mesmo comportamento, para a demonstração ser repetível).

| Adapter | Onde roda | Papel |
|---------|-----------|-------|
| `orgao-http` | Produção, na URL pública | Cliente HTTP contra o portal-fake. É o que a Vercel executa |
| `orgao-playwright` | Local e CI | **Playwright de verdade** navegando o portal-fake: preenche o formulário, espera a página, lê o resultado. É a peça que mostra "aqui entra o portal do órgão de verdade" |

Dois adapters porque a Vercel não roda navegador — mas um RPA que nunca dirigiu um
navegador não é RPA. O Playwright roda no CI e na demonstração local.

### O que não pode ser falso

A fila, o retry com backoff, o limite de concorrência, a persistência de toda tentativa,
a distinção entre irregular e não-consultado, e o cálculo da idade do dado.

---

## 5. Modelo de dados

```
OrgaoConsultado                     enum: RECEITA_FEDERAL | FGTS | PREVIDENCIA | FAZENDA_ESTADUAL
SituacaoApurada                     enum: REGULAR | IRREGULAR | INDISPONIVEL

SituacaoFiscal                      ← última leitura bem-sucedida
  id, clienteId → Cliente, orgao
  situacao, detalhe
  apuradaEm      datetime
  origem         HTTP | PLAYWRIGHT   como foi obtida
  @@unique([clienteId, orgao])

ConsultaTentativa                   ← toda tentativa, inclusive as que falharam
  id, clienteId → Cliente, orgao
  execucaoId → Execucao
  tentativa      int                1, 2, 3
  sucesso        boolean
  situacao       SituacaoApurada?
  erro           texto              mensagem legível
  respostaBruta  texto              o que o órgão devolveu
  duracaoMs, iniciadaEm
  @@index([clienteId, orgao, iniciadaEm desc])
```

`SituacaoFiscal` **nunca** é apagada por uma falha: uma consulta que não deu certo
acrescenta linha em `ConsultaTentativa` e deixa a situação anterior intacta, agora com
a idade visível.

---

## 6. Fluxo de execução

1. **Monta a fila** com o produto cliente × órgão dos clientes ativos.
2. **Processa com concorrência 4**, respeitando o limite.
3. Para cada par, até 3 tentativas com backoff (1s, 4s, 16s):
   - **Sucesso** → grava `ConsultaTentativa` com `sucesso = true`, atualiza
     `SituacaoFiscal`, item `SUCESSO`;
   - **Falha** → grava a tentativa com o erro e tenta de novo;
   - **Esgotou** → item `FALHA` com mensagem legível. A situação anterior permanece.
4. Resumo: `"48 consultas · 41 regulares · 4 irregulares · 3 sem resposta"`.

A rodada com qualquer falha termina em `SUCESSO_PARCIAL` — nunca `SUCESSO`.

### Tratamento de erro

| Situação simulada pelo portal-fake | Mensagem ao operador |
|---|---|
| Timeout | *"O portal do FGTS não respondeu no tempo esperado. A última situação conhecida é de 12/08."* |
| Indisponível (HTTP 503) | *"O portal da Receita Federal está fora do ar."* |
| Sessão expirada | *"A sessão no portal expirou durante a consulta."* |
| Resposta em formato inesperado | *"O portal respondeu num formato que não reconhecemos."* — com a resposta bruta salva |

---

## 7. Agendamento

| Item | Valor |
|------|-------|
| Cron | `0 6 * * *` (todo dia às 6h, `America/Sao_Paulo`) |
| Disparo manual | **Executar agora** para todos, ou por cliente |

Diário, e não mensal, porque o enunciado diz que "a planilha nasce vencida: no dia
seguinte já não vale". Corrigir isso é o ponto do módulo.

---

## 8. Saída visível no portal

Tela `/modulos/sc-02`:

1. **Faixa de resumo** — quantos regulares, irregulares e **sem resposta**.
2. **Quem está irregular** — cliente, órgão, desde quando, há quantos dias. Ordenado
   pelo mais antigo: quem está irregular há mais tempo aparece primeiro.
3. **Faixa "não conseguimos consultar"** — em âmbar, com o último erro e a hora.
   Esta faixa **não some** e não se confunde com irregularidade.
4. **Grade cliente × órgão**, com a idade de cada leitura.
5. Histórico de execuções e de tentativas por cliente.

### Permissão

Área `PROCESSOS`. Enxergam: `admin` e o operador de Processos.

---

## 9. Como rodar e testar

### 9.1 Preparar

```bash
cp .env.example .env
npm install && npm run db:up && npm run db:migrate && npm run db:seed
npm run dev
```

O portal-fake dos órgãos sobe junto com a aplicação, em
`http://localhost:3000/api/fake/orgaos`. Pode abrir no navegador: é uma página HTML com
formulário, de propósito.

### 9.2 Teste automatizado

```bash
npx vitest run tests/sc-02-fila.test.ts        # retry, backoff, limite de concorrência
npx vitest run tests/sc-02-situacao.test.ts    # falha não sobrescreve a última leitura boa
npx vitest run tests/sc-02-painel.test.ts      # irregular ≠ não-consultado; idade do dado
```

### 9.3 Teste do RPA com navegador

```bash
npx playwright test tests/e2e/sc-02-orgao.spec.ts
```

Abre um navegador de verdade, navega o portal-fake, preenche o CNPJ, submete e lê o
resultado. Rode com `--headed` para assistir — é o que se mostra na apresentação.

### 9.4 Teste manual pelo portal

1. Entre com `processos@sheepcontabil.com.br` / `sheep2026` e abra **SC-02**.
2. O painel já vem com dado do seed. Confira as três faixas: regulares, irregulares e
   **sem resposta**.
3. Clique em **Executar agora** e acompanhe: a fila processa 4 por vez.
4. Ao terminar, verifique:
   - Clientes irregulares listados com órgão e **há quantos dias**;
   - A faixa "não conseguimos consultar" com o erro legível de cada um — o portal-fake
     derruba algumas consultas de propósito;
   - A execução terminou em **Sucesso parcial**.
5. **O teste da armadilha:** escolha um cliente que estava **regular** e cuja consulta
   falhou nesta rodada. Confira que:
   - Ele **não** aparece como irregular;
   - A situação anterior continua visível, com a idade em dias;
   - A tentativa que falhou está registrada com hora e erro.
6. Abra o detalhe de um cliente e veja o histórico de tentativas: as que deram certo e
   as que não, em ordem.

### 9.5 Forçar uma falha específica

O portal-fake aceita instrução por query, para a demonstração não depender de sorte:

```bash
curl "http://localhost:3000/api/fake/orgaos/fgts?cnpj=41688555000155&simular=timeout"
curl "http://localhost:3000/api/fake/orgaos/receita?cnpj=41688555000155&simular=indisponivel"
curl "http://localhost:3000/api/fake/orgaos/receita?cnpj=41688555000155&simular=sessao-expirada"
```

### 9.6 Teste do disparo agendado

```bash
curl -X POST http://localhost:3000/api/scheduler/tick \
  -H "Authorization: Bearer $SCHEDULER_TOKEN"
```

---

## 10. Checklist da seção 05

- [ ] Identificado como `SC-02` na home e na tela
- [ ] Disparo sob demanda e agendado
- [ ] Histórico com data, duração, quem disparou, resultado
- [ ] Falha com mensagem legível, e **nenhuma consulta que falhou some**
- [ ] Saída visível: painel de irregulares + faixa de falhas + grade
- [ ] Perfil respeitado: `admin` e Processos

---

## 11. O que faria com mais tempo

- Histórico de situação por cliente ao longo do tempo, para ver quem vive irregular.
- Alerta quando um cliente **muda** de regular para irregular, reaproveitando a régua
  de avisos do SC-20.
- Certidão em PDF anexada à leitura, como prova documental.
