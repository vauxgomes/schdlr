---
id: 0020
title: Estratégia de testes
status: todo
depends_on: [0002]
---

## Objetivo

Existe um jeito único de testar um módulo, e testar isolamento de tenant não custa uma tarde de encanamento por spec.

## Por que antes da 0003

A 0002 deixou testes das peças compartilhadas, mas todos rodam sem banco. A partir da 0003 entra o que quebra em silêncio: token que não expira, guard que deixa passar, `where` sem `unitId`. Nada disso se prova com mock — precisa de banco de verdade. Sem essa spec, cada módulo inventa o seu, e as 17 specs seguintes herdam a bagunça.

## Contexto necessário

- `apps/api/package.json` — scripts `test` e `test:e2e`, config do jest
- `apps/api/test/jest-e2e.json` e `apps/api/test/bootstrap.e2e-spec.ts` — o e2e sem banco que a 0002 deixou
- `apps/api/src/infra/database/database.service.ts` — como a conexão é montada
- `docker-compose.yml` — o serviço de Postgres
- `.claude/rules/code-quality.md`

## Escopo

**Entra:**

- Banco de teste separado, criado e migrado por script, com as migrations do Prisma
- Helper que sobe a app de teste com o `configureApp` real e devolve o `DatabaseService` apontando para o banco de teste
- Limpeza entre testes (truncate das tabelas, não recriação do schema)
- Factories mínimas para o caminho comum: usuário, organização, unidade, membro com papel
- Script único que roda tudo (`test:all` ou equivalente) e o que o CI vai chamar
- Uma regra escrita sobre o que exige teste e o que não exige

**Não entra:**

- Meta numérica de cobertura
- Testes de carga ou performance
- CI propriamente dito (arquivo de workflow) — aqui só o script que ele chamaria
- Reescrever os testes que a 0002 já deixou

## Decisões já tomadas

- **Banco de teste real, não mock do Prisma.** O que se quer provar — FK composta barrando cruzamento de unidade, unique de slug, cascade — é comportamento do Postgres. Mock testaria o mock.
- **Um banco separado no mesmo container**, não um segundo serviço no compose nem testcontainers. Migrations aplicadas com `prisma migrate deploy`.
- **Truncate entre testes, não `migrate reset`.** Recriar o schema a cada arquivo torna a suíte lenta o bastante para ninguém rodar.
- **Teste de service com banco; teste de controller por e2e.** Assert de permissão é regra de service e é lá que se prova.
- **Sem meta de cobertura.** O critério é qualitativo: toda regra que, se quebrada, passaria despercebida em code review precisa de teste. Isso inclui todo `assert*` de permissão e todo `where` que carrega `unitId`.

## Critérios de aceite

- [ ] `pnpm test:e2e` sobe, migra e limpa o banco de teste sem passo manual
- [ ] O banco de desenvolvimento não é tocado ao rodar a suíte
- [ ] Um teste de exemplo prova que a FK composta recusa filho de outra unidade
- [ ] Um teste de exemplo prova o caminho de permissão negada num service
- [ ] Rodar a suíte duas vezes seguidas dá o mesmo resultado (sem resíduo entre execuções)
- [ ] A regra do que exige teste está em `.claude/rules/`, não só nesta spec

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test
pnpm --filter @schdlr/api test:e2e
```

## Registro

_Preenchido durante a execução._

- **commits:**
- **desvios:**
