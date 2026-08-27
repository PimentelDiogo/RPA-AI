# SDD — Documentos de projeto das automações

Um diretório por automação do escopo congelado. Cada um contém:

| Arquivo | O que é |
|---------|---------|
| `SDD.md` | O documento de projeto: o que o enunciado pede, o que foi decidido, como está construído e **como rodar e testar** |
| `CLAUDE.md` | O recorte do contrato que vale dentro daquele módulo — o que não pode ser violado ao mexer nele |

| Automação | Natureza | Documento | Estado |
|-----------|----------|-----------|--------|
| **SC-01** — Conversão de extrato bancário para OFX | Agente de IA | [SC-01/SDD.md](SC-01/SDD.md) | Especificado |
| **SC-02** — Painel de situação fiscal dos clientes | RPA | [SC-02/SDD.md](SC-02/SDD.md) | **Implementado** (adapter Playwright pendente) |
| **SC-05** — Bloqueio e desbloqueio de inadimplentes | RPA | [SC-05/SDD.md](SC-05/SDD.md) | Especificado |
| **SC-20** — Vencimento de certificado digital | Controle sistematizado | [SC-20/SDD.md](SC-20/SDD.md) | **Implementado** |

O contrato geral do projeto — regras de entrega, identidade visual, catálogo completo
dos 20 processos — está em [`../CLAUDE.md`](../CLAUDE.md). Em qualquer divergência
entre um SDD e o enunciado em PDF, **o PDF vence**.

## O que todos os módulos herdam do núcleo

Nenhum SDD reimplementa isto — vem pronto de `src/lib/`:

| Peça | Onde | O que entrega |
|------|------|---------------|
| Autenticação e perfis | `src/lib/auth/` | Sessão real, `admin` vê tudo, `operador` vê só a área dele |
| Motor de execução | `src/lib/execucao/motor.ts` | `Execucao` → `ExecucaoItem` → `Artefato`, duração, autoria, status |
| Erro legível | `src/lib/execucao/erros.ts` | `ErroDeNegocio` vai para a tela; stack fica no banco |
| Histórico | `/execucoes` e a aba de cada módulo | Data, duração, quem disparou, resultado |
| Agendamento | `Agendamento` + `POST /api/scheduler/tick` | Rodar sozinho, sem ninguém logado |

Cada módulo implementa **apenas o seu handler** e as tabelas do seu domínio.

## Pré-requisitos comuns para testar qualquer módulo

```bash
cp .env.example .env     # ajuste AUTH_SECRET
npm install
npm run db:up            # Postgres local (porta 5433)
npm run db:migrate
npm run db:seed          # massa sintética
npm run dev              # http://localhost:3000
```

Contas de demonstração (senha `sheep2026` para todas):

| E-mail | Perfil | Enxerga |
|--------|--------|---------|
| `admin@sheepcontabil.com.br` | Administrador | Os quatro módulos |
| `processos@sheepcontabil.com.br` | Operador — Processos | SC-02 e SC-20 |
| `contabil@sheepcontabil.com.br` | Operador — Contábil | SC-01 |
