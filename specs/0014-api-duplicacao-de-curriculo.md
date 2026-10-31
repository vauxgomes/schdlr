---
id: 0014
title: Duplicação de currículo
status: done
depends_on: [0013]
---

# 0014 — Duplicação de currículo

## Objetivo

Quem gerencia o catálogo de um curso passa a criar um currículo novo a partir de um existente,
com uma cópia das disciplinas ativas dele, no mesmo curso ou em outro curso da unidade. É o
caminho para a matriz nova que muda poucas disciplinas da anterior, ou para o curso novo que
nasce parecido com outro.

## Por que existe

Uma grade tem dezenas de disciplinas. Quando a instituição revisa a matriz (2018 → 2024), a maior
parte continua igual, e recriar tudo à mão pela 0013 é lento e cheio de erro de digitação. E o
currículo antigo não pode simplesmente ser editado: projetos antigos continuam apontando para ele.

## Contexto necessário

- `specs/0012-api-curriculos.md` — `CurriculumAccessService`, o formato do currículo, as regras de
  `name`, `code` e `description`, e o `CURRICULUM_CODE_IN_USE`
- `specs/0011-api-cursos.md` — `CourseAccessService` (`resolveCourse`, `assertCatalogWritable`) e
  `canManageCatalog`
- `specs/0013-api-disciplinas.md` — os campos da disciplina
- `apps/api/src/modules/curricula/` e `apps/api/src/modules/subjects/`

## Escopo

**Entra:**

- Rota, exigindo token:
  `POST /api/organizations/:orgSlug/units/:unitSlug/courses/:courseId/curricula/:curriculumId/duplicate`
- O método de duplicar no service de currículos (`src/modules/curricula/`), com o schema do corpo

## Não entra

- Copiar entre unidades ou organizações
- Copiar uma disciplina avulsa de um currículo para outro
- Manter vínculo entre a cópia e a origem ("este currículo veio daquele"): a cópia é independente
- Desativar a origem automaticamente
- Mudança de schema ou migration

## Decisões já tomadas

### Origem e destino

- **A origem é o currículo do caminho**, resolvido com `resolveCurriculum` da 0012. Basta
  enxergá-lo: a leitura do catálogo é aberta a quem enxerga a unidade (0011). Origem desativada, ou
  de curso desativado, pode ser copiada — duplicar a matriz antiga é o uso comum
- **O destino é o curso `targetCourseId`** do corpo, ou o curso da origem se ausente. Ele é
  resolvido com `resolveCourse` **na mesma unidade**: de outra unidade ou inexistente → `404
COURSE_NOT_FOUND`
- **Quem duplica precisa de `canManageCatalog` no destino** (`403 NOT_ALLOWED` sem ele), não na
  origem. O coordenador de um curso pode partir da grade de outro curso da unidade
- **O destino passa por `assertCatalogWritable`**: curso desativado (`409 COURSE_INACTIVE`),
  unidade ou organização desativada, plano do dono vencido

### Corpo e cópia

- **`POST …/duplicate` recebe `{ name, code, description?, targetCourseId? }`**, com as regras de
  campo da 0012. `code` é obrigatório: dois currículos do mesmo curso não têm o mesmo código.
  Repetido no destino → `409 CURRICULUM_CODE_IN_USE`, também pelo `P2002`
- **O currículo novo nasce ativo** e sem projeto
- **Copia só as disciplinas ativas da origem**, com `name`, `code`, `workload`, `level` e `color`.
  As desativadas são história da matriz antiga; quem precisar de uma a recria ou reativa na
  origem antes de copiar
- **Tudo numa transação**: o currículo e as disciplinas (`createMany`). Se algo falhar, nada fica
- **Origem sem disciplinas ativas** gera um currículo vazio, sem erro
- **Responde `201` com o currículo novo**, no formato da 0012 (`subjectsCount` e `totalWorkload`
  já com a cópia)

### Códigos de erro

Nenhum código novo. Os possíveis: `CURRICULUM_NOT_FOUND`, `COURSE_NOT_FOUND`, `NOT_ALLOWED`,
`COURSE_INACTIVE`, `UNIT_INACTIVE`, `ORGANIZATION_INACTIVE`, `PLAN_EXPIRED`,
`CURRICULUM_CODE_IN_USE` e `VALIDATION_FAILED`.

## Critérios de aceite

- [x] Duplicar no mesmo curso cria o currículo com as disciplinas ativas da origem, e só elas
- [x] Duplicar para outro curso da unidade funciona; curso de outra unidade dá `404`
- [x] Coordenador do curso de destino duplica a partir de qualquer curso da unidade; sem
      `canManageCatalog` no destino, `403`
- [x] Origem desativada pode ser copiada; destino desativado dá `409 COURSE_INACTIVE`
- [x] Código repetido no destino dá `409 CURRICULUM_CODE_IN_USE`, e nada é gravado
- [x] Currículo e disciplinas são criados numa transação; a origem não muda
- [x] Resposta `201` no formato da 0012, com `subjectsCount` e `totalWorkload` da cópia
- [x] Testes unitários do método de duplicar e do schema; e2e da rota com o service substituído
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
MGR=$(login manager@schdlr.dev)
CRD=$(login coordinator@schdlr.dev)
TCH=$(login teacher@schdlr.dev)
U=$API/organizations/root-test-organization/units/unidade-teste
COURSE=$(curl -s -H "Authorization: Bearer $CRD" $U/courses \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).find(c => c.code === "TESTE").id')
K=$U/courses/$COURSE/curricula

# origem: matriz 2018 com 3 disciplinas, uma desativada
SRC=$(curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $K -d '{"name":"Matriz 2018","code":"2018"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
for s in 'MAT-101 80 1' 'FIS-101 60 1' 'QUI-201 40 2'; do set -- $s
  curl -s -o /dev/null -X POST -H "Authorization: Bearer $CRD" -H "$J" $K/$SRC/subjects \
    -d "{\"name\":\"$1\",\"code\":\"$1\",\"workload\":$2,\"level\":$3}"; done
# (desativar a QUI-201 pelo PATCH da 0013)

curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $K/$SRC/duplicate \
  -d '{"name":"Matriz 2024","code":"2024"}'                                       # 201, subjectsCount 2, totalWorkload 140
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $K/$SRC/duplicate \
  -d '{"name":"Dup","code":"2024"}' -w ' %{http_code}\n'                          # 409 CURRICULUM_CODE_IN_USE
curl -s -X POST -H "Authorization: Bearer $TCH" -H "$J" $K/$SRC/duplicate \
  -d '{"name":"X","code":"X"}' -w ' %{http_code}\n'                               # 403

# para outro curso da unidade, criado pelo responsável
OTHER=$(curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $U/courses -d '{"name":"Outro Curso","code":"OUTRO"}' \
  | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $K/$SRC/duplicate \
  -d "{\"name\":\"X\",\"code\":\"X\",\"targetCourseId\":\"$OTHER\"}" -w ' %{http_code}\n'  # 403 (não coordena o destino)
curl -s -X POST -H "Authorization: Bearer $MGR" -H "$J" $K/$SRC/duplicate \
  -d "{\"name\":\"Base\",\"code\":\"2018\",\"targetCourseId\":\"$OTHER\"}" -w ' %{http_code}\n'  # 201 (código é por curso)

# origem desativada pode ser copiada
curl -s -X PATCH -H "Authorization: Bearer $CRD" -H "$J" $K/$SRC -d '{"isActive":false}' > /dev/null
curl -s -X POST -H "Authorization: Bearer $CRD" -H "$J" $K/$SRC/duplicate \
  -d '{"name":"Matriz 2025","code":"2025"}' -w ' %{http_code}\n'                  # 201
kill %1
```

Ao final, apagar por SQL os currículos (levam as disciplinas) e o curso `OUTRO` criados no teste,
e apagar os códigos OTP e refresh tokens dos logins.

## Registro

**2026-10-31** — executada com `/spec next 2`, na branch `feature/catalogo-academico`, depois da 0013.

Commits: `feat(api): duplicação de currículo (spec 0014)`.

Verificação: sem `.env`, `pnpm test:api` passa (353 unitários, 89 e2e) e `pnpm build:api` também;
lint limpo; `pnpm format` estável. Contra o banco de dev, rodado em `bash` a partir de um script,
todas as linhas da seção "Verificação" deram o esperado: a `2018` com `MAT-101`, `FIS-101` e a
`QUI-201` desativada, duplicada como `2024` → `201` com `subjectsCount: 2` e `totalWorkload: 140`, e
a cópia tem só `FIS-101` e `MAT-101`, ativas, com carga, nível e cor da origem; o mesmo código →
`409 CURRICULUM_CODE_IN_USE`; o `teacher@` → `403`; o `coordinator@` para o curso `OUTRO` (que não
coordena) → `403`; o `manager@` para o `OUTRO` com o código `2018` → `201` (código é por curso);
com a origem desativada, duplicar → `201`. Além do roteiro: `targetCourseId` inexistente → `404
COURSE_NOT_FOUND`; com o `coordinator@` passando a coordenar o `OUTRO`, ele duplica de lá para o
`Curso Teste` (`201`), partindo de um curso para outro em que tem o papel; com o `OUTRO`
desativado, duplicar para ele → `409 COURSE_INACTIVE`; a origem continuou com as 3 disciplinas (2
ativas). Uma linha do script, a do `manager@` para o `OUTRO`, não imprimiu o resultado por um erro
no próprio script (o status colado ao JSON); a consulta final ao banco mostra a cópia `OUTRO/2018`
com 2 disciplinas. No fim, os currículos (com as disciplinas) e o curso `OUTRO` foram apagados, o
`Curso Teste` continua com o `coordinator@`, e os códigos OTP e refresh tokens foram apagados.

Desvios:

- **`targetCourseId` igual ao curso da origem** não resolve o curso de novo: o destino é o próprio
  acesso da origem, como quando ele é omitido.
- **`targetCourseId` no corpo é qualquer string**: fora do formato é o `404 COURSE_NOT_FOUND` do
  `resolveCourse`, não `VALIDATION_FAILED`, como o `courseId` do caminho.
- **O código é conferido antes da transação** (`409` sem abri-la); o `P2002` dentro dela vira o
  mesmo `409` e nada fica gravado.
- **As disciplinas da origem são lidas dentro da transação**, junto com a criação do currículo e o
  `createMany`.
