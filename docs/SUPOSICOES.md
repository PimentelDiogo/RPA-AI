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

_As suposições de SC-01, SC-02, SC-05 e SC-20 entram aqui conforme cada módulo é
implementado._
