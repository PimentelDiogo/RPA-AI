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
| **SC-01** — extrato bancário → OFX | **Planejado, ainda não habilitado.** A leitura assistida entrará para extratos que os parsers determinísticos não cobrem e para arquivos digitalizados: modelo `claude-opus-5` via `@anthropic-ai/sdk`, com saída estruturada por schema. Hoje o módulo funciona apenas pelo caminho determinístico, e recusa com mensagem legível o que não reconhece. | A detecção de layout, os parsers por banco, a validação (soma × saldo, competência, sinal), o score de confiança, a fila de conferência e a geração do OFX. O modelo extrairá; quem decide se o resultado presta é código determinístico. |
| SC-02, SC-05, SC-20 | Nenhuma. | Tudo. São RPA e controle sistematizado — regra explícita, não inferência. |

O portal funciona sem `ANTHROPIC_API_KEY`: nesse caso o SC-01 opera apenas com
os parsers determinísticos e envia para conferência o que não conseguir ler.
