---
id: 0003
title: Cadastro e autenticação
status: todo
depends_on: [0002]
---

## Objetivo

Uma pessoa cria conta, entra, permanece logada e sai.

## Contexto necessário

- `apps/api/prisma/schema.prisma` — models `User`, `RefreshToken`, `Subscription`
- `.claude/rules/code-quality.md`

## Escopo

**Entra:**

- `POST /auth/register` — cria `User` + `Subscription` TRIAL na mesma transação
- `POST /auth/login` — devolve access token no corpo e refresh token em cookie
- `POST /auth/refresh` — rotaciona o refresh token
- `POST /auth/logout` — revoga o refresh token e limpa o cookie
- `JwtStrategy` + `JwtAuthGuard`, guard aplicado globalmente com decorator `@Public()` para abrir rotas

**Não entra:**

- Recuperação de senha (spec 0005)
- Alteração de perfil e troca de senha (spec 0006)
- Permissões por unidade (spec 0008)
- Seleção de unidade após o login — é navegação, não autenticação
- Gestão de plano além de criar o TRIAL

## Decisões já tomadas

- **bcrypt com custo 10** para a senha.
- **Access token curto em memória no cliente; refresh token em cookie HttpOnly.** O cliente nunca guarda o refresh em JS.
- **O refresh token vai para o banco como SHA-256**, nunca em claro — o schema já documenta isso no campo `token`.
- **Rotação a cada uso:** o refresh consome o token antigo (marca `revokedAt`) e emite outro. Reuso de token revogado é sinal de vazamento.
- **`staffRole` entra no payload do JWT**, para as rotas administrativas não precisarem consultar o banco a cada request. É um papel global do usuário, não de tenant.
- **Tenant não entra no token.** O payload leva `sub` e `staffRole` e nada de unidade ou papel de unidade; escolher unidade não reemite token. O contexto vem do `unitId` da rota e é resolvido por request pelo `UnitMemberGuard` (spec 0008). Três razões: o assert de service precisa de `roles` e `isActive` frescos, então a consulta aconteceria de qualquer forma e o claim seria dado duplicado; desativar membro ou tirar papel passaria a valer só na expiração do token, justamente onde atraso dói mais; e um único token com tenant embutido quebra duas abas em unidades diferentes e mata deep link. A tela de escolha de unidade é navegação, não autenticação — consome `GET /units/select` e some quando a pessoa só tem uma unidade. Onde a pessoa cai depois do login é preferência do usuário, não claim.
- **Login não diz qual campo errou.** Credencial inválida é sempre a mesma resposta, para não confirmar existência de e-mail.
- **Guard global com `@Public()`**, e não guard por rota: esquecer de proteger é pior do que esquecer de abrir.

## Critérios de aceite

- [ ] Registro com e-mail repetido responde 409
- [ ] Login correto devolve access token e grava o cookie de refresh
- [ ] Login errado responde 401 com a mesma mensagem para e-mail inexistente e senha errada
- [ ] `/auth/refresh` com token válido devolve novo par e invalida o anterior
- [ ] `/auth/refresh` com token já usado responde 401
- [ ] Rota sem `@Public()` responde 401 sem token
- [ ] O hash da senha nunca aparece em nenhuma resposta
- [ ] O payload do JWT tem `sub` e `staffRole` e nenhum dado de unidade

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
