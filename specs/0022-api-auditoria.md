---
id: 0022
title: Trilha de auditoria em arquivo
status: todo
depends_on: [0010]
---

## Objetivo

Toda mutação de domínio deixa uma linha legível em arquivo, dizendo quem fez o quê, onde e quando — e o caminho para acrescentar outro destino depois é um arquivo novo, não uma reforma.

## Por que antes da 0012

A 0012 define o molde de módulo que 0013 a 0017 copiam. Se a linha de auditoria não estiver nesse molde, cinco módulos nascem sem ela. Executar agora custa treze linhas; depois do bloco Acadêmico, trinta e uma.

## Contexto necessário

- `apps/api/src/modules/units/unit-context.ts` e `utils/permissions.ts` — o ator sai de um, a negação nasce no outro
- `apps/api/src/app.module.ts` e `app.setup.ts` — onde o interceptor global entra
- `apps/api/src/events/` — o padrão de vocabulário fechado que `action` copia
- `apps/api/src/infra/mail/mail.service.ts` — o padrão de "variável ausente, recurso desligado", que `AUDIT_LOG_PATH` repete
- `apps/api/src/modules/members/members.service.ts` e `invites.service.ts` — os retrofits mais densos
- `.claude/rules/code-quality.md` e `rules/testing.md`

## Escopo

**Entra:**

- Contexto do ator em `AsyncLocalStorage`, preenchido uma vez por interceptor global: `userId`, `actorName`, `memberId`, `unitId`, `requestId`
- `AuditService.record(action, subject, data?)` — a chamada de uma linha que o service escreve
- Vocabulário fechado de ações, num arquivo só
- Registro de negação nos três `assert*`
- `formatAuditLine(entry)` — função pura, única dona da gramática, com teste que fixa o formato
- **`AuditSink`**: interface de um método, e uma implementação — `FileAuditSink`
- Retrofit das mutações que já existem (organizations, units, members, invites)
- Teste-rede que exige uma linha para cada mutação conhecida

**Não entra:**

- **Tabela e endpoint de consulta** — ver decisão
- Log operacional de requisição: método, latência, status. É da 0021
- Diff campo a campo (`de → para`)
- Rotação e expurgo além do fatiamento por dia
- Auditoria de leitura
- Registro de 400 e 409
- `Dockerfile` e o volume em si — a spec de deploy é que monta

## Decisões já tomadas

### Arquivo, não tabela

- **Não há model novo, e não se prevê um.** Trilha de auditoria aqui é registro operacional, não recurso do produto: ninguém consulta pela aplicação, e o público é quem opera o sistema. Uma tabela existiria para servir um endpoint que a spec não quer.
- **O que se perde está aceito:** responder "quem mexeu na grade?" exige acesso ao volume, não uma tela. Se um dia isso virar pedido de cliente, o caminho é acrescentar um sink — mas o histórico anterior a esse dia vive só em arquivo, e trazê-lo para o banco seria trabalho de parsing.
- **O ponto de extensão é o sink, não o service.** `AuditService` monta a entrada estruturada e entrega a um `AuditSink`; quem escreve é o sink. Acrescentar destino — banco, stdout, coletor externo — é uma classe nova e uma linha de registro no módulo. **Nenhuma chamada de service muda.** É isso que torna a decisão acima reversível a baixo custo.

### Onde o registro nasce

- **No service, não no Prisma.** `$extends` devolve um cliente novo em vez de alterar o existente, o que obrigaria trocar a herança do `DatabaseService` — decisão da 0001 — e reescrever `this.db.<model>` em toda a base. Pior: registraria mecânica (`updated UnitMember`) em vez de intenção (`trocou os papéis`). Confirmado no cliente 7.9.1 que `$use` não existe mais.
- **Ator, unidade e requisição vêm do `AsyncLocalStorage`**, nativo do Node, preenchido uma vez pelo interceptor. A chamada no service carrega só verbo e alvo.
- **Negação de permissão é registrada nos três `assert*`.** Todo 403 do projeto sai dali, e eles já recebem o `UnitContext` — um ponto cobre os doze módulos.
- **A negação é mais grosseira que o sucesso, e tudo bem.** O assert dispara antes do código que conhece o verbo, então a linha de negação leva `action=access.denied` e a rota como alvo. Resolver isso exigiria declarar o verbo no controller, tirando-o de onde a lógica está e quebrando requisições que produzem dois fatos.

### O que se registra

- **Só o estado posterior, em `data`.** O anterior é reconstruível: a criação registra o estado inicial e cada alteração registra o novo, então a série já contém a transição.
- **`action` é vocabulário fechado**, `<agregado>.<fato-no-passado>`, declarado num arquivo só. Nunca string literal solta, pelo mesmo motivo dos eventos de domínio.
- **`actorName` é snapshot** — o nome de quem agiu naquele momento. Renomear-se depois não reescreve a história.
- **Fail open:** falha ao escrever loga e a operação segue. O caso realista é bug no próprio código de auditoria, e derrubar a operação por causa dele seria pior. **A contrapartida:** a trilha é melhor-esforço e não se pode afirmar que é completa.

### O formato

- **Gramática de campo fixo, estilo `logfmt`**, e não frase pronta. Regex sobre prosa quebra na primeira mudança de redação.
- **`outcome` entra desde já**, em posição fixa. Acrescentar campo depois quebra todo regex já escrito.
- **`data` é o último campo**, por ser o único de tamanho livre — ancorado no fim, não desloca nada.
- **`-` para nulo, nunca campo ausente.** Campo que some desloca posição.

```
<iso8601> audit/1 outcome=<ok|denied> actor=<userId> actor.name="<nome>" member=<memberId|-> unit=<unitId|-> action=<agregado>.<fato> subject=<model>:<id> req=<requestId> data=<json>
```

```
2026-08-14T22:31:04.512Z audit/1 outcome=ok actor=cme3k1x2q0001 actor.name="Vaux Gomes" member=cmr9v2 unit=cmu7k1 action=member.roles-changed subject=unit_member:cmm4p8 req=01J8ZQ4F data={"roles":["COORDINATOR"]}
2026-08-14T22:33:10.004Z audit/1 outcome=denied actor=cme3k1x2q0001 actor.name="Vaux Gomes" member=- unit=cmu7k1 action=access.denied subject=route:PATCH_/units/:unitId/members/:memberId/roles req=01J8ZQ7B data={"assert":"assertManagement"}
```

```regex
^(?<ts>\S+) audit/1 outcome=(?<outcome>ok|denied) actor=(?<actor>\S+) actor\.name="(?<name>[^"]*)" member=(?<member>\S+) unit=(?<unit>\S+) action=(?<action>[a-z-]+\.[a-z-]+) subject=(?<model>[a-z_]+):(?<id>\S+) req=(?<req>\S+) data=(?<data>.*)$
```

### O arquivo

- **`AUDIT_LOG_PATH` é opcional e aponta um diretório**, no mesmo padrão do `SMTP_HOST`: ausente, nada é escrito e a aplicação sobe igual. É o que mantém a suíte de teste silenciosa.
- **Nome com data** (`audit-2026-08-14.log`), resolvido por dia. Fatiamento de graça, sem `logrotate` e sem dependência.
- **`fs.createWriteStream` com `flags: 'a'`**, nativo. Uma linha por mutação não justifica biblioteca de log com transports.
- **Handler de `error` obrigatório no stream.** Stream sem handler derruba o processo Node em disco cheio ou `EPIPE` — a auditoria viraria a causa da queda que deveria registrar.
- **O volume é responsabilidade do deploy.** Sem volume, o arquivo morre a cada recriação do container — e aqui, ao contrário do desenho com tabela, **isso perde a trilha de verdade**. Não existe `Dockerfile` nem serviço `api` no compose hoje; quem escrever a spec de deploy precisa saber que há um diretório a montar, e essa dependência fica registrada aqui.

## Critérios de aceite

- [ ] Cada mutação existente produz exatamente uma entrada `outcome=ok`, com ator, ação e alvo
- [ ] O ator vem do token, nunca do corpo da requisição
- [ ] Um 403 produz exatamente uma entrada `outcome=denied`; um `assert` que passa não produz nada
- [ ] Falha do sink não derruba a operação auditada
- [ ] Ação fora do vocabulário não compila
- [ ] A linha casa com o regex publicado — com campos nulos, e com nome contendo acento, espaço e aspas
- [ ] Sem `AUDIT_LOG_PATH` a aplicação sobe e nada é escrito
- [ ] Com `AUDIT_LOG_PATH`, a linha aparece no arquivo do dia
- [ ] Acrescentar um sink não exige tocar em nenhum service — provado por um sink de teste registrado ao lado do de arquivo
- [ ] O teste-rede quebra quando um módulo muta sem registrar

## Verificação

```bash
pnpm --filter @schdlr/api exec tsc --noEmit
pnpm --filter @schdlr/api lint
pnpm --filter @schdlr/api test:all
pnpm build:api
```

## Registro

_Preenchido durante a execução._

- **commits:**
- **desvios:**
