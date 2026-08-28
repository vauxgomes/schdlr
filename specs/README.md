# Specs

Reconstrução da API, uma spec por vez. Cada spec é autocontida: uma sessão nova consegue executá-la lendo só o arquivo dela e os arquivos que ela lista em "Contexto necessário".

## Como usar

```
/spec          # lista e sugere a próxima executável
/spec 0007     # executa a spec 0007
```

## Regras

- **Uma spec = uma sessão = um commit de implementação.** Se estourar isso, a spec estava grande demais — divida.
- A spec é commitada **antes** da implementação (`docs(spec): ...`); a implementação referencia o id (`feat(api): ... (spec 0007)`).
- **Spec com `status: done` não se edita.** Requisito, escopo, decisões e registro são imutáveis — requisito novo vira spec nova, senão o registro vira ficção. **Única exceção:** acrescentar ao fim uma **nota posterior datada**, quando uma spec seguinte mover ou invalidar algo que esta decidiu ou listou. A nota é append-only e nunca reescreve o que está acima.
- **Nome do arquivo: `NNNN-<área>-<slug>.md`.** O id é uma sequência única e global, não uma por área — specs do front dependem das da API, e `depends_on: [0014]` precisa ser inequívoco. Áreas: `api`, `web`.
- `specs/` é versionado. `.plan/` (exploração) e `.handoff/` continuam locais.

## Índice

**A tabela está em ordem de execução, não de numeração.** A **[0020](0020-api-estrategia-de-testes.md)** nasceu depois das demais e aparece no meio, marcada com ↩: vem antes da 0003 porque define como se testa contra banco, e é da autenticação em diante que mora o código cuja regressão passa despercebida.

A **[0022](0022-api-auditoria.md)** também aparece fora de ordem, no fim do bloco Tenant: precisa rodar **antes da 0012**, que define o molde copiado por cinco módulos do catálogo.

A **[0023](0023-api-transicoes-periodo.md)** abre o bloco Scheduling, embora mexa em código da 0016: ela troca a tabela de transições do período, e é dela que a 0018 tira o direito de travar mutação em período iniciado.

A **[0021](0021-api-rate-limiting-expiracao.md)** fica no fim, em bloco próprio: o gatilho dela é o primeiro deploy exposto à internet, não uma dependência de código.

| id                                            | spec                                 | status | depende de       |
| --------------------------------------------- | ------------------------------------ | ------ | ---------------- |
| **Fundação**                                  |                                      |        |                  |
| [0001](0001-api-migration-inicial.md)         | Migration inicial e DatabaseService  | done   | —                |
| [0002](0002-api-bootstrap.md)                 | Bootstrap da aplicação               | done   | 0001             |
| ↩ [0020](0020-api-estrategia-de-testes.md)    | Estratégia de testes                 | done   | 0002             |
| **Identidade**                                |                                      |        |                  |
| [0003](0003-api-autenticacao.md)              | Cadastro e autenticação              | done   | 0002             |
| [0004](0004-api-email.md)                     | Infraestrutura de e-mail             | done   | 0002             |
| [0005](0005-api-recuperacao-senha.md)         | Recuperação de senha                 | done   | 0003, 0004       |
| [0006](0006-api-perfil.md)                    | Perfil do usuário                    | done   | 0003             |
| ↩ [0021](0021-api-rate-limiting-expiracao.md) | Rate limiting e expiração de tokens  | todo   | 0005             |
| **Tenant**                                    |                                      |        |                  |
| [0007](0007-api-organizacao.md)               | Organização                          | done   | 0003             |
| [0008](0008-api-unidade.md)                   | Unidade e camada de permissões       | done   | 0007             |
| [0009](0009-api-membros.md)                   | Membros da unidade                   | done   | 0008             |
| [0011](0011-api-notificacoes.md)              | Notificações                         | done   | 0003             |
| [0010](0010-api-convites.md)                  | Convites de unidade                  | done   | 0009, 0004, 0011 |
| ↩ [0022](0022-api-auditoria.md)               | Trilha de auditoria em arquivo       | done   | 0010             |
| **Acadêmico**                                 |                                      |        |                  |
| [0012](0012-api-curso.md)                     | Curso — define o padrão de módulo    | done   | 0008             |
| [0013](0013-api-disciplina.md)                | Disciplina                           | done   | 0012             |
| [0014](0014-api-curriculo.md)                 | Currículo e disciplinas do currículo | done   | 0012, 0013       |
| [0015](0015-api-local.md)                     | Local                                | done   | 0012             |
| [0016](0016-api-periodo.md)                   | Período letivo                       | done   | 0012             |
| [0017](0017-api-grade-horarios.md)            | Grade de horários                    | done   | 0012             |
| **Scheduling**                                |                                      |        |                  |
| ↩ [0023](0023-api-transicoes-periodo.md)      | Transições do período, revisadas     | todo   | 0016             |
| [0018](0018-api-projeto.md)                   | Projeto                              | todo   | 0014, 0016, 0023 |
| [0019](0019-api-membros-projeto.md)           | Membros do projeto                   | todo   | 0018             |
| **Endurecimento**                             |                                      |        |                  |

O id é uma sequência de criação, não de execução: quem manda na ordem é o `depends_on` e o lugar na tabela. Spec nova entra onde precisa rodar, e não no fim.

## Fora de escopo por enquanto

`Offer`, `Board` e `BoardSlot` não têm spec ainda. É onde entram as regras de conflito de horário — professor ou sala em dois lugares ao mesmo tempo, aula conjunta, choque entre unidades — e isso pede um passo de design próprio antes de virar spec.

### O motor de conflito — o que a discussão já fechou

Levantado em 2026-08-28, a partir da pergunta "o que valida quando um projeto sai de `DRAFT` para `PUBLISHED`". Fica registrado aqui porque é o contrato que as três specs acima vão assumir pronto, e ele precisa de spec própria **antes** delas.

- **Conflito não se detecta por `timeSlotId` igual.** `TimeSlot` pertence a um `Timetable`, e um projeto tem boards em grades diferentes. Faixas de grades distintas têm ids distintos e podem se sobrepor no relógio (11:00–12:00 na matutina contra 11:30–12:30 na vespertina). A comparação é `weekDay` mais sobreposição de `[startTime, endTime)` — o `overlaps()` que a 0017 já deixou pronto.
- **A unidade de raciocínio é a ocupação, não o slot.** Um `BoardSlot` gera até duas: a do professor (via `offer.memberId`, nulo até alguém ser atribuído) e a do local (`locationId`, opcional). Slot bloqueado ou sem professor não ocupa ninguém.
- **A detecção é função pura sobre uma lista de ocupações**, agrupada por `(tipo, recurso, weekDay)` e ordenada por `startTime`. Sem consulta dentro dela: é a mesma função para publicar um projeto inteiro e para validar a troca de professor de uma única oferta — muda só o que entra na lista.
- **A janela é o período, não o projeto.** Valida contra as ocupações de todos os projetos **publicados** daquele `term`, mais as do próprio projeto sendo publicado, para pegar o conflito interno dele.
- **Publicar é atômico com a validação.** Dois projetos publicados ao mesmo tempo passariam nas duas validações e criariam o conflito depois — a transição precisa de lock no período ou isolamento serializável.
- **Invariante que o banco não segura:** a FK do `BoardSlot` é `[timeSlotId, unitId]`, então nada impede anexar faixa da grade da tarde num board da manhã. É o service que garante, e é pré-requisito para a detecção fazer sentido.

**Decidido em 2026-08-28:**

- **O 409 devolve os primeiros N conflitos, mais o total.** Lista, e não frase, porque a tela precisa dizer quais slots batem e com quem — mas limitada: um projeto mal montado produziria centenas, e ninguém lê a centésima.
- **Publicar toma lock no período.** Sem isso, dois projetos publicados ao mesmo tempo passam nas duas validações e criam o conflito depois.
- **Validação completa só na travessia `DRAFT → PUBLISHED`.** Projeto já publicado que é editado em período reaberto valida **apenas a modificação** contra o mundo — revalidar o projeto inteiro a cada slot movido não faria sentido nem seria pago.

**Aula conjunta fica para uma v2.**

Aula conjunta é **uma disciplina ministrada por dois professores** — para o motor, os dois estão na mesma aula, no mesmo horário. (Não é duas turmas assistindo à mesma aula; essa leitura apareceu na discussão e está errada.)

O caminho sem schema novo seria duas `Offer` para o mesmo `curriculumDisciplineId`, separadas pela `variant`, cada uma com o seu professor. Ele **não fecha**, e o motivo é o local: as duas ofertas vivem em boards diferentes, logo são dois `BoardSlot` no mesmo dia, em horário sobreposto, **na mesma sala** — que é a definição exata de conflito de local. O motor recusaria a aula conjunta recém-montada. As saídas seriam deixar o segundo slot sem local (convenção frágil), abrir exceção na regra de local (buraco que duas turmas legítimas na mesma sala atravessam) ou trocar `Offer.memberId` por `OfferTeacher` — uma aula, um slot, uma sala, dois professores.

**Adiar não custa nada ao desenho**, e é por isso que dá para adiar com tranquilidade: a função pura opera sobre **ocupações**, não sobre ofertas. Um professor gera uma ocupação; dois gerariam duas. Quem muda na v2 é só o carregador que transforma slot em ocupação — o núcleo da detecção não muda uma linha.

Na v1, portanto: uma oferta, um professor, regra de local sem exceção.

Também sem spec: gestão de planos e assinatura (além da criação no cadastro) e qualquer worker assíncrono.

### Pendências anotadas, ainda sem spec

Levantadas durante a execução e registradas no "Registro" das specs de origem. Nenhuma virou spec porque todas dependem de algo que ainda não existe:

| pendência                                                        | origem | espera por                                               |
| ---------------------------------------------------------------- | ------ | -------------------------------------------------------- |
| Trilha de auditoria (quem fez o quê)                             | 0004   | a 0008, que é quem cria o `actorId` de verdade           |
| Nome dos eventos: `mail.*` ou o fato de domínio (`unit.invited`) | 0004   | a 0010 e a 0011, quando o mesmo fato tiver dois ouvintes |
| Sessões ativas e revogação em cascata no reuso de refresh token  | 0003   | decisão de produto sobre expor sessões ao usuário        |
| Prazo do plano TRIAL — hoje uma assinatura de teste não expira   | 0003   | gestão de planos, que ainda não tem spec                 |
| Teste instável: `invites › accepting › refuses a revoked invite` | 0022   | investigação própria — ver abaixo                        |
| Aula conjunta: uma disciplina com dois professores               | 2026-08-28 | decisão de modelagem — `OfferTeacher` ou exceção no motor  |

**Instabilidade conhecida na suíte e2e.** Detectada em 2026-08-14, reproduz em
cerca de uma execução a cada quatro. Suspeita principal: a partir da 0022 o
registro de auditoria é assíncrono e dispara uma consulta **depois** da
resposta HTTP — o `truncateAll` do teste seguinte pode competir com essa
escrita em voo. Também há `findFirstOrThrow()` sem `orderBy` em vários testes
de convite, que é ordem indefinida por natureza.

Em desenvolvimento custa tempo; depois do primeiro lançamento custa confiança,
porque uma suíte que falha às vezes deixa de ser sinal. Investigar antes disso.
