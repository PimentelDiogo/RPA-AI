# CLAUDE.md — Desafio Técnico SheepContabil

> **Fonte da verdade:** `Sheep Tech - Desafio de Automações.pdf` (atualizado 25/08/26) — material recebido, mantido **fora do versionamento** (`.gitignore`) e presente apenas na cópia local, na raiz do projeto.
> Em qualquer divergência entre este arquivo e o PDF, **o PDF vence**. Este documento é a transcrição operacional do enunciado + as decisões de projeto.
> Caso fictício: a SheepContabil não existe; nenhum dado, nome ou empresa citada é real.

---

## 1. Regras de entrega (não negociáveis)

Extraídas de "O ESSENCIAL", seção 05 e "O QUE ENVIAR" do PDF.

| # | Regra | Critério de pronto |
|---|-------|--------------------|
| R1 | Escolher de **3 a 5 processos** do catálogo (seção 08) | Escopo congelado e registrado na seção 4 deste arquivo |
| R2 | Incluir **pelo menos duas das três naturezas**: RPA, agente de IA, controle sistematizado | Cada módulo declara sua natureza na home |
| R3 | Tudo em **um portal único**, com **login e senha**, **um módulo por automação** | Home lista os módulos; cada um em tela própria identificada pelo código `SC-XX` |
| R4 | Portal **hospedado na nuvem**, com **URL pública** que qualquer pessoa abra | Sem VPN, sem túnel, sem "roda na minha máquina". No ar até o fim do processo |
| R5 | **Identidade visual** da SheepContabil: logo, paleta e tipografia da seção 06 | Ver seção 5 deste arquivo |
| R6 | **Nenhum acesso real.** Massa de dados sintética + fronteiras mockadas | Seed versionado; o portal chega com dado dentro, não vazio |
| R7 | **Repositório público e aberto**; histórico de commit e infra também são avaliados | Ver seção 6 deste arquivo |
| R8 | Prazo de **uma semana corrida**, encerrando com apresentação de até **20 min** com demo ao vivo | Roteiro de demo pronto e ensaiado |

### Requisitos funcionais do portal (seção 05 do PDF)

- **Autenticação real, com sessão.** Nada de tela de login decorativa que aceita qualquer coisa.
- **Dois perfis, no mínimo:** `admin` (enxerga tudo) e `operador` (enxerga apenas os módulos da área dele).
- **Um módulo por automação**, identificado pelo código do catálogo.
- **Disparo e agendamento:** rodar sob demanda **e** rodar sozinho na frequência que o catálogo indica.
- **Histórico de execução:** data, duração, quem disparou, resultado. Falha mostra **erro legível**, não stack trace cru.
- **Saída visível no portal:** tabela, painel, arquivo para download, ou o registro do que foi enviado.
- **Identidade aplicada.** O portal precisa parecer da empresa.

### O que enviar no fim

1. **URL pública do portal no ar**, com as credenciais de acesso.
2. **Link do repositório**, público e aberto. Nada de convite, acesso restrito ou zip — quem avalia abre o link e lê o histórico direto.
3. O repositório **é lido, não apenas clonado**: histórico de commit, organização de branch, estrutura de pastas e configuração de ambiente pesam na avaliação tanto quanto o código.

---

## 2. A condição central: trabalhar sem acesso (seção 03)

> "A falta de contexto não é uma lacuna do enunciado. Ela é o enunciado."

Nenhum acesso real será concedido — nem sistema, nem base, nem portal de órgão, nem entrevista. A descrição do catálogo é tudo o que existe, e é curta de propósito.

**Regras de trabalho derivadas — valem para toda decisão neste projeto:**

- **Assuma e escreva a suposição.** Toda suposição vai para `docs/SUPOSICOES.md` no formato `[SC-XX] Assumi que … porque …`. Suposição registrada conta a favor; trabalho parado esperando resposta, não.
- **Mocke a fronteira, não o miolo.** Pode ser falso: PDFs gerados, API simulada, banco semeado, portal de órgão fake. **Não pode ser falso:** parser, regra de conciliação, classificação, agendamento, tratamento de erro.
- **Deixe visível onde entraria o real.** Toda fronteira é uma **interface** (`ports/`) com implementação fake (`adapters/mock/`) e o lugar óbvio para a verdadeira. Na apresentação é preciso apontar: "aqui entra a credencial, aqui entra a API do órgão."
- **Resolva o problema, não a frase.** Formato não especificado → escolha um plausível e siga. Ambiguidade que muda a solução inteira → escolha um caminho e explique por quê.
- **Os dados são seus.** CNPJ fictício mas válido em formato, nomes inventados, extratos e notas produzidos por nós. Seed versionado faz parte da entrega.
- **Pergunte quando travar de verdade — e continue.** Dúvida não desconta nota; entregar menos por estar esperando resposta, sim.

---

## 3. As três naturezas (seção 04)

A natureza sugerida no catálogo **é sugestão, não amarra** — defender outra abordagem na apresentação conta a favor.

| Natureza | Definição | No catálogo |
|----------|-----------|-------------|
| **RPA** | Robô que opera sistema, portal ou planilha no lugar da pessoa | 7 |
| **Agente de IA** | Leitura, classificação ou redação sobre conteúdo não estruturado | 5 |
| **Controle sistematizado** | Base, painel, régua ou alerta que sistematiza o que hoje é planilha e memória | 8 |

---

## 4. Escopo escolhido

> **STATUS: CONGELADO.** Escopo definido: **SC-01, SC-02, SC-05 e SC-20**. Não entra nem sai processo sem decisão explícita registrada aqui.

| Código | Processo | Natureza | Compl. | Freq. | Dor medida | Por que entra |
|--------|----------|----------|--------|-------|-----------|---------------|
| **SC-01** | Conversão de extrato bancário para OFX | Agente de IA | Alta | Mensal | **110 h/mês** | Maior consumo isolado. É o carro-chefe da demo |
| **SC-02** | Painel de situação fiscal dos clientes | RPA | Alta | Mensal | **54 h/mês** | Segunda maior dor; exercita agendamento, retry e histórico de falha |
| **SC-05** | Bloqueio e desbloqueio de clientes inadimplentes | RPA | Média | Sob demanda | **11 h/mês** | Orquestração multi-sistema com desfazer — mostra sequência e compensação |
| **SC-20** | Vencimento de certificado digital | Controle sistematizado | Baixa | Mensal | **2 h/mês** | Fecha a terceira natureza a custo baixo: base + painel + régua de aviso |

Cobertura: **3 de 3 naturezas** (R2 satisfeita com folga). Total: 4 processos (dentro de 3–5).

**Fora de escopo (registrado para a pergunta "o que faria com mais tempo"):** `SC-11` — presunção item a item nas notas de serviço médicas. Não entra nesta semana.

> Lembrete do PDF: *"Uma automação completa vale mais que quatro pela metade."* Diante de escolha entre profundidade e quantidade, **corte escopo, não acabamento**.

### Armadilhas registradas para os processos escolhidos

- **SC-01** — Cada banco imprime o extrato de um jeito. Solução que só funciona com um layout resolve pouco: aceitar **layout novo sem reescrever tudo** (registry de parsers por banco). O que não foi lido com confiança vai para uma **fila de conferência**, à parte, antes de importar.
- **SC-02** — **Consulta que falhou não pode sumir.** Guardar tentativa, erro e hora. Sem isso ninguém sabe se o cliente está irregular ou se o robô não conseguiu perguntar. O painel responde de relance: quem está irregular, em qual órgão, há quanto tempo.
- **SC-05** — O cliente **não é desativado** no sistema de tarefas: troca-se o responsável das tarefas por um marcador de bloqueado (a maioria renegocia depois). Reproduzir isso, e **saber voltar atrás**.
- **SC-20** — **Aviso repetido vira ruído.** Registrar o que já foi comunicado e a quem; mostrar **o que mudou desde o último aviso**, não repetir a lista inteira. Painel dos próximos 60 dias.

---

## 5. Identidade visual (seção 06) — não é sugestão

A assinatura funciona sobre fundo claro, sobre o grafite da marca e sobre o turquesa.
Logo extraído do PDF: [`docs/brand/logo-sheepcontabil-3-fundos.png`](docs/brand/logo-sheepcontabil-3-fundos.png).

### Paleta

| Hex | Nome | Uso — **exclusivo, não decorativo** |
|-----|------|--------------------------------------|
| `#10505F` | Petróleo | Primária. Marca, cabeçalho, botão principal |
| `#1FA69A` | Turquesa | Ação e sucesso. Link, estado ativo, confirmação |
| `#E8A33D` | Âmbar | Atenção. Pendência, alerta, destaque pontual |
| `#0B1A20` | Tinta | Texto principal e fundo do tema escuro |
| `#5A7078` | Grafite | Texto secundário, rótulo, borda forte |
| `#EEF3F4` | Névoa | Superfície clara, fundo de painel, listra de tabela |
| `#C4453D` | Carmim | Erro e falha de execução. **Só isso.** |

### Tipografia

| Fonte | Uso |
|-------|-----|
| **Archivo** | Títulos e números de destaque. Pesos 600–800, entrelinha curta |
| **IBM Plex Sans** | Texto corrido, formulário e rótulo de interface |
| **IBM Plex Mono** | Código, valor, log de execução e **qualquer coluna de número** |

As três estão no Google Fonts. Definir como design tokens (CSS custom properties) em um único arquivo — nenhum hex solto em componente.

---

## 6. Repositório e infraestrutura (avaliados)

Do critério "O repositório conta a história":

- **Commits pequenos**, com mensagem que explica **o porquê**, não só o quê. Padrão: Conventional Commits (`feat(sc-01): …`, `fix(auth): …`, `docs: …`, `chore(infra): …`), com corpo justificando a decisão quando não for óbvia.
- **Branch com critério.** `main` sempre deployável; `feat/sc-01-extrato-ofx`, `feat/sc-02-painel-fiscal`, …; merge via PR com descrição. Sem commit direto em `main` depois do bootstrap.
- **Segredo fora do versionamento.** `.env.example` versionado, `.env` no `.gitignore`. Nenhuma credencial, token ou chave no histórico — nem em commit revertido.
- **Ambiente reproduzível.** Alguém além de nós precisa subir o projeto seguindo o README: um comando para instalar, um para semear, um para rodar. Docker Compose para o local.
- **README** com: o que foi escolhido e por quê, como subir, como rodar o seed, credenciais de demo, onde estão os mocks e o que entraria no lugar deles, e o que foi assumido.
- **Estrutura de pastas** que revele a arquitetura, não o framework. Módulo por automação; fronteiras isoladas em `ports`/`adapters`.
- CI simples (lint + testes) e deploy automatizado a partir de `main` contam como infra.

---

## 7. Critérios de avaliação (seção 07) — checklist

- [ ] **Funciona de ponta a ponta.** Entra dado, sai resultado, dentro do portal.
- [ ] **Decidiu com pouca informação.** Suposições assumidas, registradas e seguidas em frente.
- [ ] **A escolha foi defensável.** Entendeu por que aquele processo dói e escolheu valor, não facilidade.
- [ ] **O código se sustenta.** Organização, nomes, tratamento de erro, README que permite outra pessoa subir o projeto.
- [ ] **O repositório conta a história.** Ver seção 6.
- [ ] **Falha com dignidade.** Portal fora do ar, arquivo com formato inesperado, sessão expirada — o que a automação faz quando o mundo não colabora.
- [ ] **A identidade foi respeitada.** Logo, paleta e tipografia aplicados com cuidado.
- [ ] **A apresentação é clara.** Explicar o que foi feito para quem não escreveu o código.

Apresentação (até 20 min): o que escolheu e por quê → demo ao vivo → decisões técnicas → o que faria com mais tempo.

---

## 8. Stack

Livre pelo enunciado — "use a linguagem, o framework e as ferramentas que quiser, **inclusive assistentes de IA. Só declare o que usou e onde.**"
Restrições que a stack precisa atender: autenticação com sessão e dois perfis; agendador que roda sem ninguém logado; persistência para histórico de execução e seed versionado; deploy em serviço gratuito com URL pública estável.

### 8.1 Base comum do portal

| Camada | Escolha | Por quê |
|--------|---------|---------|
| Linguagem | **TypeScript** (Node 22) | Mesma linguagem do portal ao worker; tipagem sustenta as fronteiras `port`/`adapter` |
| Framework | **Next.js 16 (App Router)** | Portal, telas dos módulos e endpoints de execução num deploy só |
| Auth | **Auth.js (NextAuth) — credentials + sessão em cookie httpOnly**, senha com `argon2` | R3: autenticação real, com sessão. Papéis `admin` / `operador` (por área) no token e checados no servidor |
| Dados | **PostgreSQL + Prisma 7** (driver adapter `pg`; Neon free em produção) | Migrations versionadas = ambiente reproduzível; seed em `prisma/seed.ts` |
| UI | **Tailwind + shadcn/ui**, tokens da §5 num único `tokens.css` | Identidade aplicada sem hex solto |
| Agendamento | Tabela `schedule` + `job_queue` no Postgres; **tick** em `POST /api/scheduler/tick` disparado por **GitHub Actions cron** (a cada 15 min, com token) | Agendador que roda sem ninguém logado, sem depender do limite de cron do plano free da hospedagem; o cron externo aparece no repo como infra |
| Execução | Fila persistida com `attempt`, backoff e status por item | "Falha com dignidade" e "consulta que falhou não pode sumir" caem no mesmo mecanismo |
| Hospedagem | **Vercel** (portal) + **Neon** (banco) | Free, URL pública estável, deploy automático a partir de `main` |
| Testes | **Vitest** (regra de negócio) + **Playwright** (e2e do login e de um módulo) | O miolo é o que não pode ser falso — é o que tem teste |
| IA | **`@anthropic-ai/sdk`**, modelo `claude-opus-5` | Só no SC-01. Ver 8.2 |

**Modelo de execução comum a todos os módulos** (evita quatro implementações diferentes):
`Module` → `Trigger` (manual ou agendado) → `Run` (id, módulo, quem disparou, início, fim, status) → `RunStep`/`RunItem` (item a item, com erro legível) → `Artifact` (arquivo ou tabela de saída). Todo módulo só implementa o *handler*; histórico, agendamento, permissão e tela de saída vêm do núcleo.

### 8.2 O que cada processo pede de específico

#### SC-01 — Extrato bancário → OFX (Agente de IA)

| Peça | Escolha |
|------|---------|
| Ingestão | Upload de PDF/imagem → armazenamento via port `FileStorage` (adapter local/disco no dev, Vercel Blob em prod) |
| Extração de texto | `unpdf` / `pdfjs-dist` para PDF com texto nativo — **caminho determinístico primeiro** |
| Parsers por banco | **Registry** `BankStatementParser[]` com `detect(text)` + `parse(text)`. Adicionar banco = adicionar um arquivo, sem tocar no resto — resposta direta à armadilha "cada banco imprime de um jeito" |
| Fallback / PDF escaneado | Claude `claude-opus-5` via `@anthropic-ai/sdk`, PDF como content block `document` (base64) e **structured outputs** (`output_config.format`) devolvendo o schema de lançamentos |
| Confiança | Score por lançamento (parser determinístico = alta; LLM = média; campo faltando/ambíguo = baixa). Baixa/média vai para **fila de conferência** antes de gerar o OFX |
| Validação | Soma dos lançamentos × saldo final, datas dentro da competência, valor com sinal — checagem determinística sobre o que o LLM devolveu |
| Saída | Gerador OFX próprio (SGML 1.0.2), download no portal + prévia em tabela |
| Fronteira mockada | `AccountingSystem.import(ofx)` — port com adapter que só registra o envio |

#### SC-02 — Painel de situação fiscal (RPA)

| Peça | Escolha |
|------|---------|
| Fronteira | Port `ConsultaOrgao { consultar(cliente, orgao): Promise<Situacao> }` |
| Portal-fake | **Órgãos simulados servidos pelo próprio repo** (`/api/_fake/orgaos/*`): páginas HTML com formulário, latência, timeout, indisponibilidade e sessão que expira — injetados por seed determinístico |
| Adapter default (cloud) | `orgao-http` — cliente HTTP contra o portal-fake. É o que roda na URL pública |
| Adapter RPA real | `orgao-playwright` — **Playwright de verdade** navegando o portal-fake (roda local e no CI). É a peça que mostra "aqui entra o portal do órgão de verdade, aqui entra a credencial" |
| Resiliência | Fila por (cliente × órgão), retry com backoff, limite de concorrência. **Toda tentativa é persistida**: hora, órgão, erro, resposta |
| Estado | `situacao_atual` (última leitura bem-sucedida, com data e origem) separado de `consulta_tentativa` — o painel distingue "irregular" de "não consegui perguntar" |
| Saída | Painel: quem está irregular, em qual órgão, há quanto tempo; e uma faixa de "consultas com falha" que não some |

#### SC-05 — Bloqueio e desbloqueio de inadimplentes (RPA)

| Peça | Escolha |
|------|---------|
| Orquestração | **Saga** com passos idempotentes e `compensate()` por passo. Executor genérico, passos declarados como dados |
| Sistemas fake | 3 adapters mock atrás de ports: `SistemaFinanceiro` (marca inadimplência), `PortalCliente` (revoga acesso), `SistemaTarefas` (**troca o responsável por um marcador de bloqueado — não desativa o cliente**) |
| Desfazer | O desbloqueio é a compensação da mesma saga, na ordem inversa — mesmo código, não uma segunda rotina |
| Falha parcial | Passo que falha para a saga, mostra o que já foi aplicado e oferece retomar ou reverter. Nada de "achei que bloqueou" |
| Saída | Linha do tempo por execução: sistema, ação, resultado, hora. É a tela que mostra "não sobrou sistema sem bloqueio" |

#### SC-20 — Vencimento de certificado digital (Controle sistematizado)

| Peça | Escolha |
|------|---------|
| Base | CRUD de certificados por cliente (titular, tipo, emissor, validade), no Postgres |
| Regra | Janela de alerta **configurável** (default 60 dias), com **dias restantes** calculados — não só a data |
| Régua de avisos | Tabela `aviso_enviado` (certificado, destinatário, data, conteúdo/hash). O job diário só notifica **o que mudou desde o último aviso**; repetição idêntica é suprimida e fica registrada como suprimida |
| Envio | Port `Notificador` com adapter **outbox**: a mensagem é gravada e mostrada no portal, não sai para lugar nenhum |
| Saída | Painel dos próximos 60 dias por faixa (vencido / ≤15d / ≤30d / ≤60d) + histórico "quem já foi avisado, quando, do quê" |

### 8.3 Declaração de uso de IA

Exigida pelo enunciado ("só declare o que usou e onde"). Manter em `docs/USO-DE-IA.md`: ferramentas usadas no desenvolvimento (Claude Code) **e** onde há IA em runtime (SC-01, extração de lançamentos com `claude-opus-5`), com o que é determinístico ao redor dela.

---

## 9. Diretrizes para o agente (Claude) neste repositório

1. **Antes de decidir qualquer regra de negócio, releia a descrição do processo no PDF.** Não inventar requisito que o enunciado não pede; não ignorar a linha "Atenção" — é onde está a armadilha avaliada.
2. **Toda suposição vira uma linha em `docs/SUPOSICOES.md`** no mesmo commit em que a decisão entra no código.
3. **Fronteira externa nunca é chamada direto.** Sempre `port` (interface) + `adapter` mock. O adapter real fica como stub documentado.
4. **Nada de dado real.** Só massa sintética gerada pelo seed. CNPJ fictício, válido em formato.
5. **Erro é produto.** Toda falha de execução precisa de mensagem legível para o operador + registro com hora, tentativa e causa. Carmim `#C4453D` só para isso.
6. **Cores e fontes só via tokens.** Nenhum hex ou `font-family` literal em componente.
7. **Commits pequenos e explicativos**, na branch da feature. Nunca commitar `.env`, dump de dados reais ou o PDF modificado.
8. **Ao terminar um módulo**, verificar contra o checklist da seção 05: disparo sob demanda, agendamento, histórico, saída visível, identificação pelo código `SC-XX`.

---

## 10. Catálogo completo (seção 08) — referência

Natureza é sugestão; complexidade é referência; a medição vem do mapeamento interno.

| Código | Processo | Natureza sugerida | Compl. | Freq. | Setor | Medição |
|--------|----------|-------------------|--------|-------|-------|---------|
| SC-01 | Conversão de extrato bancário para OFX | Agente de IA | Alta | Mensal | Contábil | 110 h/mês |
| SC-02 | Painel de situação fiscal dos clientes | RPA | Alta | Mensal | Processos | 54 h/mês |
| SC-03 | Leitura da caixa postal do e-CAC | RPA | Alta | Diário | Processos | 4 h52/mês |
| SC-04 | Triagem da caixa de arquivos | Agente de IA | Média | Diário | Fiscal | — |
| SC-05 | Bloqueio e desbloqueio de clientes inadimplentes | RPA | Média | Sob demanda | Tecnologia | 11 h/mês |
| SC-06 | Briefing societário com perguntas condicionais | Controle | Média | Sob demanda | Societário | — |
| SC-07 | Cálculo mensal do FUNRURAL | Controle | Média | Mensal | Fiscal | — |
| SC-08 | Lançamento de notas rurais no livro caixa | Agente de IA | Média | Diário | Contábil | — |
| SC-09 | Controle de veículos de clientes revendedores | Controle | Baixa | Diário | Fiscal | — |
| SC-10 | Conferência de cadastro de funcionários | Controle | Baixa | Semanal | Dep. Pessoal | — |
| SC-11 | Presunção correta nas notas de serviço da área médica | Agente de IA | Alta | Mensal | BPO Saúde | — |
| SC-12 | Cruzamento das obrigações fiscais com os XML do período | Controle | Alta | Mensal | Fiscal | — |
| SC-13 | Download em lote das notas de serviço no portal nacional | RPA | Média | Mensal | Fiscal | — |
| SC-14 | Acompanhamento de parcelamentos ativos | RPA | Média | Sob demanda | Processos | 3 h40/rodada |
| SC-15 | Devolução de documentos ao cliente por WhatsApp | Agente de IA | Média | Sob demanda | Atendimento | — |
| SC-16 | Emissão recorrente de notas de serviço | RPA | Média | Sob demanda | BPO Saúde | — |
| SC-17 | Previsão e alerta de férias | Controle | Média | Trimestral | Dep. Pessoal | — |
| SC-18 | Tarefas encadeadas por tipo de processo | RPA | Média | Diário | Processos | 1 h22/dia |
| SC-19 | Verificação de inscrição estadual por atividade | Controle | Baixa | Sob demanda | Processos | 45 min/rodada |
| SC-20 | Vencimento de certificado digital | Controle | Baixa | Mensal | Processos | 2 h/mês |

O detalhamento de cada processo (Hoje / Onde dói / Esperado / Atenção) está nas páginas 5–9 do PDF. **Ler o processo no PDF antes de implementá-lo.**
