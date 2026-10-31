# Specs

Uma spec por vez. Cada uma é autocontida: uma sessão nova consegue executá-la lendo só
aquele arquivo e o que ele lista em "Contexto necessário".

## Uso

```
/spec          # lista e sugere a próxima executável
/spec 0000     # executa a 0000
```

## Regras

- **Uma spec = uma sessão = um commit de implementação.** Se transbordar, a spec estava grande demais — divida.
- A spec é commitada **antes** da implementação (`docs(spec): ...`); a implementação referencia o id (`chore(infra): ... (spec 0000)`).
- **Spec `done` não se edita.** Requisito novo é spec nova, senão o registro vira ficção. Mudança posterior que invalide o que ela decidiu vira nota datada no fim do arquivo (append-only).
- **Nome do arquivo: `NNNN-<área>-<slug>.md`.** O id é uma sequência global única, não uma por área. Áreas: `infra`, `api`, `web`.
- `specs/` é versionado.
- **Migrations são geradas pelo Prisma** (`prisma migrate dev`) a partir do `schema.prisma`. Não se escreve nem se edita `migration.sql` à mão, nem via `--create-only`, a não ser que seja estritamente necessário — e aí a spec diz por quê, ou o agente para e pergunta. Regra de integridade que o schema do Prisma não expressa (CHECK, exclusion constraint, índice parcial) fica na aplicação.

## Contexto

`schdlr` é um monorepo pnpm com dois apps: `apps/api` (NestJS, TypeScript) e `apps/web`
(React, TypeScript). O repositório nasce na spec 0000 sem nenhum dos dois inicializados — só
o encanamento da raiz (workspace, scripts, CI, compose). Os boilerplates entram em specs
próprias.

**Scripts da raiz apontam para pacotes que ainda não existem.** `@schdlr/api` só passa a
existir quando `apps/api/package.json` for criado. Até lá, `pnpm --filter` não casa com nada.
Ver a spec 0000, "Decisões já tomadas".

## Contratos em vigor

O que as specs já entregues decidiram e as próximas herdam. Cada item aponta para onde está a
decisão; em caso de dúvida, vale a spec (e o Registro dela), não este resumo.

**API**

- Pastas, aliases (`@common`, `@config`, `@infra`, `@modules`, `@shared`) e `strict: true`; import
  relativo só dentro do mesmo módulo (0001)
- Env validado na partida pelo `envSchema`; variável nova entra no schema com a spec que a lê.
  Nenhum `process.env` fora de `src/config/`, `prisma.config.ts` e `prisma/seed.ts` (0001)
- `configureApp(app)` em `src/app.setup.ts` é a configuração da app; o `main.ts` e os e2e chamam o
  mesmo (0004)
- Toda rota exige JWT, salvo `@Public()`. Rota inexistente dá `404`, não `401` (0001)
- `@RequireSystemRole('SUPPORT' | 'MASTER')` exige papel mínimo; o papel é lido do banco a cada
  requisição. `MASTER` conta como `SUPPORT` (0006)
- `@CurrentUser()` devolve só `{ sub }`; quem precisa do usuário consulta o banco e trata
  inexistente ou inativo como `401` (0004)
- Validação: `ZodValidationPipe` por parâmetro, `400` `VALIDATION_FAILED` com
  `errors: [{ path, code, message, params? }]`; `code` do item é o do issue do Zod, ou o de
  `params.code` num `custom` (0001, 0008). `emailSchema` e `nameSchema` de
  `auth/schemas/auth.schemas.ts` são reaproveitados (0004, 0007)
- Corpo de erro: sempre `{ statusCode, code, message }`, com `params` e `errors` só quando há;
  nunca o campo `error`. `code` é contrato, `message` não. Montado pelo `AppExceptionFilter`,
  registrado no `configureApp`; erro não tratado vira `500 INTERNAL_ERROR` sem detalhe (0008)
- Erros de regra: `throw new AppException('CODIGO', params?)`, com status e mensagem do catálogo
  `src/common/errors/error-codes.ts`. Spec que cria erro novo acrescenta o código ao catálogo e o
  lista numa tabela própria; códigos de domínio são específicos (0008)
- O `GET /api/health` fica de fora: o `503` mantém o corpo do terminus (Registro da 0008)
- E-mail: só pelo `MailService` (`send` ou um `sendX` com modelo em `templates/`); o corpo nunca
  vai para o log (0003)

**Plano e organização**

- `getActivePlan(userId)` dá plano, status e limites, ou `null` sem assinatura. Limites em
  `subscriptions/plans.ts` e contam registros **desativados** (0006)
- Escrita em dado de organização exige o plano **do dono** `ACTIVE`; vencido lança
  `PlanExpiredException` (`403 "Plan expired"`). Sem assinatura não se cria organização
  (`403 "Subscription required"`). Leitura sempre liberada (0006)
- Regras que o schema não expressa e que cada endpoint de escrita tem de validar: tabela "Regras
  que ficam com a aplicação" da 0002
- Dado de unidade mora sob `/api/organizations/:orgSlug/units/:unitSlug`. O `TenantAccessService`
  (exportado pelo `TenancyModule`, em `modules/tenancy/`) resolve o acesso: `resolveOrganization`/`resolveUnit`
  dão `404` a quem não enxerga (e a slug fora do formato), sem checar papel; quem chama decide e
  lança `AppException('NOT_ALLOWED')`. Toda escrita chama `assertWritable(access)`: organização
  inativa → `409`, unidade inativa → `409`, plano do dono ausente ou vencido → `PLAN_EXPIRED`.
  `{ reactivating: true }` dispensa só o `409` da própria entidade (0009)
- Enxerga a organização o dono ou membro de unidade ativa dela; desativada, só o dono. O papel é
  lido do banco a cada requisição (0009)
- Contar contra o limite do plano e criar numa transação, com a linha-pai travada (`FOR UPDATE`);
  `P2002` no create vira o `409` do slug (`isUniqueViolation` em `@infra/database/prisma-errors`).
  `slugSchema` em `tenancy/schemas/`, `addressSchema` em `organizations/schemas/` (0009)
- Membros (`modules/members/`) e convites (`modules/invitations/`) da unidade: só o dono cria,
  promove ou remove responsável; o responsável cuida do resto. `EXPIRED` do convite é calculado na
  leitura. Token opaco (convite, refresh) por `generateOpaqueToken`/`hashOpaqueToken` de
  `@common/crypto/opaque-token`: no banco, só o SHA-256 (0010)
- Cursos em `modules/courses/`: o dono e o responsável gerenciam o curso; o catálogo de um curso
  (currículos, disciplinas) é do dono, do responsável e do coordenador **daquele** curso; todo
  membro da unidade lê o catálogo, inclusive o desativado. O `CourseAccessService` (exportado pelo
  `CoursesModule`) dá `resolveCourse` (`404 COURSE_NOT_FOUND` para curso de outra unidade ou id que
  não é cuid, sem checar papel; devolve `isCoordinator`, `canManageCourse`, `canManageCatalog`) e
  `assertCatalogWritable` (o `assertWritable` da unidade e, depois, `409 COURSE_INACTIVE`;
  `{ reactivating: true }` dispensa só o do curso). `codeSchema` em `courses/schemas/`. Quem sai
  da unidade deixa de coordenar os cursos dela (0011)
- Currículos em `modules/curricula/`, escritos por quem tem `canManageCatalog`. O
  `CurriculumAccessService` (exportado pelo `CurriculaModule`) dá `resolveCurriculum` (`404
CURRICULUM_NOT_FOUND` para currículo de outro curso ou id que não é cuid) e
  `assertCurriculumWritable` (o `assertCatalogWritable` e, depois, `409 CURRICULUM_INACTIVE`).
  Currículo sem projeto se apaga, com as disciplinas; em uso, `409 CURRICULUM_IN_USE`, também pelo
  `P2003` (`isForeignKeyViolation` em `@infra/database/prisma-errors`) (0012)
- Locais em `modules/locations/`: o dono e o responsável escrevem; todo membro da unidade lê,
  inclusive os desativados. Local sem célula se apaga; alocado, `409 LOCATION_IN_USE`. **O que as
  próximas specs herdam:** local desativado não recebe alocação nova (as que existem ficam e
  continuam valendo para o choque) — a spec de quadro aplica; `VIRTUAL` não é local físico e nunca
  gera choque de local — a spec de choque aplica; a célula só aloca local da unidade do projeto
  (0015)
- Um módulo por entidade, cada um na sua pasta e com os próprios schemas, mesmo quando os campos
  coincidem (organização e unidade: `modules/organizations/` e `modules/units/`). Para agrupar,
  pasta de módulos (nota da 0009)

**Testes e verificação**

- `pnpm test:api` roda sem `.env` e sem banco: unitários com o `DatabaseService` substituído; e2e
  com o `AppModule`, `configureApp` e os services substituídos. O env do e2e vem de
  `test/setup-env.ts` (0001, 0004)
- Nenhum teste envia e-mail de verdade (0003)
- Verificação contra o banco de dev: entrar com `pnpm otp <email>` e os usuários da seed (0004,
  0005), e no fim apagar o que o teste criou, devolvendo o banco ao estado da seed
- `pnpm db:reset` precisa de autorização explícita do usuário quando quem chama é um agente
  (Registro da 0002)
- Dependências na linha do NestJS 11. Pacote que só publica ESM não carrega no Jest (Registro da 0001)

## Índice

| id   | spec                                                                             | status  | depende de                   |
| ---- | -------------------------------------------------------------------------------- | ------- | ---------------------------- |
| 0000 | [Monorepo pnpm, CI e compose](0000-infra-monorepo-pnpm.md)                       | ✅ done | —                            |
| 0001 | [Boilerplate da API em NestJS](0001-api-boilerplate-nestjs.md)                   | ✅ done | 0000                         |
| 0002 | [Schema do domínio](0002-api-schema-do-dominio.md)                               | ✅ done | 0001                         |
| 0003 | [Envio de e-mail](0003-api-envio-de-email.md)                                    | ✅ done | 0001, 0002                   |
| 0004 | [Auth por OTP](0004-api-auth-por-otp.md)                                         | ✅ done | 0001, 0002, 0003             |
| 0005 | [Seed do master e do tenant de teste](0005-api-seed-master-e-tenant-de-teste.md) | ✅ done | 0002                         |
| 0006 | [Assinaturas e papel de suporte](0006-api-assinaturas-e-papel-de-suporte.md)     | ✅ done | 0002, 0004, 0005             |
| 0007 | [Perfil do usuário](0007-api-perfil-do-usuario.md)                               | ✅ done | 0004, 0006                   |
| 0008 | [Códigos de erro](0008-api-codigos-de-erro.md)                                   | ✅ done | 0001, 0004, 0006, 0007       |
| 0009 | [Organização e unidade](0009-api-organizacao-e-unidade.md)                       | ✅ done | 0002, 0004, 0005, 0006, 0008 |
| 0010 | [Membros e convites](0010-api-membros-e-convites.md)                             | ✅ done | 0003, 0004, 0008, 0009       |
| 0011 | [Cursos](0011-api-cursos.md)                                                     | ✅ done | 0008, 0009, 0010             |
| 0012 | [Currículos](0012-api-curriculos.md)                                             | ✅ done | 0011                         |
| 0013 | [Disciplinas](0013-api-disciplinas.md)                                           | ✅ done | 0012                         |
| 0014 | [Duplicação de currículo](0014-api-duplicacao-de-curriculo.md)                   | ✅ done | 0013                         |
| 0015 | [Locais](0015-api-locais.md)                                                     | ✅ done | 0008, 0009                   |
| 0016 | [Semestres](0016-api-semestres.md)                                               | ⬜ todo | 0008, 0009, 0011             |
