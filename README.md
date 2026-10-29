# schdlr

Validador de horários acadêmicos. Enquanto a coordenação monta os horários de um curso, o
schdlr aponta os **choques**: o mesmo professor ou o mesmo local físico alocados em horários
que se sobrepõem, no mesmo dia da semana, dentro do mesmo semestre.

> Projeto em fase inicial (v0). Ainda não há código: a estrutura abaixo é o plano, e cada
> parte entra por uma spec.

## Conceitos

- **Organização** é a instituição. Ela tem uma ou mais **unidades** (as filiais)
- Cada unidade tem seus **cursos**. Cada curso tem **currículos**, e cada currículo tem
  **disciplinas**
- A unidade define os **semestres**, os **locais** de aula e os **blocos de horários** (Manhã,
  Noite, Integral…)
- Um **projeto** monta os horários de um currículo num semestre. Ele é composto por
  **quadros**, um por turma, cada um com uma grade de dias × horários
- Cada disciplina vira uma **oferta** no projeto, com um professor associado. Alocar ofertas e
  locais nas células dos quadros é o que pode gerar choque

## Organização do repositório

Monorepo pnpm:

```
schdlr/
├── apps/
│   ├── api/      # API REST — NestJS
│   └── web/      # interface — React
├── specs/        # specs de implementação
└── docker-compose.yml
```

## Tecnologias

| parte | tecnologias |
|---|---|
| API | TypeScript, NestJS, Prisma, PostgreSQL, Passport (JWT), Zod |
| Web | TypeScript, React |
| Infra | pnpm workspaces, Docker Compose, GitHub Actions |

O login é sem senha: o acesso é feito por código enviado por e-mail (OTP).

## Specs

O desenvolvimento é guiado por specs em [`specs/`](specs/). Cada uma é autocontida, vira um
commit de implementação e registra o que foi feito e por quê. O índice, o status de cada uma e
as regras do processo estão em [`specs/README.md`](specs/README.md).
