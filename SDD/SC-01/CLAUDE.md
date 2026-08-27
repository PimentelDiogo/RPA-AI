# SC-01 — contrato do módulo

Vale para `SDD/SC-01/`, `src/modules/sc-01/` e as tabelas `ExtratoImportado` e `Lancamento`.
Projeto completo em [`SDD.md`](SDD.md) · Contrato geral em [`../../CLAUDE.md`](../../CLAUDE.md).

## Identificação

| | |
|---|---|
| Código | `SC-01` |
| Nome | Conversão de extrato bancário para OFX |
| Natureza | **Agente de IA** — a única IA de runtime do projeto |
| Área / perfil | `CONTABIL` — enxergam `admin` e operador Contábil |
| Frequência | Sob demanda (upload) + varredura diária da fila |
| Dor medida | 110 h/mês — a maior do mapeamento |

## Não negociáveis

1. **Determinístico primeiro.** Parser por banco antes da IA, sempre. A IA é fallback
   para layout desconhecido e PDF escaneado, não o caminho padrão.
2. **Layout novo = arquivo novo.** Registry de parsers com `detect()` + `parse()`.
   Nenhum `if (banco === ...)` fora do registry. É a armadilha que o enunciado marca.
3. **O que a IA devolve é validado por código.** Soma dos lançamentos × saldo final,
   datas dentro da competência, valor com sinal. O modelo extrai; quem aprova é código.
4. **Soma que não fecha não vira OFX.** Melhor não entregar do que entregar errado —
   erro que entra na contabilidade só aparece na conciliação.
5. **Confiança por lançamento, sempre.** ALTA (parser) / MÉDIA (IA) / BAIXA (campo
   faltando ou ambíguo). Média e baixa vão para a **fila de conferência**, à parte,
   antes de compor o OFX.
6. **Funciona sem `ANTHROPIC_API_KEY`.** Sem chave, só os parsers determinísticos; o que
   não for reconhecido falha com mensagem legível. O portal não pode depender da chave
   para quem avalia abrir.
7. **Modelo:** `claude-opus-5` via `@anthropic-ai/sdk`, PDF como content block `document`
   e saída estruturada por schema. Não trocar o modelo sem registrar a decisão.
8. **Toda coluna de número em `--font-plex-mono`.** É regra da identidade, não estética.

## Fronteiras — nunca chamar direto

`FileStorage` e `AccountingSystem.importar(ofx)` são ports com adapter mock. O adapter
real fica como stub documentado, com o lugar da credencial visível.

## O que vem pronto — não reimplementar

Histórico, duração, autoria, item a item, artefato, agendamento, permissão e tratamento
de erro vêm de `src/lib/execucao/` e `src/lib/auth/`.

## Ao terminar

Checklist da seção 11 do [`SDD.md`](SDD.md), suposições em
[`../../docs/SUPOSICOES.md`](../../docs/SUPOSICOES.md) e a declaração de IA em
[`../../docs/USO-DE-IA.md`](../../docs/USO-DE-IA.md) atualizada no mesmo commit.
