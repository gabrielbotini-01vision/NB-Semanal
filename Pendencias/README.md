# Pendências · New Business Cockpit

Notas de handoff para quem continuar o desenvolvimento. Última atualização: 24/07/2026.

## Concluído (24/07/2026)

- **Aba Closers ganhou paridade completa com a aba SDR** (mesma estrutura, dados do funil de
  negociação Opp → SQL → Offer → Contract):
  - **7 KPIs no mesmo padrão da SDR**: Entradas (Opp in), Saídas do funil (CW + Lost, com win
    rate na sub-linha), Estoque atual (com Δ estoque), **C1 · Opp→SQL** e **C2 · SQL→Offer**
    (coortes na mesma semana, mesmo conceito do C1/C2 de SDR), **Opp/FTE/BD** e **CW/FTE/BD**.
  - **Novo card "Status atual por semana de entrada (opp)"** (`closerStatusHTML()`), mesmo
    padrão do `sdrStatusHTML` — barras empilhadas por semana de virada-em-opp × situação hoje
    (opp/sql/offer/contract/closed_won/lost_deal).
  - **"CW por nível de cliente" ganhou linha de meta** (do budget diário, igual à "Abertura por
    nível" da SDR) — antes só mostrava o realizado.
  - **Tabela "Closers · por pessoa" reformulada**: produtividade por dia útil (Opp/BD e CW/BD,
    média 3 semanas), coorte C1 por pessoa em 3 semanas (Semana N / Semana N-1), agrupada por
    estratégia com totais, e agora **ordenável** (clique no cabeçalho, como a tabela de SDR).
  - **Filtro de Estratégia (Outbound/Inbound/Hunting), que antes só aparecia na sub-aba SDR,
    agora também filtra Closers** (KPIs, estoque, status, tabela por pessoa).
  - Novos campos em `build_data.js`: `closerCohort` (C1/C2), `closerCohortStatus`, `closerLost`,
    `closerCw`, `closerOppFte`, `closerCwFte`, `cohOpp`/`cohSql` (em `porPessoa.closer[].
    porSemana`), e rastreamento de `estrategia` por closer (não existia — necessário pro filtro
    e pro agrupamento da tabela).
  - ⚠️ **Duas coisas ficaram MOCADAS de propósito, com badge de alerta visível** (`⚠ a validar`)
    em vez de simular um número de meta que ninguém confirmou:
    - **Meta da coorte C1 (Opp→SQL)** — a SDR tem uma meta fixa de 10% combinada à parte
      (`COH_META`); não existe equivalente confirmado pro Closer ainda.
    - **Meta de produtividade por dia útil (Opp/BD e CW/BD)** — a SDR usa `BD_TGT` com valores
      combinados por estratégia; criei `BD_TGT_CLOSER = {}` **vazio de propósito** em
      `index.html`. Enquanto ficar vazio, toda célula de Opp/BD e CW/BD mostra o valor real
      calculado + o badge de alerta, nunca um % de atingimento inventado. Assim que o time de
      Closer passar os números certos, é só preencher `BD_TGT_CLOSER` no mesmo formato do
      `BD_TGT` de SDR (`{Outbound:{opps:X,cw:Y}, ...}`) que os badges somem sozinhos.

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
- **Tabela "SDR · por pessoa"**: a coluna de conexão virou **coorte C2 por pessoa** (novo
  campo `cohortRate` em `porSemana`, no `build_data.js` — dos leads que a pessoa contatou
  NAQUELA semana, quantos conectaram na MESMA semana; antes era throughput, podia passar de
  100%). Distribuição de opps por nível passou a refletir só as 3 últimas semanas (era
  acumulado desde sempre). As colunas "−1"/"−2" viraram **"Semana N"** com o número real da
  semana (`Semana 29`, `Semana 28` etc.), calculado a partir da semana selecionada.
- **Aba Closers redesenhada no mesmo estilo visual do SDR**, usando as métricas que já
  existiam (opp/sql/cw/sqlRate/winRate/cwNivel/ciclos) — sem inventar cohort/FTE novos pra
  Closer ainda. CW por nível virou 3 cards lado a lado (8 semanas). Tabela por pessoa ganhou
  progressão "CW sem./Semana N/Semana N" e "Win rate/Semana N/Semana N", CW por nível na
  janela de 3 semanas, e produtividade por dia útil (SQL/dia, CW/dia).
- **Novo "Estoque do funil Closer" na aba Closers** (`closerEstoque` no `build_data.js`,
  `closerEstoqueHTML()` no front) — mesmo padrão visual do estoque de SDR, rastreando leads
  que viraram opp e estão parados em **Opp → SQL → Offer → Contract** (sai do estoque ao
  fechar, ganho ou perdido). ⚠️ *Correção:* na primeira versão isso tinha sido implementado
  como o funil pós-CW (CW→1k→5k) por engano — o Gabriel corrigiu: **isso é Onboarding, não
  Closer**. O funil pós-CW foi movido pra `onbEstoque`/`onbEstoqueHTML()`, na aba
  **Onboarding** ("Estoque de ativação"), comparado com `Carteira_CW_not1k/not5k/not10k`.

  ⚠️ **Mesma limitação nos dois estoques (SDR e o novo Onboarding), mesmo motivo:** o Power BI
  usa um campo de "baixa" (`lead_end_date` no funil de SDR, `Onboarding_close_date` no funil
  pós-CW) pra tirar do estoque quem parou de progredir sem cruzar o próximo patamar.
  **Nenhum dos dois campos existe no nosso `SELECT *`** de `dhmv_sales_touched` (conferido nas
  101 colunas do `06_operacional_raw.csv`) — então, nesses dois estoques nossos, quem trava
  numa faixa fica acumulando ali pra sempre, em vez de "envelhecer" pra fora como no Power BI.
  Os nossos números tendem a ficar **maiores** que os de lá, principalmente nas faixas mais
  antigas. O estoque de Closer (Opp/SQL/Offer/Contract) não tem essa limitação documentada
  ainda — ainda não recebemos a medida DAX equivalente do Power BI pra comparar.
  Se um dia esse(s) campo(s) (ou equivalente) entrar no export, dá pra replicar a baixa exata.

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
- `cohortRate` (dentro de `porPessoa.sdr[].porSemana[semana]`) — coorte C2 por pessoa (mesma
  lógica do `sdrCohort`, só que por SDR individual em vez do agregado).
- `diasUteisSemana[semana]` — dias úteis (seg-sex) já decorridos até hoje em cada semana
  (não indexado por estratégia, nem por área — é geral, usado por SDR/Closers).

Alimenta a página **Semanal Área › Closers**:

- `closerEstoque` — estoque do funil de negociação (opp/sql/offer/contract) por lead,
  mesmo padrão do `sdrEstoque` (sai ao fechar ganho ou perdido).
- `closerCohort` — coorte de negociação: virou opp na semana × chegou a SQL na mesma semana
  (C1) × chegou a Offer na mesma semana, do sub-coorte que chegou a SQL (C2, encadeado —
  mesmo padrão do `sdrCohort`).
- `closerLost` / `closerCw` — nº de lost deals / CW por semana, só de leads com closer
  atribuído (mesmo papel do `sdrUnq` pro SDR — throughput de saída do funil).
- `closerOppFte` / `closerCwFte` — nº de closers distintos que receberam opp / fecharam CW
  na semana (denominador do "Opp/FTE" e "CW/FTE", mesmo papel do `sdrOppFte`/`sdrContactFte`).
- `closerCohortStatus` — por semana de ENTRADA no closer (opp), status atual (hoje) de cada
  lead: opp/sql/offer/contract/closed_won/lost_deal (data mais recente vence).
- `cohOpp`/`cohSql` (dentro de `porPessoa.closer[].porSemana`) — coorte C1 por pessoa (mesma
  lógica do `closerCohort`, só que por closer individual em vez do agregado).

Alimenta a página **Semanal Área › Onboarding**:

- `onbEstoque` — estoque de ativação pós-CW (cw/a1k/a5k) por `opp_id` (sai ao ativar 10k).

Regenerar: `node app/build_data.js` (lê `Dados/*.csv` locais).

## Backlog / a confirmar

1. **FTE de SDR/Closer real:** "Contacted/FTE", "Opps/FTE", "Opp/FTE" e "CW/FTE" usam como FTE
   quem de fato contatou/gerou opp/recebeu opp/fechou na semana (aproximação). Trocar por base
   de headcount/escala real quando disponível.
2. ~~"Produtividade diária" (tabela por pessoa) usa ÷5/÷15 fixo~~ — **resolvido**: a tabela de
   SDR (`pdContacted`/`pdOpp`) e agora também a de Closer (`pdOpp`/`pdCw`) já usam
   `D.diasUteisSemana` (dias úteis realmente decorridos) em vez de dividir por 5/15 fixo.
3. ~~Filtro de Estratégia só na sub-aba SDR~~ — **resolvido pra Closers** (24/07): agora
   filtra KPIs, estoque, status e tabela por pessoa igual à SDR. **Ainda falta em Onboarding.**
4. **Tabela por pessoa × estratégia:** o filtro de estratégia nas tabelas de SDR e Closer usa a
   **estratégia primária** da pessoa (aprox., o último valor visto). Preciso por lead/semana
   exigiria quebrar o `porSemana` por estratégia no build.
5. **Chip de ícone nos KPI cards** (estilo Stravix, círculo colorido) — não implementado.
6. **Definição de "status atual" e "saída do estoque":** hoje um lead sai do estoque de SDR
   quando vira opp/qualificado ou é desqualificado; sai do estoque de Closer quando fecha
   (ganho ou perdido). Confirmar se as duas regras batem com a operação.
7. **Validar `sdrEstoque` e `onbEstoque` contra o Power BI.** O Gabriel já comparou a lógica
   com as medidas DAX (`Carteira_Contacted/Connected/Nurturing` pro SDR e
   `Carteira_CW_not1k/not5k/not10k` pro Onboarding) — a estrutura bate, mas os números não
   devem fechar exatamente por causa do `lead_end_date`/`Onboarding_close_date` que não temos
   (ver "Concluído" 23/07 acima). Ainda falta comparar número a número numa semana específica
   pra medir o tamanho real da diferença. **`closerEstoque` (Opp/SQL/Offer/Contract) ainda não
   tem medida DAX equivalente enviada pra comparar.**
8. **Onboarding ainda sem paridade com SDR/Closer** — ganhou só o estoque de ativação (23/07);
   sem filtro de estratégia, sem coorte/FTE, sem "status atual", sem KPIs no padrão
   Entradas/Saídas/Estoque. Replicar o mesmo trabalho feito em Closers hoje, adaptado ao funil
   de ativação (CW → 1k → 5k → 10k).
9. **Validar com o time de Closer as metas mocadas (24/07)** — hoje aparecem com badge
   "⚠ a validar" em vez de simular um número:
   - Meta da coorte **C1 · Opp→SQL** (equivalente ao `COH_META=10%` fixo do SDR — precisa de um
     valor real de negócio, hoje não existe nenhum).
   - Metas de produtividade **Opp/BD e CW/BD** por estratégia (`BD_TGT_CLOSER` em `index.html`,
     hoje `{}` vazio — preencher no mesmo formato do `BD_TGT` de SDR assim que o time passar
     os números certos).
10. **`closerCohort`/`closerCohortStatus`/`closerLost`/`closerCw` ainda não foram validados
    contra nenhuma medida DAX do Power BI** (diferente do `sdrCohort`/`sdrCohortStatus`, que já
    foram comparados na lógica, ver item 7). Se o time de Closer tiver medida equivalente,
    comparar número a número antes de confiar 100% nos valores.

## Convenções do projeto (não esquecer)

- Só commitar/push quando o Gabriel/Guilherme pedir explicitamente.
- `build_data.js` só lê campos por nome do `06_operacional_raw.csv` (que tem PII) — nunca
  fazer spread da linha inteira pro `app_data.js`.
- `FILTRO_ANO`/`FILTRO_ANO`-equivalente restringe filtros de mês ao ano corrente — ajustar na
  virada de ano.
