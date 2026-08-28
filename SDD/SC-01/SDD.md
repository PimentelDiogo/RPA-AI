# SC-01 — Conversão de extrato bancário para OFX

> **Natureza:** Agente de IA · **Complexidade:** Alta · **Frequência:** Mensal
> **Setor:** Contábil · **Medição do mapeamento interno:** 110 h/mês
> **Estado:** implementado e no ar em https://rpa-ai.vercel.app/modulos/sc-01 — o caminho determinístico está completo; a leitura assistida por IA entra numa branch própria

---

## 1. O que o enunciado diz

**Hoje.** Os extratos que os clientes mandam chegam em PDF ou em foto, e o sistema
contábil só importa OFX. Alguém abre arquivo por arquivo e transcreve os lançamentos à mão.

**Onde dói.** São cerca de 200 extratos por mês, e 80 deles são grandes o bastante para
consumir uma hora cada. O setor gasta 110 horas por mês só nessa transcrição.

**Esperado.** O portal recebe o arquivo, identifica os lançamentos com data, histórico e
valor, gera um OFX válido para download, e mostra à parte o que não conseguiu ler com
confiança, para alguém conferir antes de importar.

**Atenção.** *Cada banco imprime o extrato de um jeito. Solução que só funciona com um
layout resolve pouco. Pense em como aceitar um formato novo sem reescrever tudo.*

### Por que este processo entra no escopo

110 h/mês é o maior consumo isolado do mapeamento inteiro — mais que o dobro do segundo
colocado. É o carro-chefe da demonstração e o único dos quatro em que a IA tem papel de
runtime, não de ferramenta de desenvolvimento.

---

## 2. As duas armadilhas

**A que o enunciado marca:** cada banco imprime de um jeito. A resposta é um **registry
de parsers**: aceitar um banco novo é acrescentar um arquivo, não mexer no módulo.

**A que o enunciado implica:** *"mostra à parte o que não conseguiu ler com confiança"*.
Um extrato lido errado e importado em silêncio é pior do que um extrato não lido —
o erro entra na contabilidade e só aparece na conciliação. Por isso todo lançamento
carrega um **score de confiança**, e o que não é alto vai para uma **fila de conferência**
antes de virar OFX.

---

## 3. Suposições

| # | Suposição | Porque |
|---|-----------|--------|
| 1 | O extrato chega em PDF (texto nativo ou escaneado) ou imagem, um arquivo por conta e por competência | O enunciado diz "PDF ou foto"; um arquivo por conta/mês é como a contabilidade organiza |
| 2 | Cada lançamento tem data, histórico e valor; o sinal indica crédito ou débito | É literalmente o que o enunciado lista |
| 3 | O extrato traz saldo inicial e saldo final | É o que permite validar a extração sem acesso ao banco — e sem isso não há como afirmar que a leitura fechou |
| 4 | O OFX gerado segue **OFX 1.0.2 (SGML)** | É a versão que sistemas contábeis brasileiros importam; o enunciado só diz "OFX válido" |
| 5 | Banco, agência e conta saem do cabeçalho do extrato; se não saírem, o operador informa no upload | O OFX exige esses campos e nem todo layout os imprime por extenso |
| 6 | A competência é o mês do próprio extrato | Lançamento fora dela é sinal de leitura errada, não de exceção contábil |
| 7 | Sem `ANTHROPIC_API_KEY`, o módulo opera só com os parsers determinísticos | O portal precisa funcionar para quem avalia mesmo sem a chave |

---

## 4. Arquitetura

### Caminho determinístico primeiro, IA depois

```
upload → FileStorage
      → extração de texto (unpdf/pdfjs)
      → registry: algum parser reconhece este layout?
            sim → parser determinístico   (confiança ALTA)
            não → Claude claude-opus-5    (confiança MÉDIA)
      → validação determinística (a mesma para os dois caminhos)
      → alta confiança  → entra no OFX
        média/baixa     → fila de conferência
      → gerador OFX → Artefato para download
```

A IA **não decide sozinha**: o que ela devolve passa pela mesma validação que a saída do
parser. O que valida é código, não modelo.

### Registry de parsers — a resposta à armadilha

```ts
interface BankStatementParser {
  banco: string;                    // "Banco do Brasil", "Itaú", "Nubank"
  detect(texto: string): boolean;   // reconhece o layout
  parse(texto: string): Lancamento[];
}
```

Cada banco é um arquivo em `src/modules/sc-01/parsers/`, registrado numa lista. Aceitar
um banco novo = criar o arquivo e acrescentar uma linha. Nenhum `if (banco === ...)`
espalhado pelo módulo. Na apresentação, esta é a peça a apontar.

### Fronteiras mockadas — onde entraria o real

| Port | Adapter desta entrega | O que entraria no lugar |
|------|----------------------|-------------------------|
| `FileStorage` | Disco local em dev, Vercel Blob em produção | S3 ou o gerenciador de documentos do escritório |
| `AccountingSystem.importar(ofx)` | Registra o envio e mostra no portal | A API ou pasta de importação do sistema contábil |
| Extração por IA | Claude `claude-opus-5` com o PDF como content block `document` e saída estruturada por schema | Continua sendo o real — é a única IA de runtime do projeto |

### O que não pode ser falso

Os parsers, o score de confiança, a validação (soma × saldo, competência, sinal), a
regra da fila de conferência e a geração do OFX. É onde ficam os testes.

---

## 5. Modelo de dados

```
ExtratoImportado
  id, clienteId → Cliente, execucaoId → Execucao
  arquivoNome, arquivoCaminho (FileStorage), arquivoHash
  banco, agencia, conta
  competenciaInicio, competenciaFim
  saldoInicial, saldoFinal          decimal(14,2)
  origemLeitura   PARSER | IA
  parserUsado     texto quando origemLeitura = PARSER

Lancamento
  id, extratoId → ExtratoImportado
  data          date
  historico     texto
  valor         decimal(14,2)       negativo = débito
  confianca     ALTA | MEDIA | BAIXA
  motivoConferencia texto           por que caiu na fila
  conferido     boolean
  conferidoPorId → Usuario
```

`arquivoHash` existe para reconhecer reenvio do mesmo arquivo e não duplicar lançamento.

---

## 6. Fluxo de execução

1. **Upload** do PDF/imagem na tela do módulo, escolhendo o cliente.
2. **Armazena** via `FileStorage` e calcula o hash.
3. **Extrai texto**. PDF sem texto (escaneado) pula direto para a IA.
4. **Detecta o layout** no registry. Achou → parser; não achou → Claude com schema.
5. **Valida**, igual para os dois caminhos:
   - `saldoInicial + Σ lançamentos == saldoFinal` — se não fecha, **nada** vira OFX e a
     execução aponta a diferença;
   - toda data dentro da competência;
   - valor com sinal e histórico não vazio.
6. **Pontua a confiança** por lançamento: parser = ALTA; IA = MÉDIA; campo ausente,
   data fora da competência ou valor ambíguo = BAIXA.
7. **Separa**: ALTA vai para o OFX; MÉDIA e BAIXA vão para a fila de conferência, com o
   motivo escrito.
8. **Gera o OFX** e grava como `Artefato` para download.
9. **Registra um item por lançamento conferível**, para o histórico mostrar o que ficou
   pendente.

Resumo: `"Itaú · 142 lançamentos · 9 em conferência · OFX gerado"`.

### Tratamento de erro

| Situação | Comportamento |
|----------|---------------|
| PDF ilegível ou protegido | `ErroDeNegocio`: *"Não foi possível ler o arquivo. Ele pode estar protegido por senha."* |
| Nenhum parser reconhece e não há `ANTHROPIC_API_KEY` | `ErroDeNegocio` explicando que o layout é novo e a leitura assistida está desligada |
| Soma não fecha com o saldo final | Execução `SUCESSO_PARCIAL`, **OFX não é gerado**, e a tela mostra a diferença em reais |
| IA devolve fora do schema | Repete uma vez; persistindo, tudo vai para conferência com confiança BAIXA |
| Arquivo já importado (mesmo hash) | `ErroDeNegocio` apontando a importação anterior |

---

## 7. Agendamento

| Item | Valor |
|------|-------|
| Disparo principal | **Sob demanda** — o processo começa quando um arquivo chega |
| Cron | `0 9 * * *`: varre a fila de arquivos recebidos e ainda não processados |

Uma automação que só roda com o arquivo que alguém baixou uma vez não é automação — daí
a fila.

---

## 8. Saída visível no portal

Tela `/modulos/sc-01`:

1. **Upload** com seleção de cliente.
2. **Prévia dos lançamentos** em tabela — data, histórico, valor (coluna monoespaçada,
   como a marca exige para número) e a confiança.
3. **Fila de conferência**, separada e em âmbar, com o motivo de cada item e a ação de
   aprovar ou corrigir.
4. **Download do OFX** e o registro do envio ao sistema contábil.
5. Histórico de execuções do módulo.

### Permissão

Área `CONTABIL`. Enxergam: `admin` e o operador Contábil.

---

## 9. Massa sintética

Extratos gerados por nós, em PDF, cobrindo:

| Caso | Para demonstrar |
|------|-----------------|
| Dois layouts diferentes com parser | O registry funcionando |
| Um layout sem parser | O caminho da IA |
| Um extrato escaneado (imagem) | O fallback de PDF sem texto |
| Um extrato com lançamento ambíguo | A fila de conferência |
| Um extrato cuja soma não fecha | A validação recusando gerar OFX |

---

## 10. Como rodar e testar

### 10.1 Preparar

```bash
cp .env.example .env
# opcional: ANTHROPIC_API_KEY=... para exercitar o caminho de IA
npm install && npm run db:up && npm run db:migrate && npm run db:seed
npm run dev
```

### 10.2 Teste automatizado

```bash
npx vitest run tests/sc-01-parsers.test.ts     # cada parser contra o extrato de exemplo
npx vitest run tests/sc-01-validacao.test.ts   # soma × saldo, competência, sinal
npx vitest run tests/sc-01-ofx.test.ts         # OFX gerado bate com o esperado
npx vitest run tests/sc-01-confianca.test.ts   # o que vai e o que não vai para conferência
```

Os testes de parser e OFX rodam sobre arquivos versionados em `tests/fixtures/sc-01/`,
sem rede e sem chave de IA.

### 10.3 Teste manual pelo portal

1. Entre com `contabil@sheepcontabil.com.br` / `sheep2026`.
2. Abra **SC-01** e envie `tests/fixtures/sc-01/itau-competencia-completa.pdf`.
3. Confira: os lançamentos aparecem na prévia, todos com confiança **Alta** (parser
   determinístico), e o OFX fica disponível para download.
4. Baixe o OFX e confira que abre num leitor/validador: cabeçalho `OFXHEADER`, um
   `<STMTTRN>` por lançamento, valores com sinal.
5. Envie `nubank-layout-novo.pdf`, para o qual **não existe parser**. Com chave de IA
   configurada, os lançamentos vêm com confiança **Média** e caem na fila de conferência.
   Sem chave, a execução falha com mensagem legível — que também é um resultado correto.
6. Envie `banco-generico-soma-nao-fecha.pdf`. A execução deve terminar em **Sucesso
   parcial**, **não** gerar OFX, e mostrar a diferença em reais.
7. Envie o mesmo arquivo do passo 2 de novo: deve ser recusado por duplicidade.
8. Aprove um item da fila de conferência e verifique que ele passa a compor o OFX.

### 10.4 Provar a resposta à armadilha

O ponto mais defensável da demonstração:

```bash
# 1. Copie um parser existente como ponto de partida
cp src/modules/sc-01/parsers/itau.ts src/modules/sc-01/parsers/banco-novo.ts
# 2. Ajuste detect() e parse() para o layout novo
# 3. Registre-o na lista em src/modules/sc-01/parsers/index.ts
```

Nenhum outro arquivo do módulo muda. É isto que se aponta na apresentação.

---

## 11. Checklist da seção 05

- [ ] Identificado como `SC-01` na home e na tela
- [ ] Disparo sob demanda (upload) e varredura agendada da fila
- [ ] Histórico com data, duração, quem disparou, resultado
- [ ] Falha com mensagem legível
- [ ] Saída visível: prévia, fila de conferência e OFX para download
- [ ] Perfil respeitado: `admin` e Contábil
- [ ] Uso de IA declarado em `docs/USO-DE-IA.md`

---

## 12. O que faria com mais tempo

- OCR próprio antes da IA para extrato escaneado, baratear o caminho caro.
- Aprender com a conferência: correção feita vira regra do parser.
- Conciliação contra os lançamentos já existentes no sistema contábil.
