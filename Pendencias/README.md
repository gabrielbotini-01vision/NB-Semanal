# Pendências · New Business Cockpit

Notas de handoff para quem continuar o desenvolvimento. Última atualização: 23/07/2026.

## Concluído (23/07/2026)

- **Cards "Contacted / FTE" e "Opps / FTE" (Semanal Área › SDR, KPIs do topo e resumo
  "Produtividade por FTE") agora dividem também por dia útil decorrido na semana**, não só
  o total semanal bruto. Novo campo `D.diasUteisSemana[semana]` no `app_data.js` (calculado
  em `build_data.js` via `businessDaysBetweenUTC` + `weekStartUTC`/`weekEndUTC` já
  existentes): dias úteis (seg-sex) já passados até hoje — 5 numa semana fechada, só os que
  já ocorreram numa semana em curso. Isso resolve a parte "dias úteis decorridos" do item 2
  abaixo **só para esses dois cards agregados** — a tabela por pessoa (colunas `Prod/dia
  sem.`/`Prod/dia 3s`) continua com o `÷5`/`÷15` fixo, não foi tocada.
- **Card "Contacted → Connected" (coorte contato→conexão na mesma semana) ganhou uma
  referência fixa de 10%** (constante `COH_META` em `renderAreaSdr()`, não vem de
  budget/reforecast) com badge de atingimento igual aos outros cards com meta.

## Estado atual do redesign

- O front novo (estilo admin SaaS "Stravix", sidebar lateral, laranja Hotmart, cards
  arredondados) **já é o `app/index.html` publicado** (promovido em 22/07/2026).
- O layout **antigo** ficou em **`app/index.legacy.html`** como backup (não é publicado).
- A wordmark "hotmart" na sidebar é **texto**, não o SVG oficial — trocar pelo vetor quando
  houver o asset (`app/hotmart-logo.svg`).

## Estruturas novas no `build_data.js` (todas indexadas por estratégia: all/Outbound/Inbound/Hunting)

Alimentam a página **Semanal Área › SDR**:

- `sdrEstoque` — estoque do funil (contacted/connected/nurturing) por semana, snapshot no fim
  de cada semana (semana em curso = snapshot até hoje).
- `sdrCohort` — coorte contato→conexão: contatados na semana × conectaram na mesma semana.
- `sdrUnq` — unqualifieds por semana.
- `sdrOppsNivel` — opps por nível × semana.
- `sdrOppFte` / `sdrContactFte` — nº de SDRs distintos que geraram opp / que contataram, por semana.
- `sdrCohortStatus` — por semana de CONTATO, status atual (hoje) de cada lead:
  contacted/connected/nurturing/qualified/unqualified (data mais recente vence).

Regenerar: `node app/build_data.js` (lê `Dados/*.csv` locais).

## Backlog / a confirmar

1. **FTE de SDR real:** "Contacted/FTE" e "Opps/FTE" usam como FTE os SDRs que de fato
   contataram / geraram opp na semana (aproximação). Trocar por base de headcount/escala real
   quando disponível.
2. **"Produtividade diária" (tabela por pessoa):** hoje = **opps/dia** = `opps da semana ÷ 5`
   e média 3 semanas = `(W + W-1 + W-2) ÷ 15`. Confirmar se é isso mesmo ou contatados/dia.
   ⚠️ O "usar dias úteis decorridos em vez de fixar 5" **já foi resolvido pros cards
   agregados** (ver "Concluído" acima, `D.diasUteisSemana`) — falta só aplicar a mesma lógica
   aqui, nas colunas `Prod/dia sem.`/`Prod/dia 3s` da tabela por pessoa.
3. **Filtro de Estratégia:** hoje só funciona/aparece na sub-aba **SDR**. Estender para
   Closers e Onboarding (KPIs já dá via `porEstrategia`; tabelas por pessoa precisam de
   dimensão de estratégia por pessoa/semana).
4. **Tabela por pessoa × estratégia:** o filtro de estratégia na tabela de SDR usa a
   **estratégia primária** da pessoa (aprox.). Preciso por lead/semana exigiria quebrar o
   `porSemana` por estratégia no build.
5. **Chip de ícone nos KPI cards** (estilo Stravix, círculo colorido) — não implementado.
6. **Definição de "status atual" e "saída do estoque":** hoje um lead sai do estoque de SDR
   quando vira opp/qualificado ou é desqualificado. Confirmar se a regra bate com a operação.

## Convenções do projeto (não esquecer)

- Só commitar/push quando o Gabriel/Guilherme pedir explicitamente.
- `build_data.js` só lê campos por nome do `06_operacional_raw.csv` (que tem PII) — nunca
  fazer spread da linha inteira pro `app_data.js`.
- `FILTRO_ANO`/`FILTRO_ANO`-equivalente restringe filtros de mês ao ano corrente — ajustar na
  virada de ano.
