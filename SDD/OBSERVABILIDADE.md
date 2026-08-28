# Observabilidade — como se prova que a automação rodou

> Vale para **todos** os módulos. Um módulo novo não decide como se mostra: ele
> preenche estes pontos, e a prova aparece nas telas que já existem.

Um portal que diz *"11 avisados"* e não deixa verificar **quais** não provou nada.
Este documento define o que cada automação precisa registrar para que quem avalia
consiga responder três perguntas sem pedir ajuda:

1. **Rodou?** Quando, quanto durou, quem disparou.
2. **Fez o quê?** Item a item, com o resultado de cada um.
3. **Cadê a prova?** O que foi produzido — arquivo, tabela ou o registro do que foi enviado.

---

## As quatro camadas

| Camada | Onde vive | O que responde | Quem preenche |
|--------|-----------|----------------|---------------|
| **Execução** | `Execucao` · listada em `/execucoes` | Rodou? Quando, quanto durou, quem disparou, deu certo? | O motor, automaticamente |
| **Item** | `ExecucaoItem` · `/execucoes/[id]` | Fez o quê, com cada cliente/arquivo/órgão? | **O handler**, via `contexto.registrarItem` |
| **Artefato** | `Artefato` · `/execucoes/[id]` | O que sobrou de concreto? | **O handler**, via `contexto.registrarArtefato` |
| **Estado do domínio** | Tabelas do módulo · tela do módulo | O que mudou no mundo? | O handler |

As duas primeiras vêm de graça para quem usa o motor. As duas últimas são
responsabilidade do módulo — e são as que costumam ser esquecidas.

---

## Regras

### 1. Um item por unidade de trabalho, sempre

Se o módulo processa 12 certificados, o histórico tem 12 itens. Não 1 item
dizendo "12 processados".

```ts
await contexto.registrarItem({
  referencia: "Trigo de Ouro — A1 de Marcos Prado",  // legível, não um id
  status: StatusItem.SUCESSO,
  mensagem: "1 aviso — mudou de vence em até 60 dias para vence em até 30 dias.",
  dados: { dias, faixa },   // o específico do módulo, recolhido na tela
});
```

- **`referencia`** é como a linha aparece na tela. Nome do cliente, do órgão, do
  arquivo — nunca um `cuid`.
- **`mensagem`** é obrigatória quando o item não terminou bem. É o que o
  operador lê para saber o que fazer.
- **O que foi deliberadamente não feito também é item** (`IGNORADO`), com o
  motivo. Silêncio não se distingue de falha.

### 2. Registrar no fim de cada item, não no fim da rodada

O item é gravado assim que termina. Se a execução morrer no meio, o que já foi
processado continua visível. Acumular tudo em memória e gravar no fim apaga
exatamente a parte que interessa quando algo dá errado.

### 3. Toda tentativa contra sistema externo é persistida

Não só a que deu certo. Hora, erro e a resposta bruta — é o que permite,
semanas depois, entender que o portal mudou de layout. Ver `ConsultaTentativa`
no SC-02.

### 4. Produziu algo? Vira artefato

O enunciado pede saída visível: *"tabela, painel, arquivo para download, ou o
registro do que foi enviado"*. Contagem no resumo é afirmação, não registro.

| Tipo | Quando usar | Exemplo no projeto |
|------|-------------|--------------------|
| `REGISTRO_DE_ENVIO` | O módulo comunicou algo | SC-20: as mensagens da rodada, com destinatário |
| `ARQUIVO` | O módulo gerou um arquivo | SC-02: a captura da tela do portal · SC-01: o OFX |
| `TABELA` | O módulo produziu dados para conferência | SC-01: os lançamentos extraídos |

Artefato de imagem (`mimeType: "image/png"`, `conteudo: { base64 }`) é renderizado
na tela. Os demais aparecem como JSON legível.

### 5. Erro é produto

Mensagem legível no item e na execução; stack trace em `detalheTecnico`, que
**só o administrador vê**, recolhido. Nunca o contrário.

### 6. O resumo é uma frase com números

Aparece na listagem e é a primeira coisa que se lê:

```
15 certificados · 12 na janela de 60 dias · 11 avisados · 0 suprimidos
48 consultas · 27 regulares · 12 irregulares · 9 sem resposta
```

---

## O caso especial do RPA: prova visual

Para os módulos de natureza RPA, o painel mudando é evidência **indireta**. O
que fecha o argumento é o navegador operando o sistema.

O SC-02 tem dois adapters atrás do mesmo port:

- **`orgao-http`** roda na nuvem, porque função serverless não tem navegador;
- **`orgao-playwright`** abre a página, digita o CNPJ, clica em consultar, lê o
  resultado — e **captura a tela**, que vira artefato da execução.

```bash
npm run dev              # o portal serve os órgãos simulados
npm run rpa:sc-02 -- --ver   # navegador visível, para demonstrar ao vivo
```

A execução entra no mesmo histórico, com `origem = PLAYWRIGHT` nas tentativas e
as capturas anexadas. Deixa de ser "o robô diz que consultou".

**Módulo novo de natureza RPA deve seguir o mesmo padrão:** um adapter de
transporte para a nuvem, um adapter de navegador para a demonstração, e a
captura como artefato.

---

## Checklist para um módulo novo

- [ ] Um `ExecucaoItem` por unidade de trabalho, com `referencia` legível
- [ ] Item gravado ao terminar, não no fim da rodada
- [ ] O que foi pulado aparece como `IGNORADO` com motivo
- [ ] Falha tem mensagem que diz ao operador o que fazer
- [ ] Toda tentativa contra sistema externo persistida, inclusive as que falharam
- [ ] O que foi produzido vira `Artefato`
- [ ] Resumo com números
- [ ] Se for RPA: adapter de navegador + captura de tela
- [ ] A tela do módulo mostra o **estado atual**; `/execucoes/[id]` mostra **o que aconteceu**

---

## Onde olhar, na ordem, para conferir um módulo

1. `/execucoes` — a rodada existe, com data, duração e quem disparou?
2. Clicar na data → `/execucoes/[id]` — os itens estão lá, um por unidade?
3. Mesma tela, "o que foi produzido" — o artefato está lá?
4. `/modulos/SC-XX` — o estado do domínio mudou?
5. Rodar de novo — o comportamento é o esperado na segunda vez?

O passo 5 é o mais revelador: no SC-20, a segunda rodada não comunica nada e
registra as supressões; no SC-02, uma falha não apaga a leitura anterior.
