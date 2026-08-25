---
id: 0003
title: Cadastro e autenticação
status: done
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

- [x] Registro com e-mail repetido responde 409
- [x] Login correto devolve access token e grava o cookie de refresh
- [x] Login errado responde 401 com a mesma mensagem para e-mail inexistente e senha errada
- [x] `/auth/refresh` com token válido devolve novo par e invalida o anterior
- [x] `/auth/refresh` com token já usado responde 401
- [x] Rota sem `@Public()` responde 401 sem token
- [x] O hash da senha nunca aparece em nenhuma resposta
- [x] O payload do JWT tem `sub` e `staffRole` e nenhum dado de unidade

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test:all
pnpm build:api
```

## Registro

17 testes unitários e 24 e2e passando; os 8 critérios têm teste próprio em `test/auth.e2e-spec.ts`. Conferido também contra a app real: registro 201, login devolvendo token e gravando o cookie, refresh 200, `/` e `/health` ainda abertos. Os dados do teste de fumaça foram removidos do banco de desenvolvimento.

- **commits:** `feat(api): cadastro e autenticação (spec 0003)` — branch `feature/autenticacao`
- **quebra:** `JWT_SECRET` é obrigatório e exige 32 caracteres ou mais. Quem já tinha `.env` precisa gerar o valor — o comando está no `.env.example`. Sem ele a app falha no boot, com o nome da variável na mensagem.
- **desvios:**
  - **Registro não faz login automático.** Responde 201 com `{ id, name, email, staffRole, createdAt }` e nada de token. A spec não pedia, e emitir sessão no cadastro é decisão de produto.
  - **`Subscription` TRIAL nasce sem `expiresAt`.** O default do schema já é TRIAL/ACTIVE, e definir prazo de trial é gestão de plano, que a spec exclui. Fica em aberto: hoje um trial não expira.
  - **Transação implícita, via nested write.** `user.create` com `subscription: { create: {} }` é uma transação só, sem `$transaction` explícito.
  - **Login recusa usuário inativo**, com a mesma resposta genérica. Não estava nos critérios, mas `isActive` existe no schema e deixar passar seria um buraco.
  - **Defesa de timing no login:** quando o e-mail não existe, o bcrypt roda mesmo assim contra um hash descartável. Sem isso a diferença de latência entrega quais e-mails têm conta, contra a decisão de não confirmar existência de e-mail.
  - **Reuso de refresh token revogado responde 401, e só.** A decisão registra que reuso é sinal de vazamento; a resposta padrão do mercado seria revogar toda a família de tokens do usuário. Não fiz porque não estava no escopo — vale uma spec própria junto com sessões ativas.
  - **Cookie com `path=/auth`**, então ele acompanha só `refresh` e `logout`, e não toda requisição.
  - **`@Public()` aplicado em `GET /` e `GET /health`**, como a 0002 tinha previsto no registro dela.
  - **`createTestApp` agora aceita controllers extras.** O guard global só é testável se houver alguma rota sem `@Public()` — e nenhuma existe ainda no código de produção. Rota inexistente não serve: dá 404 do Express, sem o guard rodar.

## Notas posteriores

Acrescentado depois do `done`, append-only: nada acima foi alterado. Serve para
quem lê esta spec como contexto não escrever código contra um retrato vencido.

- **2026-08-14, spec 0006** — duas decisões desta spec mudaram de arquivo, para
  não ficarem duplicadas quando `PATCH /me/password` passou a precisar delas:
  - custo 10 do bcrypt → `src/common/password.ts` (`hashPassword`, `verifyPassword`)
  - SHA-256 do token → `src/common/token-hash.ts` (`hashToken`)
  - nome e leitura do cookie de refresh saíram do controller → `src/modules/auth/refresh-cookie.ts`

  Comportamento inalterado; os testes desta spec continuam passando. O
  `@CurrentUser()` também nasceu ali, em `src/modules/auth/`.
