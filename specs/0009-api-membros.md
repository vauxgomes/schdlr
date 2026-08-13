---
id: 0009
title: Membros da unidade
status: todo
depends_on: [0008]
---

## Objetivo

Gerir quem participa de uma unidade e com quais papéis.

## Escopo

**Entra:**

- Listar membros da unidade, com filtro por papel
- Alterar papéis de um membro
- Ativar e desativar membro
- `GET /units/:unitId/members/select` — usado para escolher professor mais adiante

**Não entra:**

- Criar membro diretamente: membro nasce de convite aceito (spec 0010)
- Excluir membro — ver decisão

## Decisões já tomadas

- **Não se exclui membro, desativa.** Ele tem histórico pendurado (projetos criados, ofertas); apagar deixaria buracos. `isActive: false` já é o que os asserts checam.
- **Pelo menos um papel é obrigatório** — validado no service, porque o array vazio o banco aceita.
- **Ninguém remove o próprio acesso administrativo.** Um ADMIN não pode se rebaixar nem se desativar, senão a unidade pode ficar sem administrador.
- **Gerir membros exige `assertManagement`.**
- Ativar/desativar emite notificação (`MEMBER_ACTIVATED` / `MEMBER_DEACTIVATED`), consumida na spec 0011.

## Critérios de aceite

- [ ] COORDINATOR não consegue alterar papéis
- [ ] Tentar salvar membro sem nenhum papel responde 400
- [ ] ADMIN não consegue remover o próprio papel de ADMIN
- [ ] Membro desativado deixa de passar nos asserts imediatamente
- [ ] O select devolve só `{ id, name }` e afins, sem dados do usuário além do necessário

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
