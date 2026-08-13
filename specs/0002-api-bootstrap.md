---
id: 0002
title: Bootstrap da aplicação
status: done
depends_on: [0001]
---

## Objetivo

A aplicação sobe com validação de entrada, leitura de ambiente e as peças que todo módulo seguinte assume existir.

## Contexto necessário

- `apps/api/src/main.ts` e `apps/api/src/app.module.ts` — o que o scaffold deixou
- `apps/api/.env.example` — variáveis já previstas
- `.claude/rules/code-quality.md`

## Escopo

**Entra:**

- `ConfigModule` global com validação do ambiente por Zod, falhando no boot se faltar variável
- `ZodValidationPipe` próprio, aplicado globalmente
- `cookie-parser`, CORS com `credentials: true`, `PORT` vindo do ambiente
- Filtro de exceção que padroniza o corpo de erro (`{ statusCode, message }`)
- `GET /health` com status do processo e do banco (pedido durante a execução)
- Testes das peças acima (pedido durante a execução)

**Não entra:**

- Autenticação e guards (spec 0003)
- Rate limiting

## Decisões já tomadas

- **Zod, não class-validator.** DTOs são schemas Zod com o tipo inferido; nada de decorators de validação. `@nestjs/mapped-types` não entra.
- **Pipe próprio, não `nestjs-zod`.** São ~15 linhas; não vale mais uma dependência.
- **Sem prefixo global `/api`.** O nginx faz `proxy_pass http://api:3001/` com barra final, que já remove o `/api/`. Adicionar prefixo aqui duplicaria o segmento.
- **A app escuta em `3001`**, como o nginx e o web esperam.
- Erro de validação responde **400 com a lista de issues do Zod**, não a exceção crua.

## Critérios de aceite

- [x] Subir sem `DATABASE_URL` falha no boot com mensagem clara, não em runtime
- [x] Um body inválido responde 400 com os campos que falharam
- [x] Um body com campos a mais é rejeitado ou tem os extras removidos (decidir e registrar qual)
- [x] `GET /` responde na porta 3001
- [x] Cookies chegam ao request (`req.cookies`)
- [x] `GET /health` responde 200 com o banco de pé e 503 com ele fora
- [x] Cada peça acima tem teste automatizado, sem depender de banco

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test
pnpm --filter @schdlr/api test:e2e
pnpm build:api
```

## Registro

Verificação (`tsc --noEmit`, `lint`, `build:api`) passou. Comportamento conferido com a app de pé: `/` e `/health` na 3001, preflight de CORS devolvendo `Access-Control-Allow-Credentials: true`, e `/health` alternando 200 ↔ 503 ao parar e religar o container do Postgres (reconecta sozinho, sem restart da app).

- **commits:** `feat(api): bootstrap da aplicação (spec 0002)` — branch `feature/migration-inicial`
- **decisão pendente da spec:** **campos a mais são removidos, não rejeitados.** É o comportamento padrão do `z.object()`; rejeitar exigiria `.strict()` em todo schema. O corpo que chega ao handler só tem o que o schema declara.
- **desvios:**
  - **`@Validate(schema)` no lugar de pipe global.** Pipe do Nest não enxerga metadata de rota — `PipeTransform.transform` recebe só `(value, ArgumentMetadata)`, sem `ExecutionContext`, logo sem `Reflector`. O `ZodValidationPipe` é o da spec; o que muda é que ele chega na rota por um decorator composto (`UsePipes`), e não por registro global. O pipe ignora argumento que não seja `body`, já que `UsePipes` alcança `@Param` e `@Query` também.
  - **`GET /health` entrou fora do escopo original**, pedido durante a execução. Módulo em `src/modules/health/`. Quando a spec 0003 subir o guard global de JWT, esta rota precisa de `@Public()`.
  - **Duas variáveis novas de ambiente:** `NODE_ENV` e `CORS_ORIGIN` (esta com default `http://localhost:3000`, porque `credentials: true` proíbe origem `*`). `.env` e `.env.example` reorganizados por seções.
  - **Corpo de erro tem um terceiro campo em falha de validação:** `{ statusCode, message, issues }`. Sem `issues` não dava para atender o critério de responder com os campos que falharam. O campo `error` do corpo padrão do Nest foi descartado.
  - **`import 'dotenv/config'` saiu do `main.ts`**, como a 0001 previu: `ConfigModule.forRoot` carrega e valida o ambiente de forma síncrona, antes de qualquer provider ser instanciado.
  - **Testes entraram fora do escopo original**, pedidos durante a execução: 15 unitários (`env`, pipe, filtro, `HealthService`) e 6 e2e da montagem HTTP. Nenhum precisa de banco — o `HealthService` recebe um `$queryRaw` falso e o e2e usa um controller de sonda no lugar do `AppModule`.
  - **`configureApp` extraído para `src/app.setup.ts`.** O `cookie-parser`, o CORS e o filtro global estavam dentro de `bootstrap()`, fora do alcance de qualquer teste; um e2e teria que reproduzir a montagem à mão e passaria a testar uma cópia, não o que roda em produção.
  - **Convenção de idioma registrada em `.claude/rules/code-quality.md`** (código em inglês; comentário explicativo de mais de uma linha em português), aplicada aos arquivos desta spec. O `schema.prisma` ainda tem comentários curtos em português, de antes da regra — não foram tocados.
