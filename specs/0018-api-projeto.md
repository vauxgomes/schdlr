---
id: 0018
title: Projeto
status: todo
depends_on: [0014, 0016, 0023]
---

## Objetivo

A execução de um currículo num período letivo — o container onde o horário vai ser montado.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — model `Project`, enum `ProjectStatus`, e as três FKs compostas que ele carrega
- `specs/0014-api-curriculo.md` e `specs/0016-api-periodo.md`

## Escopo

**Entra:**

- CRUD de projeto sob a unidade
- Criação amarrando `Term` + `Curriculum`, com `createdBy` preenchido pelo membro logado
- Transição de `status` entre `DRAFT` e `PUBLISHED`, em endpoint próprio
- Listagem filtrável por período e por currículo

**Não entra:**

- Ofertas, quadros e slots — é onde entram as regras de conflito, e isso ganha desenho próprio antes de virar spec
- Duplicar projeto de um período para o outro

## Decisões já tomadas

- **Um currículo é executado uma vez por período.** O unique `[termId, curriculumId]` está no schema de propósito; turnos diferentes se resolvem com boards de grades diferentes dentro do mesmo projeto, não com projetos paralelos. Conflito responde 409.
- **`status` nasce `DRAFT`** e muda por endpoint próprio, como em `Term`.
- **Publicar não é só trocar o status.** `DRAFT → PUBLISHED` é o ponto em que o
  horário do projeto passa a disputar professor e sala com os outros projetos
  do mesmo período, e por isso a transição é o gancho do motor de conflito.
  Quando a 0018 rodar não haverá o que validar — `Offer`, `Board` e `BoardSlot`
  ainda não existem — então ela entrega a transição e o lugar onde a validação
  entra, e não uma validação vazia fingindo que valida. O motor tem spec
  própria, que precisa fechar **antes** das três: o desenho e as decisões em
  aberto estão no `README` de `specs/`.
- **Mutação de projeto exige período editável.** Criar, editar, mudar status e
  excluir só acontecem com o `Term` em `PLANNING` ou `ADJUSTMENTS`. `STARTED`
  congela: quem precisa mexer reabre o período (`STARTED → ADJUSTMENTS`, spec
  0023) e mexe com isso registrado na trilha. `FINISHED` e `CANCELLED` não
  aceitam nada — os dois significam a mesma coisa aqui, período encerrado, e o
  que muda entre eles é só a decisão que levou até lá. Conflito responde 409, e
  a checagem vem antes de qualquer escrita.
- **A trava é a mesma para `Board`, `Offer` e `BoardSlot`** quando essas specs
  existirem. Por isso ela nasce como função compartilhada, e não como um `if`
  no service de projeto: cinco cópias da mesma regra é como ela começa a
  divergir.
- **A exceção é membro de projeto.** Adicionar e remover `ProjectMember`
  funciona em qualquer status do período, inclusive `FINISHED` e `CANCELLED`:
  dar ou tirar acesso a alguém não move aula nenhuma. Vale para a spec 0019.
- **`createdById` é o `UnitMember` do usuário logado**, resolvido pelo guard; nunca vem do corpo.
- **`unitId` vem da rota** e é o mesmo usado nas três FKs compostas. Se o `Term` ou o `Curriculum` forem de outra unidade, o banco recusa — mas o service deve checar antes e responder 404 tratado, em vez de deixar vazar erro de constraint.
- Criar e alterar exige `assertCoordinatorOrOwnership`; ler, `assertMemberOrOwnership`.

## Critérios de aceite

- [ ] Criar projeto para o mesmo `(term, curriculum)` duas vezes responde 409
- [ ] Criar projeto em período `FINISHED` responde 409
- [ ] Criar projeto em período `STARTED` responde 409
- [ ] Editar projeto em período `STARTED` responde 409
- [ ] Reaberto o período (`STARTED → ADJUSTMENTS`), a mesma edição é aceita
- [ ] Passar `curriculumId` de outra unidade responde 404 tratado, não erro de banco
- [ ] `createdById` ignora o que vier no corpo e usa o membro logado
- [ ] Update genérico não altera `status`
- [ ] TEACHER lê mas não cria

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
