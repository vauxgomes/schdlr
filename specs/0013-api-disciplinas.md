---
id: 0013
title: Disciplinas
status: done
depends_on: [0012]
---

# 0013 — Disciplinas

## Objetivo

Quem gerencia o catálogo de um curso passa a montar a grade de cada currículo: criar, listar,
editar, desativar e apagar disciplinas, cada uma com código, carga horária, nível e cor. Uma
disciplina pode ser apagada enquanto nenhuma oferta a usa; depois disso, só desativada.

## Por que existe

As ofertas de um projeto saem das disciplinas ativas do currículo escolhido (0002: "uma oferta por
disciplina ativa do currículo"). A carga horária é o que o coordenador distribui nos quadros, e a
cor é a da disciplina nas células do quadro. Sem disciplinas, o currículo da 0012 é uma casca.

## Contexto necessário

- `specs/0012-api-curriculos.md` — `CurriculumAccessService` (`resolveCurriculum`,
  `assertCurriculumWritable`), `subjectsCount` e `totalWorkload`, e o padrão de apagar com
  `isForeignKeyViolation`
- `specs/0011-api-cursos.md` — `canManageCatalog`, a regra de leitura do catálogo e o `codeSchema`
- `specs/0002-api-schema-do-dominio.md` — `Subject` (`code` único por currículo, `level`
  organizacional, `color` `Char(7)`), `Offering.subjectId` em `Restrict` e as regras de `Subject`
  na tabela "Regras que ficam com a aplicação"
- `specs/0008-api-codigos-de-erro.md` — `AppException` e o catálogo
- `apps/api/src/modules/curricula/` — o que a 0012 entregou

## Escopo

**Entra:**

- Módulo `src/modules/subjects/` com controller, service e schemas Zod
- Rotas, todas exigindo token, sob
  `/api/organizations/:orgSlug/units/:unitSlug/courses/:courseId/curricula/:curriculumId`:

  | rota                           | o que faz                         |
  | ------------------------------ | --------------------------------- |
  | `POST …/subjects`              | cria disciplina                   |
  | `GET …/subjects`               | lista as disciplinas do currículo |
  | `GET …/subjects/:subjectId`    | uma disciplina                    |
  | `PATCH …/subjects/:subjectId`  | edita, desativa, reativa          |
  | `DELETE …/subjects/:subjectId` | apaga, se nenhuma oferta a usa    |

## Não entra

- Duplicar currículo com as disciplinas: 0014
- Criar disciplinas em lote ou importar planilha
- Pré-requisito, equivalência entre disciplinas, ementa
- Versões de uma mesma disciplina numa oferta (Química, Química Repetentes): spec própria, futura
- **O que muda nas ofertas quando a disciplina é editada ou desativada.** Ofertas ainda não
  existem; a spec de projeto e oferta decide se a oferta acompanha a disciplina ou guarda uma cópia
- Mover disciplina para outro currículo
- Mudança de schema ou migration

## Decisões já tomadas

### Papéis

- **Escreve** quem tem `canManageCatalog` no curso (0011): dono, responsável e coordenador do
  curso. Os demais, `403 NOT_ALLOWED`
- **Lê** quem enxerga a unidade, inclusive as disciplinas desativadas (0011)
- **Toda escrita passa por `assertCurriculumWritable`** da 0012 (unidade, organização, plano, curso
  e currículo ativos). Currículo desativado não recebe nem muda disciplina
- **A disciplina é procurada no currículo do caminho**: de outro currículo, inexistente ou que não
  é cuid → `404 SUBJECT_NOT_FOUND`

### Disciplina

- **`POST` recebe `{ name, code, workload, level?, color? }`**:
  - `name` com o `nameSchema` da 0004
  - `code` com o `codeSchema` da 0011, obrigatório
  - `workload`: inteiro, de 1 a 1000. É a carga horária total da disciplina, em horas
  - `level`: inteiro, de 1 a 9999; ausente → `1`. Só agrupa e ordena (101, 202…), como a 0002 diz
  - `color`: `#RRGGBB` (`^#[0-9A-Fa-f]{6}$`), gravada em maiúsculas; ausente → o default
    `#000000` do schema
- **Código repetido no currículo** → `409 SUBJECT_CODE_IN_USE`, também pelo `P2002`. O mesmo código
  em outro currículo passa — é o que a duplicação (0014) vai fazer
- **`PATCH` recebe `{ name?, code?, workload?, level?, color?, isActive? }`**; sem campo válido →
  `400` com o item `EMPTY_UPDATE`. Disciplina desativada → `409 SUBJECT_INACTIVE`; reativar é o
  corpo exatamente `{ isActive: true }`, como na 0009
- **`GET …/subjects`** lista todas as disciplinas do currículo, ativas ou não, ordenadas por
  `level` e depois `code`. Sem paginação. É a grade inteira, de uma vez

### Apagar

- **`DELETE` apaga a disciplina** e responde `204`, enquanto nenhuma oferta a usa. Usada →
  `409 SUBJECT_IN_USE`, conferido antes e pelo `P2003` do `Restrict` de `Offering.subjectId`
- Passa pelo `assertCurriculumWritable`. Disciplina desativada e sem uso pode ser apagada
- É a mesma exceção da 0012 ao "o que tem `isActive` não se apaga", pelo mesmo motivo: montar uma
  grade tem erro de digitação, e enquanto nenhum projeto depende da disciplina não há o que
  preservar

### Formato

```json
{
  "id": "…",
  "name": "Matemática I",
  "code": "MAT-101",
  "workload": 80,
  "level": 1,
  "color": "#1E88E5",
  "isActive": true,
  "createdAt": "2026-10-30T10:00:00.000Z",
  "updatedAt": "2026-10-30T10:00:00.000Z",
  "inUse": false
}
```

- **`inUse`** diz se alguma oferta usa a disciplina, como no currículo
- **O currículo (0012)** passa a ter `subjectsCount` e `totalWorkload` de verdade, somando só as
  ativas, sem mudança de código lá

### Códigos de erro

| código                | status | mensagem                       | quando                               |
| --------------------- | ------ | ------------------------------ | ------------------------------------ |
| `SUBJECT_NOT_FOUND`   | 404    | Subject not found              | id inexistente ou de outro currículo |
| `SUBJECT_INACTIVE`    | 409    | Subject is inactive            | escrita em disciplina desativada     |
| `SUBJECT_CODE_IN_USE` | 409    | Subject code already in use    | código repetido no currículo         |
| `SUBJECT_IN_USE`      | 409    | Subject is used by an offering | apagar disciplina usada por oferta   |

- `workload`, `level` e `color` fora da regra saem como itens de `VALIDATION_FAILED` com os códigos
  do Zod (`too_small`, `too_big`, `invalid_type`, `invalid_format`), como a 0008 define

## Critérios de aceite

- [x] Dono, responsável e coordenador do curso escrevem; professor e coordenador de outro curso
      recebem `403`; quem não enxerga a unidade, `404`
- [x] Todo membro lista as disciplinas, inclusive as desativadas, ordenadas por `level` e `code`
- [x] `workload` fora de 1–1000, `level` fora de 1–9999 e `color` fora de `#RRGGBB` dão `400`;
      `color` é gravada em maiúsculas; `level` e `color` ausentes ficam `1` e `#000000`
- [x] Código repetido no currículo dá `409 SUBJECT_CODE_IN_USE`; o mesmo código em outro currículo
      passa
- [x] Currículo ou curso desativado não recebe nem muda disciplina (`409`)
- [x] Escrita em disciplina desativada dá `409 SUBJECT_INACTIVE`; `{ isActive: true }` reativa
- [x] `DELETE` apaga; usada por oferta dá `409 SUBJECT_IN_USE`, inclusive pelo `P2003`
- [x] `subjectId` de outro currículo dá `404`
- [x] `subjectsCount` e `totalWorkload` do currículo somam só as disciplinas ativas
- [x] Códigos novos no catálogo da 0008
- [x] Testes unitários do service e dos schemas; e2e das rotas com os services substituídos
- [x] `pnpm test:api` passa sem `.env` e sem banco; `pnpm build:api` e o lint passam

## Verificação

```bash
docker compose up -d db
pnpm install --frozen-lockfile

mv apps/api/.env apps/api/.env.bak 2>/dev/null
pnpm test:api
pnpm build:api
mv apps/api/.env.bak apps/api/.env 2>/dev/null

pnpm --filter @schdlr/api lint
pnpm format && git status --porcelain                         # nada

# contra o banco de dev, em bash
pnpm dev:api &
sleep 8
API=localhost:3001/api
J='content-type: application/json'
login() {
  code=$(pnpm -s otp "$1" | cut -d' ' -f1)
  curl -s -X POST $API/auth/sign-in -H "$J" -d "{\"email\":\"$1\",\"code\":\"$code\"}" \
    | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken'
}
CRD=$(login coordinator@schdlr.dev)
TCH=$(login teacher@schdlr.dev)
U=$API/organizations/root-test-organization/units/unidade-teste
COURSE=$(curl -s -H "Authorization: Bearer $CRD" $U/courses \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(c => c.code === "TESTE").id')
K=$U/courses/$COURSE/curricula
CUR=$(curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $K -d '{"name":"Matriz 2024","code":"2024"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
S=$K/$CUR/subjects

curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $S \
  -d '{"name":"Matemática I","code":"mat-101","workload":80,"color":"#1e88e5"}'   # 201, MAT-101, #1E88E5, level 1
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $S \
  -d '{"name":"Física I","code":"FIS-101","workload":60,"level":1}' > /dev/null  # 201
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $S \
  -d '{"name":"Dup","code":"MAT-101","workload":10}' -w ' %{http_code}\n'        # 409 SUBJECT_CODE_IN_USE
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $S \
  -d '{"name":"X","code":"X","workload":0,"color":"azul"}' -w ' %{http_code}\n'  # 400, too_small e invalid_format
curl -s -X POST -H "Authorization: Bearer $TCH" -H "$J" $S \
  -d '{"name":"X","code":"X","workload":10}' -w ' %{http_code}\n'                # 403
curl -s -H "Authorization: Bearer $TCH" $S                                       # FIS-101, MAT-101
curl -s -H "Authorization: Bearer $TCH" $K/$CUR                                  # subjectsCount 2, totalWorkload 140

SUB=<id da FIS-101>
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $S/$SUB -d '{"isActive":false}'   # 200
curl -s -H "Authorization: Bearer $TCH" $K/$CUR                                  # subjectsCount 1, totalWorkload 80
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $S/$SUB \
  -d '{"workload":70}' -w ' %{http_code}\n'                                      # 409 SUBJECT_INACTIVE
curl -s -X DELETE -H "Authorization: Bearer $CRD" $S/$SUB -w ' %{http_code}\n'  # 204 (desativada e sem uso)

# currículo desativado não recebe disciplina
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $K/$CUR -d '{"isActive":false}' > /dev/null
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $S \
  -d '{"name":"Y","code":"Y","workload":10}' -w ' %{http_code}\n'                # 409 CURRICULUM_INACTIVE

# em uso: termo, projeto e oferta inseridos por SQL seguram a MAT-101
# (inserir e conferir DELETE da MAT-101 → 409 SUBJECT_IN_USE; depois apagar o projeto por SQL)
kill %1
```

Ao final, apagar o currículo de teste (leva as disciplinas) e o que tiver sido inserido por SQL, e
apagar os códigos OTP e refresh tokens dos logins.

## Registro

**2026-10-31** — executada com `/spec next 2`, na branch `feature/catalogo-academico`, criada a
partir da `development` para a 0013 e a 0014.

Commits: `feat(api): disciplinas (spec 0013)`.

Verificação: sem `.env`, `pnpm test:api` passa (343 unitários, 88 e2e) e `pnpm build:api` também;
lint limpo; `pnpm format` estável. Contra o banco de dev, rodado em `bash` a partir de um script,
todas as linhas da seção "Verificação" deram o esperado: `mat-101` com `#1e88e5` → `201`, `MAT-101`,
`#1E88E5`, `level` 1; `FIS-101` → `201`, com `color` `#000000`; código repetido → `409
SUBJECT_CODE_IN_USE`; `workload: 0` e `color: "azul"` → `400` com `too_small` e `invalid_format`; o
`teacher@` criando → `403`; o `teacher@` lista `FIS-101, MAT-101` e o currículo mostra 2 disciplinas
e 140 h; com a `FIS-101` desativada, 1 e 80 h, e ela continua na lista com `isActive: false`;
editar a desativada → `409 SUBJECT_INACTIVE`, `{"isActive":true}` reativa; desativada e sem uso, o
`DELETE` → `204`. Com termo, projeto e oferta inseridos por SQL: `inUse: true` e `DELETE` da
`MAT-101` → `409 SUBJECT_IN_USE`; o `DELETE` direto por `psql` falha com SQLSTATE `23503`
(`offerings_subject_id_fkey`), o `P2003` que o service trata. Com o currículo desativado, criar e
editar disciplina → `409 CURRICULUM_INACTIVE`. Além do roteiro: o master → `404`; id apagado ou
fora do formato → `404 SUBJECT_NOT_FOUND`; o mesmo `MAT-101` num segundo currículo → `201`, e o id
da `MAT-101` do primeiro pelo caminho do segundo → `404`; num curso coordenado por outro, o
`coordinator@` criando → `403` e o `manager@` → `201`. No fim, os currículos (com as disciplinas),
o curso de teste, o termo, o projeto e a oferta foram apagados, e os códigos OTP e refresh tokens
também.

Desvios:

- **`level` e `color` ausentes recebem o default no Zod** (`1` e `#000000`, os mesmos do schema do
  Prisma), a pedido do usuário: no web os dois campos serão obrigatórios, e o corpo validado já
  chega completo ao service.
- **Ordem no `PATCH`**: disciplina (`404`) → papel (`403`) → `assertCurriculumWritable` →
  disciplina desativada (`409 SUBJECT_INACTIVE`, salvo `{ isActive: true }`) → código repetido. No
  `DELETE`: disciplina → papel → `assertCurriculumWritable` → em uso. Reativar a disciplina ainda
  exige o currículo ativo.
- **"Usada por oferta"** sai do `_count` de `offerings` já lido com a disciplina, sem consulta
  separada.
- **Sem `SubjectAccessService`**: a spec não pede contrato para disciplina, e a busca no currículo
  ficou num método privado do service.
