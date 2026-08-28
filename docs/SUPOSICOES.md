# Suposições

Nenhum acesso real foi concedido — nem a sistema, nem a base, nem a portal de
órgão, nem a alguém da área para entrevistar. Onde faltou contexto, assumimos um
caminho plausível, registramos aqui e seguimos.

Formato: `[SC-XX] Assumi que … porque …` · uma linha por decisão · registrada no
mesmo commit em que a decisão entra no código.

## Gerais

- **[GERAL]** Assumi que os clientes da SheepContabil são pessoas jurídicas
  identificadas por CNPJ, porque todos os processos do catálogo falam em
  obrigações, notas e inscrições que pressupõem empresa. A massa sintética usa
  CNPJ fictício, válido em formato.
- **[GERAL]** Assumi que "operador" é um perfil por setor (contábil, fiscal,
  processos, departamento pessoal), porque o enunciado pede que ele "enxergue
  apenas os módulos da área dele" e o catálogo classifica cada processo por
  setor.
- **[GERAL]** Assumi que o histórico de execução precisa sobreviver a reinício
  da aplicação, porque o enunciado exige data, duração, quem disparou e
  resultado — logo, persistência em banco, não memória do processo.

## Por automação

### SC-20 — Vencimento de certificado digital

- **[SC-20]** Assumi que o certificado tem titular, tipo (A1/A3), emissor e validade,
  porque é o conjunto mínimo que a planilha descrita no enunciado teria — sem titular
  não há quem acionar.
- **[SC-20]** Assumi que as faixas do painel são vencido, ≤15, ≤30 e ≤60 dias, porque o
  enunciado pede o painel dos próximos 60 dias e "quanto tempo resta": faixas dão a
  leitura de relance que ele cobra.
- **[SC-20]** Assumi que **mudança de faixa** é o gatilho do aviso, e não a passagem de
  tempo, porque o enunciado diz para mostrar "o que mudou desde o último aviso" — 45
  para 44 dias não é mudança, cruzar para ≤30 é.
- **[SC-20]** Assumi que o destinatário é um contato interno da SheepContabil, não o
  cliente final, porque o enunciado fala em avisar "quem precisa acionar o cliente".
- **[SC-20]** Assumi que a verificação roda **diariamente**, embora o catálogo diga
  mensal, porque mensal é a frequência da revisão manual de hoje — que é o problema:
  um certificado que vence no dia 3 não pode esperar a revisão do dia 30.
- **[SC-20]** Assumi que a janela de alerta é configurável pela operação (30 a 120 dias,
  padrão 60), porque quem trabalha com certificado sabe melhor que o desenvolvedor
  quanta antecedência resolve.
- **[SC-20]** Assumi que cliente sem contato cadastrado é **falha de item**, não erro de
  execução, porque é dado faltando: a rodada continua nos demais e o operador vê
  exatamente o que precisa cadastrar.

### SC-02 — Painel de situação fiscal

- **[SC-02]** Assumi que os órgãos consultados são Receita Federal, FGTS, Previdência e
  Fazenda Estadual, porque o enunciado cita "vários órgãos por cliente, o FGTS entre
  eles" e não lista o resto.
- **[SC-02]** Assumi três resultados possíveis — regular, irregular e indisponível —
  porque é a leitura mínima que o painel precisa; certidão positiva com efeito de
  negativa entraria como regular com observação.
- **[SC-02]** Assumi que "o órgão respondeu que não pode informar" (indisponível) é
  **leitura válida**, diferente de "não conseguimos perguntar", que é ausência de
  leitura. A distinção é o que a armadilha do processo exige.
- **[SC-02]** Assumi consulta por CNPJ, sem certificado digital, porque nenhum acesso
  real é concedido. O adapter real exigiria o certificado, e o ponto está marcado no
  código.
- **[SC-02]** Assumi 3 tentativas com espera crescente e no máximo 4 consultas
  simultâneas, porque portal de órgão cai e volta, e derruba quem martela.
- **[SC-02]** Assumi espera de 400 ms na segunda tentativa, dobrando — bem menor do que
  um portal real merece — porque a rodada inteira precisa caber numa invocação de função
  serverless. O mecanismo é o que está sendo demonstrado, não a paciência.
- **[SC-02]** Assumi execução **diária**, embora o catálogo diga mensal, porque o próprio
  enunciado diz que "a planilha nasce vencida: no dia seguinte já não vale".

### SC-01 — Conversão de extrato bancário para OFX

- **[SC-01]** Assumi que o extrato chega em PDF, com uma linha por lançamento e colunas
  de data, histórico e valor, porque é o que o enunciado descreve ("PDF ou foto") e é o
  formato que sistema bancário emite.
- **[SC-01]** Assumi que o extrato declara saldo inicial e final, porque é o que permite
  validar a leitura sem acesso ao banco — sem eles não há como afirmar que nenhum
  lançamento ficou de fora, e o portal diz isso em vez de fingir que conferiu.
- **[SC-01]** Assumi **OFX 1.0.2 (SGML)**, porque é a versão que sistema contábil
  brasileiro importa. O enunciado só diz "OFX válido".
- **[SC-01]** Assumi que os bancos são fictícios (Aurora, Meridiano, Pampa), como toda a
  massa do projeto. O que importa é que cada um imprime de um jeito diferente — esse é o
  problema que o registry resolve.
- **[SC-01]** Assumi que **soma que não fecha não gera OFX**, porque erro que entra na
  contabilidade só aparece na conciliação, quando corrigir custa mais. Não entregar é
  melhor do que entregar errado.
- **[SC-01]** Assumi que lançamento com confiança média ou baixa **não entra no OFX** até
  alguém conferir, e que conferir **regera o arquivo** — senão a conferência não teria
  efeito prático.
- **[SC-01]** Assumi que o mesmo arquivo enviado duas vezes é recusado por hash, porque
  reimportar duplicaria lançamento no sistema contábil.
- **[SC-01]** Assumi que o `FITID` do OFX combina o extrato e a ordem do lançamento:
  precisa ser estável entre reimportações e distinto entre lançamentos parecidos no
  mesmo dia.

### SC-05 — Bloqueio e desbloqueio de inadimplentes

- **[SC-05]** Assumi três sistemas — financeiro, portal do cliente e sistema de tarefas —
  porque o enunciado diz "vários sistemas" e detalha apenas o de tarefas.
- **[SC-05]** Assumi que o marcador de bloqueado no sistema de tarefas é um responsável
  fictício, e que o responsável original é guardado **por tarefa**: tarefas do mesmo
  cliente podem ter donos diferentes, e devolver todas para uma pessoa só perderia
  informação.
- **[SC-05]** Assumi que falha parcial **para a sequência e não decide nada**: nem segue
  para o próximo sistema, nem reverte sozinha. Quem decide é gente, com o que já foi
  aplicado à vista. Mexer em sistema de cliente sem alguém mandar é como o problema
  começa.
- **[SC-05]** Assumi que o bloqueio é por cliente inteiro, nunca por serviço, porque o
  enunciado fala em "cliente inadimplente" sem granularidade menor.
- **[SC-05]** Assumi que motivo é **obrigatório** nas duas direções: é ação com efeito
  sobre o cliente, e sem justificativa registrada ninguém sabe depois por que aconteceu.
- **[SC-05]** Assumi que a verificação de consistência **aponta e não corrige**, porque
  corrigir sozinha seria repetir o problema original, só que mais rápido.
- **[SC-05]** Assumi que só o `admin` dispara bloqueio — o catálogo põe o processo no
  setor de Tecnologia, e é ação com efeito sobre o cliente.
