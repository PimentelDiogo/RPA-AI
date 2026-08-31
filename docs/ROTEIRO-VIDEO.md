# Roteiro do vídeo — Portal de Automações SheepContabil

Cada automação é apresentada na mesma estrutura, para quem assiste conseguir
comparar as quatro:

> **1. Tecnologia** · **2. Problema** · **3. Solução** · **4. Execução**

Duração sugerida: **18 a 20 minutos**. Abertura e fechamento levam 5; cada
automação, entre 3 e 4.

---

## Antes de gravar — 10 minutos de preparação

Nada estraga mais um vídeo do que uma tela que não mostra o que devia.

- [ ] **Deixar o portal no estado "antes da primeira execução"** — um comando:

      ```bash
      DATABASE_URL="<session pooler do Supabase>" npm run demo:preparar
      # confere o que faria; para valer:
      DATABASE_URL="<session pooler do Supabase>" npm run demo:preparar -- --confirmar
      ```

      Ele mantém a massa e apaga o **resultado** dela: painel de situação fiscal
      zerado, extratos de volta à fila, nenhum aviso comunicado, todos os clientes
      livres, janela do SC-20 de volta em 60 dias e histórico de execuções limpo.
      Assim cada automação **produz mudança visível** na gravação.
- [ ] **Conferir que os três sistemas do SC-05 estão "no ar"** — o script já
      desliga as falhas, mas vale olhar.
- [ ] **Confirmar `ANTHROPIC_API_KEY` na Vercel**, se for demonstrar a leitura por
      IA no ar. Sem ela o SC-01 roda só com os parsers — o que também é uma
      demonstração honesta, mas escolha antes qual das duas vai mostrar.
- [ ] Abrir `/api/saude` numa aba e ver `"ok": true`.
- [ ] Abas prontas, na ordem: portal · repositório · GitHub Actions · Supabase.
- [ ] Fechar notificações e deixar o zoom do navegador em 110–125%.

---

## Abertura — 2 min

**O caso.** Escritório contábil de porte médio, 12 setores. Um mapeamento
interno cronometrou o que dava para cronometrar: conversão de extrato consome
**110 horas por mês**, painel de situação fiscal **54**, bloqueio de
inadimplentes **11**.

**A escolha.** Quatro processos, cobrindo **as três naturezas** que o desafio
define — o mínimo pedido eram duas:

| | Processo | Natureza | Dor |
|---|---|---|---|
| SC-01 | Extrato bancário → OFX | Agente de IA | 110 h/mês |
| SC-02 | Painel de situação fiscal | RPA | 54 h/mês |
| SC-05 | Bloqueio de inadimplentes | RPA | 11 h/mês |
| SC-20 | Vencimento de certificado | Controle sistematizado | 2 h/mês |

**A frase para dizer:** *"Escolhi pelo tamanho da dor, não pela facilidade. Os
dois maiores consumos de hora do mapeamento inteiro estão aqui."*

**A condição.** Nenhum acesso real foi concedido — nem sistema, nem base, nem
portal de órgão. Então toda fronteira externa é uma interface com implementação
falsa, e **toda massa de dados é sintética**. Mostrar a home com os quatro
módulos e trocar de usuário:

- `admin@sheepcontabil.com.br` → quatro módulos
- `processos@sheepcontabil.com.br` → dois, e a tela diz *"2 módulos disponíveis
  para o seu perfil"*

> Com o operador logado, digite `/modulos/sc-01` na barra de endereço: **404**.
> *"Não é a tela escondendo. E é 404, não 'acesso negado' — dizer 'sem
> permissão' já confirmaria que o módulo existe."*

---

## A tecnologia, uma vez só — 2 min

Vale explicar a base **antes** dos módulos, porque os quatro se apoiam nela e
isso evita repetir quatro vezes.

| Camada | Escolha | Por quê |
|---|---|---|
| Portal | **Next.js 16 + TypeScript** | Telas, execução e endpoints num deploy só; a mesma linguagem da borda ao banco |
| Banco | **PostgreSQL + Prisma 7** | Migrations versionadas; ambiente reproduzível por quem clonar |
| Sessão | **Auth.js**, senha em **argon2id**, cookie httpOnly | Autenticação real, com perfis decididos no servidor |
| Hospedagem | **Vercel** (região São Paulo) + **Supabase** | URL pública estável, deploy automático a partir de `main` |
| Agendador | Cron do **GitHub Actions** → `POST /api/scheduler/tick` | Serverless não tem processo em segundo plano; o relógio mora fora, e aparece no repositório como infraestrutura |
| IA | **`claude-opus-5`** via `@anthropic-ai/sdk` | Só no SC-01, e só como exceção |
| Testes | **Vitest** + **Playwright** | 116 testes sobre a regra de negócio |

**A ideia que sustenta tudo:** *"Existe um núcleo comum — Execução → Item →
Artefato. Cada automação implementa só o seu handler; histórico, duração,
autoria, tratamento de erro e agendamento vêm de graça. É isso que faz quatro
automações diferentes se comportarem como um portal só, em vez de quatro
scripts com telas parecidas."*

---

## SC-20 — Vencimento de certificado digital · 3 min

*Comece por este: é o mais simples de entender e tem a demonstração mais forte.*

### 1. Tecnologia
Controle sistematizado. Base no Postgres, régua de avisos em código puro,
`Notificador` como interface com adapter **outbox** — a mensagem é gravada e
exibida, **não sai para lugar nenhum**.

### 2. Problema
O vencimento dos certificados é acompanhado numa planilha revista uma vez por
mês. Certificado vencido trava tudo o que depende dele: transmitir obrigação,
acessar portal de órgão, emitir nota. E a renovação depende do cliente agir.

> **A armadilha que o mapeamento registrou:** *"aviso repetido vira ruído e para
> de ser lido."*

### 3. Solução
Painel dos próximos 60 dias por faixa, com **dias restantes** — não só a data. E
uma régua em que **o gatilho é mudança de faixa, não passagem de tempo**: 45 para
44 dias não comunica nada; cruzar para ≤30 comunica. O que não mudou é
**suprimido**, e a supressão fica registrada — senão ninguém sabe se o sistema
calou por decisão ou por falha.

### 4. Execução — o que fazer na tela

1. Abrir o painel: as faixas (vencido / ≤15 / ≤30 / ≤60) e a tabela com dias restantes.
2. Mostrar o bloco **"O que mudou desde o último aviso"**.
3. Clicar em **Executar agora**. O botão conta os segundos e abre o diálogo com o resumo.
4. **Clicar em Executar agora de novo.** *"Nada mudou desde a rodada anterior."*
   → **0 avisos, N supressões**, cada uma com o motivo.
5. Abrir o histórico de avisos e mostrar o **texto exato** da mensagem e as
   supressões marcadas.

> **A frase:** *"A segunda rodada não comunicar nada é o comportamento correto.
> Se avisasse de novo, seria o defeito."*

---

## SC-02 — Painel de situação fiscal · 4 min

### 1. Tecnologia
RPA. Port `ConsultaOrgao` com **dois adapters**: um cliente HTTP que raspa a
página (roda na nuvem) e o **Playwright**, que dirige um navegador de verdade.
Os portais dos órgãos são simulados pelo próprio projeto, com falhas injetadas
de forma determinística.

### 2. Problema
Para saber se um cliente está regular, alguém entra num órgão por vez, consulta
e anota numa planilha. São vários órgãos por cliente. **54 horas por mês** — e a
planilha nasce vencida: no dia seguinte já não vale.

> **A armadilha:** *"consulta que falhou não pode sumir. Guarde a tentativa, o
> erro e a hora, senão ninguém sabe se o cliente está irregular ou se o robô não
> conseguiu perguntar."*

### 3. Solução
**Duas tabelas, não uma.** `situacao_fiscal` guarda a última leitura
**bem-sucedida**; `consulta_tentativa` guarda **todas** as tentativas, com hora,
erro e a resposta bruta do órgão. Falha nunca sobrescreve o que se sabia.

Com isso o painel distingue três estados que não podem se confundir: **regular**,
**irregular** e **"não conseguimos perguntar"** — este em faixa própria. E toda
leitura mostra a **idade do dado**: *"regular há 2 dias"* diz mais que *"regular"*.

### 4. Execução — o que fazer na tela

1. Painel com os cartões: regulares, irregulares, **sem resposta**, nunca consultados.
2. Lista de irregulares, ordenada pelo mais antigo — *"quem está irregular há mais tempo aparece primeiro, porque é onde dói"*.
3. Faixa **"Não conseguimos consultar"**: o erro legível de cada um, e o que ainda se sabe.
4. **Consultar agora** — leva ~10 segundos e faz 48 consultas com retry e limite de concorrência.
5. Mostrar as **tentativas registradas**: o mesmo par com tentativa 1 e 2, uma falhando e outra dando certo.

**O momento do banco** — o único do vídeo. Abrir o Supabase:

> *"Toda tentativa está aqui, com hora e erro. E na outra tabela, a última
> leitura boa, intacta. São duas tabelas porque, com uma só, ninguém saberia se
> o cliente está irregular ou se o robô não conseguiu perguntar."*

**O RPA acontecendo** — rodar na sua máquina:

```bash
npm run rpa:sc-02 -- --ver
```

O navegador abre, digita o CNPJ, clica em consultar. E a **captura da tela do
portal** fica anexada à execução no portal público.

> *"Aqui deixa de ser 'o robô diz que consultou'. Esta é a página que ele viu."*

---

## SC-05 — Bloqueio e desbloqueio de inadimplentes · 4 min

### 1. Tecnologia
RPA com orquestração em **saga**: passos idempotentes, cada um com o seu
`compensar()`, e a sequência declarada como dado. Três sistemas simulados, cada
um com estado próprio visível na tela.

### 2. Problema
Cliente fica inadimplente, alguém repete a mesma sequência em vários sistemas
que não se integram, um de cada vez. Dez minutos por registro, 63 registros por
mês. Quando o cliente acerta, repete tudo ao contrário.

> **As duas armadilhas:** *"sempre sobra um sistema em que o bloqueio não foi
> aplicado"* — e *"o cliente não é desativado no sistema de tarefas: troca-se o
> responsável por um marcador de bloqueado. Reproduza isso, e saiba voltar
> atrás."*

### 3. Solução
Uma ação executa a sequência inteira. **O desbloqueio é a compensação da mesma
saga, na ordem inversa** — não uma segunda rotina, porque duas rotinas divergem
na primeira manutenção, que é o problema de hoje.

E falha parcial **não decide nada**: a sequência para, o estado fica `PARCIAL`, a
tela mostra o que foi e o que não foi aplicado, e oferece **retomar** ou
**reverter**.

### 4. Execução — o que fazer na tela

1. Escolher um cliente livre, escrever o motivo (**obrigatório**) e **Bloquear**.
2. Mostrar os três sistemas mudando juntos.
3. Abrir **"ver as tarefas"**: as tarefas continuam existindo, o cliente **não
   foi desativado**, e o **responsável original está guardado, tarefa por tarefa**.
4. **A demonstração forte:** ligar a falha no *Sistema de Tarefas* pelo
   interruptor na tela, e bloquear outro cliente.
   → Estado **PARCIAL**: dois sistemas aplicados, um não, e duas opções oferecidas.
5. Religar o sistema e **Retomar de onde parou** — o passo 1 não roda de novo.
6. **Desbloquear** o primeiro cliente e mostrar cada tarefa voltando ao **seu**
   responsável.

> **A frase:** *"Nada foi decidido sozinho. 'Achei que bloqueou' é o defeito que
> este módulo existe para eliminar."*

---

## SC-01 — Extrato bancário para OFX · 4 min

*O carro-chefe: 110 horas por mês.*

### 1. Tecnologia
Agente de IA, mas com o **determinístico primeiro**: registry de parsers por
banco, validação em código, gerador de OFX 1.0.2 escrito à mão. A IA
(`claude-opus-5`, com saída estruturada por schema) entra **só** no que nenhum
parser reconhece.

### 2. Problema
Os extratos chegam em PDF ou foto, e o sistema contábil só importa OFX. Alguém
abre arquivo por arquivo e transcreve à mão. São 200 extratos por mês, 80 deles
consomem uma hora cada.

> **A armadilha:** *"cada banco imprime o extrato de um jeito. Solução que só
> funciona com um layout resolve pouco."*

### 3. Solução
**Registry de parsers**: cada banco é um arquivo com `detect()` e `parse()`.
Aceitar um banco novo é acrescentar um arquivo e uma linha — nada mais no módulo
muda.

O que é lido passa por **validação determinística**: soma dos lançamentos ×
saldo declarado, em centavos inteiros. **Soma que não fecha não gera OFX.** E
cada lançamento recebe uma **confiança**: parser produz alta e entra direto; IA
produz média e vai para a **fila de conferência** antes de virar contabilidade.

### 4. Execução — o que fazer na tela

> **Os arquivos para enviar ao vivo estão em `tests/fixtures/sc-01/demo/`.** Os de
> agosto o seed já importou, e reenviá-los é recusado por hash — comportamento
> correto, mas não é o que você quer na gravação. Use os de **setembro**:
>
> | Arquivo | O que acontece |
> |---|---|
> | `aurora-setembro-2026.pdf` | Parser reconhece · 10 lançamentos · **OFX gerado** |
> | `pampa-setembro-2026.pdf` | Parser reconhece · **1 lançamento vai para conferência** (histórico truncado pelo banco) |
> | `horizonte-setembro-2026.pdf` | Nenhum parser conhece · **cai na leitura por IA** |
> | `aurora-setembro-soma-nao-fecha.pdf` | Falta um lançamento de R$ 3.150,90 · **OFX não é gerado** |

1. Mostrar a lista de extratos importados, com o parser que leu cada um.
2. Abrir **"ver os lançamentos lidos"** e mostrar a coluna de confiança.
3. **Baixar o OFX** e abrir o arquivo — cabeçalho `OFXHEADER:100`, um `STMTTRN`
   por lançamento.
4. **O extrato que não fecha:** mostrar a mensagem explicando a diferença em
   reais e que o OFX **não foi gerado**.
   > *"Erro que entra na contabilidade só aparece na conciliação, quando corrigir
   > custa mais. Não entregar é melhor do que entregar errado."*
5. **A IA:** enviar `tests/fixtures/sc-01/demo/horizonte-setembro-2026.pdf` — um
   layout que nenhum parser conhece.
   → Lido em ~8 segundos, 10 lançamentos, **origem IA**, todos com confiança
   **média** e **todos na fila de conferência**.
6. Conferir um lançamento e mostrar que o OFX é **regerado** com ele dentro.

> **A frase:** *"O modelo extrai; quem decide se o resultado presta é código
> determinístico. E interpretação nunca vira contabilidade sem alguém conferir."*

**O número, se perguntarem:** a leitura custou **US$ 0,019** — 1.068 tokens de
entrada, 529 de saída. E é caminho de exceção: extrato de banco conhecido nunca
chega ao modelo.

---

## Como se prova que rodou — 2 min

Vale um bloco só para isso, porque é o que separa "mostrei uma tela" de
"demonstrei uma automação".

1. **`/execucoes`** — data, duração, quem disparou, resultado.
2. **Clicar numa execução** → o item a item. Numa rodada do SC-02 são 48 linhas,
   cada uma com hora e resultado.
   > *"O portal não pede que você acredite nele."*
3. **Rodar sozinho:** GitHub → Actions → **Agendador** → *Run workflow*. Em
   segundos aparece uma execução nova no portal com **"Agendador"** como quem
   disparou — ninguém logado.

---

## Fechamento — 2 min

**O que ficou de fora, de propósito.** `SC-11`, presunção item a item nas notas
médicas. O enunciado avisa que *"uma automação completa vale mais que quatro pela
metade"*, e eu preferi profundidade.

**O que faria com mais tempo:**

- Um papel de banco restrito ao schema do portal, em vez da credencial ampla.
- OCR próprio antes da IA no SC-01, para baratear o caminho caro.
- Alerta quando um cliente **muda** de regular para irregular no SC-02,
  reaproveitando a régua de avisos do SC-20.
- Bloqueio agendado a partir do vencimento da fatura no SC-05.

**O fecho:** *"Nenhum acesso foi concedido, então cada fronteira é uma interface
com implementação falsa — e o lugar da credencial real está marcado no código.
O que não é falso é o miolo: os parsers, a régua, a saga, a validação e o
tratamento de erro. É onde estão os 116 testes."*

---

## Perguntas prováveis, e o que responder

| Pergunta | Resposta curta |
|---|---|
| *"Isso é RPA mesmo ou é integração?"* | RPA é para sistema que não tem API. O SC-02 tem os dois adapters justamente por isso — e o Playwright dirige o navegador de verdade. |
| *"A IA não pode errar e estragar a contabilidade?"* | Pode errar, e por isso não decide. O que ela devolve passa pela mesma validação do parser, e nasce em confiança média: vai para a fila de conferência. |
| *"Por que os dados são falsos?"* | Porque o enunciado não concedeu acesso a nada. A massa é sintética e versionada, com CNPJ válido em formato. O que é falso é a fronteira; o miolo é real. |
| *"Quanto custa rodar isso?"* | A hospedagem e o banco estão em plano gratuito. A IA custou US$ 0,019 por extrato, e só é acionada no que os parsers não cobrem. |
| *"E se um portal de órgão mudar?"* | A leitura da resposta está separada do transporte — é o pedaço que muda, e é o que tem teste. Trocar significa mexer num arquivo. |
