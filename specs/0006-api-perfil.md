---
id: 0006
title: Perfil do usuário
status: done
depends_on: [0003]
---

## Objetivo

Quem está logado vê e edita os próprios dados.

## Escopo

**Entra:**

- `GET /me` — dados do usuário logado, incluindo assinatura
- `PATCH /me` — altera nome
- `PATCH /me/password` — troca a senha exigindo a senha atual

**Não entra:**

- Troca de e-mail — exige fluxo de confirmação no endereço novo; vira spec própria se for necessário
- Desativar a própria conta

## Decisões já tomadas

- **Trocar a senha exige a senha atual**, mesmo com sessão válida. Sessão sequestrada não deve conseguir trocar a senha.
- **Trocar a senha revoga os outros refresh tokens**, preservando o da sessão que fez a troca.
- `GET /me` é a fonte que o front usa para montar o contexto do usuário — devolve o necessário para isso e nada de hash.

## Critérios de aceite

- [x] `GET /me` sem token responde 401
- [x] `GET /me` nunca inclui `passwordHash`
- [x] Troca de senha com senha atual errada responde 400/401 e não altera nada
- [x] Depois da troca, a sessão que trocou continua válida e as outras não

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test:all
pnpm build:api
```

## Registro

Executada em modo `/spec next 2`, com commit automático. 25 testes unitários e 42 e2e passando; os quatro critérios têm teste em `test/profile.e2e-spec.ts`.

- **commits:** `feat(api): perfil do usuário (spec 0006)` — branch `feature/perfil-usuario`
- **desvios:**
  - **Módulo novo `src/modules/users/`**, com o controller em `@Controller('me')`. As rotas são sobre o usuário logado, mas o domínio é usuário — daí o nome do módulo não seguir o da rota.
  - **Senha atual errada responde 400**, entre as duas opções que a spec permitia. A sessão está autenticada; o que está errado é o corpo. Mesma escolha do token inválido na 0005.
  - **Três extrações de código da 0003**, para não duplicar decisão já tomada: `common/password.ts` (custo 10 do bcrypt), `common/token-hash.ts` (SHA-256) e `modules/auth/refresh-cookie.ts` (nome do cookie e leitura). O `AuthService` e o `AuthController` passaram a usá-las.
  - **`@CurrentUser()` criado** em `modules/auth/`, primeira rota autenticada do projeto a precisar do usuário do token.
  - **Preservar a sessão que trocou a senha depende do cookie de refresh.** Sem cookie na requisição, todas as sessões caem — o padrão seguro.
  - **Parada de ambiente durante a execução:** o daemon do Docker estava desligado e o `globalSetup` da suíte não conseguiu criar o banco de teste. Resolvido subindo o Docker; nenhuma linha de código mudou por causa disso.
