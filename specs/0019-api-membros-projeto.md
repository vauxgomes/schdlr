---
id: 0019
title: Membros do projeto
status: todo
depends_on: [0018]
---

## Objetivo

Dar a outros membros da unidade acesso de edição a um projeto específico.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `ProjectMember`
- `specs/0018-api-projeto.md`

## Escopo

**Entra:**

- Adicionar e remover membro do projeto
- Listar membros do projeto
- Passar a considerar `ProjectMember` na autorização de edição do projeto

**Não entra:**

- Papéis dentro do projeto — participar é binário
- Transferir a autoria (`createdBy`)

## Decisões já tomadas

- **Participação é binária.** Quem está na lista edita o projeto; não há papel de leitor, porque qualquer membro da unidade já lê.
- **O criador não entra na lista.** Ele já tem acesso por `createdById`; duplicar geraria dois caminhos para a mesma permissão e a chance de removê-lo do próprio projeto. Tentar adicioná-lo responde 409.
- **Só membro ativo da unidade** pode ser adicionado.
- **Gerir a lista é do criador ou de quem tem `assertManagement`** — um assistente não adiciona outros assistentes.
- **Remover é `delete` de verdade**, não desativação: a linha não carrega histórico.
- Adicionar emite `PROJECT_ASSISTANT_ADDED` para o membro incluído.

## Critérios de aceite

- [ ] Adicionar o criador do projeto responde 409
- [ ] Adicionar o mesmo membro duas vezes responde 409
- [ ] Adicionar membro de outra unidade responde 404 tratado
- [ ] Adicionar membro inativo é rejeitado
- [ ] Membro do projeto consegue editar o projeto; membro comum da unidade, não
- [ ] Assistente não consegue adicionar outro assistente

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm build:api
```

## Registro

_Preenchido durante a execução._

- **commits:**
- **desvios:**
