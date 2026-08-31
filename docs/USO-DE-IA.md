# Declaração de uso de IA

O enunciado permite o uso de assistentes de IA e pede que se declare **o que foi
usado e onde**. Este arquivo é essa declaração, e é mantido atualizado.

## No desenvolvimento

| Ferramenta | Onde | Como |
|-----------|------|------|
| **Claude Code** (Claude Opus) | Ao longo do projeto | Leitura do enunciado, redação do `CLAUDE.md`, scaffolding, implementação e revisão. Toda decisão de escopo, arquitetura e regra de negócio foi tomada e revisada por mim; o código gerado foi lido antes de entrar. |

## No produto (runtime)

| Módulo | Onde a IA entra | O que **não** é IA |
|--------|-----------------|--------------------|
| **SC-01** — extrato bancário → OFX | Leitura de extrato que **nenhum parser reconhece** e de arquivo sem texto (foto, digitalização). Modelo `claude-opus-5` via `@anthropic-ai/sdk`, com **saída estruturada por schema** (`output_config.format`) e `effort: "low"` — extrair campo é tarefa mecânica. É o caminho de exceção: extrato de banco conhecido nunca chega ao modelo. | A detecção de layout, os parsers por banco, a validação (soma × saldo, competência, sinal), o score de confiança, a fila de conferência e a geração do OFX. O modelo extrai; **quem decide se o resultado presta é código determinístico** — e todo lançamento lido por IA nasce com confiança média, ou seja, não entra no OFX sem alguém conferir. |
| SC-02, SC-05, SC-20 | Nenhuma. | Tudo. São RPA e controle sistematizado — regra explícita, não inferência. |

O portal funciona sem `ANTHROPIC_API_KEY`: nesse caso o SC-01 opera apenas com
os parsers determinísticos, e o que não for reconhecido é recusado com mensagem
legível em vez de quebrar. A própria tela de envio diz qual dos dois modos está
ativo.

**Custo medido**, para não ficar no campo da estimativa: a leitura de um extrato
de uma página consumiu 1.068 tokens de entrada e 529 de saída — **US$ 0,019** por
extrato. Como a IA é caminho de exceção, e não o padrão, o custo por mês de
operação real seria uma fração disso.
