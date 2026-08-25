---
id: 0008
title: Unidade e camada de permissões
status: done
depends_on: [0007]
---

## Objetivo

Unidades existem sob a organização, e nasce a camada de permissão que **todos** os módulos seguintes vão usar.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — models `Unit`, `UnitMember`, enum `MemberRole`; e o cabeçalho, que explica a invariante de tenant
- `.claude/rules/code-quality.md` — a seção de permissões

## Escopo

**Entra:**

- CRUD de unidade sob a organização
- `UnitMemberGuard`: resolve o `UnitMember` a partir do usuário do JWT e do `unitId` da rota, e injeta o contexto no request
- Os três asserts que o resto do projeto usa: `assertMemberOrOwnership`, `assertCoordinatorOrOwnership`, `assertManagement`
- `GET /units/select`

**Não entra:**

- Gestão de membros (spec 0009) — aqui só o guard que os lê
- Convites (spec 0010)

## Decisões já tomadas

Esta spec é a mais importante do bloco: ela define o contrato de permissão que as onze specs seguintes assumem pronto.

- **O owner da organização tem acesso total às unidades dela**, sem precisar de linha em `UnitMember`. É o `isOwner` do contexto.
- **Papéis são array em `UnitMember`.** Um membro pode ser COORDINATOR e TEACHER ao mesmo tempo.
- **Assert no topo de todo método de service, antes de qualquer consulta.** Não confiar apenas no guard: o guard cobre a rota, o assert cobre a regra.
- **Membro inativo não é membro.** `isActive: false` não passa em nenhum assert.
- **Slug único por organização**, não global — duas organizações podem ter a unidade `centro`.
- **Criar unidade cria, na mesma transação, um `UnitMember` ADMIN para o dono da organização.** Sem isso o owner não teria linha de membro, e a 0018 — que define `Project.createdById` como "o `UnitMember` do usuário logado", num campo não-nulo do schema — ficaria sem como criar projeto. O `isOwner` continua no contexto como rede de segurança, mas deixa de ser o caminho normal.
- **Excluir unidade é bloqueado (409) quando houver membro ativo além do owner.** A regra original dizia "qualquer membro ativo", o que, somado à decisão acima, tornaria toda unidade indeletável desde o nascimento.
- Níveis: leitura usa `assertMemberOrOwnership`; mutação operacional usa `assertCoordinatorOrOwnership`; gestão (períodos, cursos, unidade) usa `assertManagement`.
- **O guard é global (`APP_GUARD`), como o de JWT, e só age onde a rota tem `:unitId`.** Sem o parâmetro ele passa direto. É o mesmo valor que a 0003 registrou: esquecer de proteger é pior do que esquecer de abrir — e são onze módulos seguintes onde daria para esquecer um `@UseGuards`.
- **Forma do contexto injetado**, que as onze specs seguintes consomem:
  ```ts
  type UnitContext = {
    unitId: string
    organizationId: string
    memberId: string | null // null só se o owner perder a linha de membro
    roles: MemberRole[] // vazio para quem não é membro ativo
    isOwner: boolean
  }
  ```
- **Os asserts recebem o contexto e lançam `ForbiddenException`**; não devolvem booleano. Assinatura: `assertX(context: UnitContext): void`.
- **Unidade inexistente responde 404 no próprio guard**, antes de qualquer assert — não faz sentido decidir permissão sobre o que não existe.
- **Rotas:** criar e listar ficam sob a organização (`/organizations/:organizationId/units`), onde a autoridade é o dono e ainda não há contexto de unidade. Ler, alterar, excluir e `select` ficam sob `/units`, que é onde o guard age.

## Critérios de aceite

- [x] Owner da organização acessa a unidade sem ser `UnitMember`
- [x] Não-membro e não-owner recebe 403
- [x] Membro com `isActive: false` recebe 403
- [x] TEACHER lê, mas não altera nada que exija coordenação
- [x] Slug repetido na mesma organização responde 409; em organização diferente, passa
- [x] Excluir unidade com membro ativo além do owner responde 409; sem outros membros, exclui
- [x] Criar unidade deixa o dono da organização como `UnitMember` ADMIN ativo
- [x] Rota sem `:unitId` não é afetada pelo guard
- [x] Unidade inexistente responde 404, não 403

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test:all
pnpm build:api
```

## Registro

25 testes unitários e 67 e2e passando; os nove critérios têm teste em `test/units.e2e-spec.ts`. As lacunas foram fechadas no próprio arquivo da spec **antes** da implementação, em commit separado.

- **commits:** `docs(spec): fecha as lacunas da 0008 antes de executá-la` e `feat(api): unidades e camada de permissões (spec 0008)` — branch `feature/unidade-permissoes`
- **desvios:**
  - **Dois controllers no mesmo módulo:** `OrganizationUnitsController` (`/organizations/:organizationId/units`, criar e listar) e `UnitsController` (`/units`, ler, alterar, excluir e `select`). A separação existe porque a autoridade muda: sob a organização quem manda é o dono, sob a unidade quem manda é o contexto do guard.
  - **Excluir unidade apaga os `UnitMember` junto**, na mesma transação. A FK não é cascade, e sobraria a linha do próprio dono impedindo o delete.
  - **A ordem dos dois guards globais é implícita**, e vem da ordem dos imports no `AppModule`: o `JwtAuthGuard` precisa resolver `request.user` antes do `UnitMemberGuard`. O guard devolve `true` quando não há usuário, então uma inversão não abriria acesso — mas deixaria o contexto vazio. Três testes quebram se alguém reordenar, o que é a rede que temos.
  - **`assertCoordinatorOrOwnership` nasce sem uso** nesta spec: nenhuma rota de unidade é mutação operacional. Ela existe porque a 0018 a exige, e criar as três juntas evita que a assinatura mude depois.
  - **`GET /units/select` devolve `organizationId` junto**, além de `{ id, name, slug }`: é a tela de escolha de unidade, e ela precisa saber a que organização cada uma pertence quando a pessoa alcança mais de uma.
