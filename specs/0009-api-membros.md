---
id: 0009
title: Membros da unidade
status: done
depends_on: [0008]
---

## Objetivo

Gerir quem participa de uma unidade e com quais papéis.

## Escopo

**Entra:**

- Listar membros da unidade, com filtro por papel e por atividade (só os ativos por padrão)
- `PATCH .../members/:memberId/roles` — alterar papéis, só de membro ativo
- `PATCH .../members/:memberId/status` — ativar e desativar
- `GET /units/:unitId/members/select` — usado para escolher professor mais adiante

**Não entra:**

- Criar membro diretamente: membro nasce de convite aceito (spec 0010)
- Excluir membro — ver decisão

## Decisões já tomadas

- **Não se exclui membro, desativa.** Ele tem histórico pendurado (projetos criados, ofertas); apagar deixaria buracos. `isActive: false` já é o que os asserts checam.
- **Pelo menos um papel é obrigatório** — validado no service, porque o array vazio o banco aceita.
- **Ninguém remove o próprio acesso administrativo.** Um ADMIN não pode se rebaixar nem se desativar, senão a unidade pode ficar sem administrador.
- **Gerir membros exige `assertManagement`** — listar e alterar. O `select` não: é dele que sai a lista de professores para montar oferta, trabalho de coordenação, então basta `assertMemberOrOwnership`.
- **Papel e ativação são endpoints separados.** São transições diferentes: uma muda o que a pessoa pode fazer, a outra se ela participa. Juntar as duas num `PATCH` só esconderia que alterar papel de membro desativado não quer dizer nada.
- **Alterar papéis de membro desativado responde 409**, pedindo reativação antes. Guardar papel para quando voltar deixaria o estado ambíguo.
- Ativar/desativar emite notificação (`MEMBER_ACTIVATED` / `MEMBER_DEACTIVATED`), consumida na spec 0011.

## Critérios de aceite

- [x] COORDINATOR não consegue alterar papéis
- [x] Tentar salvar membro sem nenhum papel responde 400
- [x] ADMIN não consegue remover o próprio papel de ADMIN
- [x] Membro desativado deixa de passar nos asserts imediatamente
- [x] O select devolve só `{ id, name }` e afins, sem dados do usuário além do necessário
- [x] A listagem devolve só ativos por padrão, e os inativos quando pedido
- [x] Alterar papéis de membro desativado responde 409

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test:all
pnpm build:api
```

## Registro

Executada em modo `/spec next`, com commit automático. 25 unitários e 79 e2e passando; os cinco critérios têm teste em `test/members.e2e-spec.ts`.

- **commits:** `feat(api): membros da unidade (spec 0009)` — branch `feature/membros-unidade`
- **desvios:**
  - **Proteger o próprio acesso responde 409, não 403.** Quem tenta tem permissão de sobra — o que falta é o estado permitir. 403 se confundiria com os asserts.
  - **Nome do evento pelo fato de domínio** (`unit-member.active-changed`), e não pelo canal, ao contrário dos `mail.*` da 0004. O payload carrega o `NotificationType` que a spec nomeou. É a pendência que o registro da 0004 já previa; **a 0011 deve confirmar ou renomear**, e se confirmar, vale renomear os `mail.*` por consistência.
  - **Evento emitido sem ouvinte.** Nada escuta `unit-member.active-changed` até a 0011. É inofensivo e é o desacoplamento que o projeto escolheu, mas até lá desativar um membro não notifica ninguém.
  - **O pipe de validação passou a aceitar alvo** (`body` ou `query`), para a listagem validar o filtro com Zod como qualquer corpo. Usado como pipe de parâmetro no `@Query`, e não via `@Validate`: aquele decorator ocupa o `UsePipes` do handler, que é único, e corpo e query brigariam pelo mesmo lugar. Arquivo da 0002, sem mudar endereço nem decisão.
  - **`active` no filtro não usa `z.coerce.boolean()`**, que faria a string `'false'` virar `true` — mesma armadilha registrada na 0004 para `SMTP_SECURE`.
  - **Papel obrigatório validado no service**, como a spec decidiu, e não no schema Zod — que também conseguiria. Mantive a decisão porque o service é alcançado por outros caminhos além do corpo HTTP.
