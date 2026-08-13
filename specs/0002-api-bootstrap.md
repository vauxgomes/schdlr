---
id: 0002
title: Bootstrap da aplicação
status: todo
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

- [ ] Subir sem `DATABASE_URL` falha no boot com mensagem clara, não em runtime
- [ ] Um body inválido responde 400 com os campos que falharam
- [ ] Um body com campos a mais é rejeitado ou tem os extras removidos (decidir e registrar qual)
- [ ] `GET /` responde na porta 3001
- [ ] Cookies chegam ao request (`req.cookies`)

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
