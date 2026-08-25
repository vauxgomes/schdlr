---
id: 0007
title: Organização
status: done
depends_on: [0003]
---

## Objetivo

Um usuário cria e administra suas organizações — o topo da hierarquia de tenant.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `Organization` e a relação `owner`
- `.claude/rules/code-quality.md` — estrutura de módulo e endpoints

## Escopo

**Entra:**

- CRUD de organização
- `GET /organizations` lista só as do usuário logado
- `GET /organizations/select` com a forma mínima
- Slug gerado a partir do nome, com unicidade garantida

**Não entra:**

- Unidades (spec 0008)
- Transferência de titularidade
- Membros no nível da organização — a titularidade hoje é uma FK única, e virar `OrganizationMember` é decisão em aberto

## Decisões já tomadas

- **Quem cria vira `owner`.** É uma FK direta em `Organization`, não uma tabela de membros — o modelo de membership no nível da organização foi discutido e adiado.
- **Slug único global**, não por usuário, porque ele aparece na URL.
- **O owner é a única autoridade** sobre a organização nesta spec. Papéis de unidade não dão acesso a ela.
- **Excluir organização com unidades é bloqueado** (409), não cascateado.
- `@Get('select')` declarado **antes** de `@Get(':id')`, senão a rota é engolida.

## Critérios de aceite

- [x] Criar organização define o usuário logado como owner
- [x] A listagem não devolve organização de outro usuário
- [x] Slug repetido responde 409
- [x] Alterar organização de outro usuário responde 403
- [x] Excluir organização com unidade responde 409

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test:all
pnpm build:api
```

## Registro

Executada em modo `/spec next`, com commit automático. 25 unitários e 52 e2e passando; os cinco critérios têm teste em `test/organizations.e2e-spec.ts`.

- **commits:** `feat(api): módulo de organizações (spec 0007)` — branch `feature/organizacao`
- **ambiguidade resolvida:** o escopo pedia "slug gerado do nome, **com unicidade garantida**", o que sugeriria sufixar (`-2`) até não colidir; mas o critério de aceite manda **slug repetido responder 409**, que nunca ocorreria com sufixo automático. Segui o critério: o slug é derivado sem sufixo e a colisão vira 409. Como o slug é global, isso significa que dois usuários não podem ter organizações de mesmo nome.
- **desvios:**
  - **O slug não acompanha a troca de nome.** Renomear a organização mantém o slug de criação: ele está na URL, e reescrevê-lo quebraria todo link já compartilhado. A spec não dizia.
  - **404 antes de 403.** Organização inexistente responde 404; existente de outro dono responde 403, como o critério exige. Isso confirma existência de id para quem tentar adivinhar — aceitável porque id é cuid, não sequencial.
  - **`slugify` em `src/common/slug.ts`**, sem dependência: normaliza NFD, remove diacrítico, colapsa não-alfanumérico. Testado com acento e travessão.
  - **Helper `registerAndLogin` em `test/support/auth.ts`.** Terceiro arquivo de teste a precisar de sessão autenticada; cria pela rota real em vez de inserir linha na mão, para o token ser um que o guard aceite de verdade.
