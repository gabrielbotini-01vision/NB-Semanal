# Pendências · New Business Cockpit

Notas de handoff para quem continuar o desenvolvimento. Última atualização: 06/08/2026.

## Concluído (06/08/2026)

- **Semanal Sales: tabela "Fechamento por nível de cliente" — coluna direita vira MTD, não
  YTD** — a pedido do Gabriel. YTD nessa tabela por nível fica só na Mensal Sales; na Semanal
  Sales a coluna direita agora soma as semanas do MÊS da semana fechada (`D.semanaMes[semana]`
  + `w<=semana`), não o ano inteiro. O gráfico "Net Revenue · YTD" acima da tabela não mudou
  (continua ano inteiro, como já era). Testado: `Semana fechada — semana 31/2026` /
  `Month to date — jul/2026` corretos nos dois lados.
- **1:1 Gestor: reformulado** — a pedido do Gabriel, várias mudanças juntas:
  - **Lista lateral vira toggle por área** (SDR/Closers/Onboarding), mesmo padrão de subtabs da
    Semanal Área, em vez de mostrar as 3 áreas juntas numa lista só. Estado próprio
    (`state.areaOneOne`) — independente do `state.area` da Semanal Área (trocar um não afeta o
    outro). Mapa `AREA_TO_ONEONE_KIND` traduz as chaves da Semanal Área (`sdr/closers/onboarding`)
    pras chaves do 1:1 (`sdr/closer/onb`, convenção antiga, mantida).
  - **Novo card "Ações em aberto"** (4º card, ao lado de Destaques/A melhorar/Ações da Semana) —
    gerado por REGRA (não texto livre, não precisa de dado novo salvo em lugar nenhum):
    `coaching()` agora retorna `flags` estruturais (`lowRate`/`belowMedian`) além dos textos;
    `openActions()` compara os flags da semana selecionada com os da semana anterior — o que
    persistiu nas duas é uma pendência que não foi resolvida entre um 1:1 e outro.
  - **Gráficos de Estoque + Status por PESSOA** (mesmos gráficos já existentes na Semanal Área,
    agora calculados só com os leads daquela pessoa). Exigiu agregação nova no `build_data.js`:
    `sdrEstoquePessoa`/`closerEstoquePessoa`/`onbEstoqueSemanalPorPessoa` (snapshot, mesma regra
    de entrada/saída dos equivalentes por estratégia/nível, chaveados por owner/closer/onboarder)
    e `sdrCohortStatusPessoa`/`closerCohortStatusPessoa`/`onbCohortStatusPessoa` (coorte por
    pessoa, preenchidos lazy dentro do loop principal). As 6 funções de gráfico
    (`sdrEstoqueHTML` etc.) foram refatoradas em wrapper + núcleo `*Bars(dadosBrutos)`, reusado
    tanto pela Semanal Área (por estratégia/nível) quanto pelo 1:1 (por pessoa). Validado:
    soma por pessoa bate exato com o agregado "all" da Semanal Área, semana a semana.
  - **Tabela "Informações safradas por semana"**, por pessoa, com semana por LINHA (não mais por
    coluna) — usa o `p.porSemana` que já existia, sem precisar de dado novo. Últimas 10 semanas
    até a selecionada, mais recente primeiro.
  - Toggles de granularidade (Semana/Mês) e Absoluto/100% (gráfico de Status do Onboarding)
    reaproveitados também aqui — `setEvolGran`/`setOnbStatusPct100` agora checam
    `state.meeting` pra re-renderizar a página certa (`renderOneOne` vs `renderArea`).

## Concluído (04/08/2026)

- **Gráfico "Estoque do funil Closer": Opp e Issues unidos numa faixa só ("Opp")** — a pedido
  do Gabriel, pra ele são a mesma coisa. Passa de 5 faixas (Opp/Issues/SQL/Offer/Contract) pra
  4 (Opp/SQL/Offer/Contract), mesmo padrão dos merges recentes (1k+/5k+ do Status de
  Onboarding): só na renderização (`closerEstoqueHTML`, `r.opp+r0.issues`), `D.closerEstoque`
  continua com os 2 campos originais — o card separado "Opps em Issues" (KPI) não foi tocado,
  continua mostrando o snapshot isolado desse sub-estágio. Testado: total da barra ainda bate
  exato com a soma dos 4 segmentos exibidos.
- **Legenda do card "Estoque do funil Closer" (hint + descrição do KPI "Estoque atual")
  atualizadas** pra refletir o merge acima — não mencionam mais "Issues" separado.
- **Gráfico "Status atual por semana de entrada (opp)" (Closer): linha de conversão trocada
  de `closed won / total que virou opp` pra `closed won / SQL`** — a pedido do Gabriel.
  Denominador = quem chegou em SQL ou além (`sql+offer+contract+closed_won+lost_deal`),
  excluindo só quem ainda está parado em "opp" (nunca chegou em SQL). Testado: 14 CW / (12
  SQL + 10 Offer + 0 Contract + 14 CW + 2 Lost = 38) = 37%, bateu exato.

## Concluído (03/08/2026)

- **Gráfico "Status atual por semana de entrada (CW)" (Onboarding): Ativado 10k movido pra
  base da barra + botão Absoluto/100%** — a pedido do Gabriel, só nesse gráfico específico
  (SDR/Closer não foram tocados). Ordem do array `ST` invertida (`cw` primeiro/topo,
  `ativado_10k` último/base — `.ecol` empilha em `flex-direction:column`, 1º elemento = topo).
  Novo estado `state.onbStatusPct100`: no modo 100%, cada barra normaliza pelo PRÓPRIO total
  (não pelo máximo da série) e os segmentos mostram % em vez do valor absoluto; testado nos
  dois sentidos (alturas somam exatamente 180px = 100% no modo novo).
  - **1k+ e 5k+ unidas numa faixa só** ("Vendendo, não ativado 10k"), no mesmo gráfico — virou
    3 faixas (CW / vendendo / ativado 10k) em vez de 4, mesmo espírito da reclassificação do
    Estoque de ativação. Só junta na hora de renderizar (`s0.a1k+s0.a5k`); o dado por trás
    (`D.onbCohortStatus`) continua com os 4 campos originais, sem mudança no build_data.js.
- **Card "CW → 10K" (KPIs de Onboarding, Semanal Área) virou "Ativação 10K"** — a pedido do
  Gabriel: era uma coorte (% que ativou 10k na MESMA semana do CW, ficava baixo por natureza
  já que o ciclo é ~50 dias); agora é throughput simples — quantas contas ativaram 10k GMV
  **na semana** (`D.onbAct`, mesmo dado já usado no cálculo de FTE), com `meta X · %` quando
  há budget (mesmo padrão do card "Entradas"). Variável `c10kPct` (não usada mais) removida.
- **Fallback CW+90d estendido pro Accomplished também** (mesma regra do Unaccomplished, a
  pedido do Gabriel): se `onboarding_status === 'Accomplished'` e `onboarding_accomplished_date`
  vier vazia, usa `closed_won_date + 90 dias`. Campo `accompFallback` (espelha
  `unaccompFallback` já existente) marca quando o valor é estimado.
  - **Impacto grande no bucket "ativos"** (muitos CW com `activation_date_10k` preenchida
    tinham status Accomplished sem data, então ficavam contando como ativos em vez de
    sair): 567→281 na última semana (240 nuncaVendeu / 86 vendendo / 281 ativos = 607 total).
  - 290 registros receberam o fallback de Accomplished, 754 o de Unaccomplished (1.044 no
    total, de 4.743).
  - Tela de validação (`validacao_onboarding_pessoa.html`) atualizada: checkbox e busca agora
    cobrem os dois tipos de fallback, selo "estimado: CW+90d" aparece tanto em Accomplished
    quanto em Unaccomplished no painel de detalhe.
- **Bug real encontrado e corrigido no JOIN de `Querys/06_operacional_raw.sql`: opps sem
  `lead_id` nunca traziam `onboarding_status`/accomplished/unaccomplished, mesmo quando a
  fonte tinha o dado certo.** Achado a partir de um caso concreto que o Gabriel reportou (opp_id
  `006SG00000VO9rZYAT`, onboarder Phellipe Leão, contando como "ativo" quando deveria ter saído
  do estoque há meses).
  - **Causa raiz**: o JOIN com `dhm_data_business.f_operational_sales_touched` era só por
    `lead_id` (`ON f.lead_id = t.lead_id`). Quando `lead_id` é NULL nas duas tabelas (opp sem
    lead — mesmo cenário do fix de `is_lead_br_funnel`/`is_opp_br_funnel` de 31/07), o JOIN
    nunca casa (`NULL = NULL` é sempre falso em SQL), então a linha nunca traz o status —
    mesmo a linha existindo em `f_operational_sales_touched` com o dado certo. Confirmado
    rodando query ad-hoc direto no Redshift (via Astrobox, reaproveitando `load_token`/
    `run_query` do `scripts/atualizar_dados.py`): o registro em questão existe lá com
    `onboarding_status='Unaccomplished'`, `onboarding_unaccomplished_date='2026-03-26'`,
    `onboarding_unacomplished_reason='Ghost'` — exatamente a data que o Gabriel informou.
  - **Descoberta útil**: `f_operational_sales_touched` **tem uma coluna `opp_id`** (~160
    colunas na tabela, listadas via `SELECT * LIMIT 1` — `information_schema` não funciona
    nesse datasource). 4.459 linhas nela têm `opp_id` preenchido mas `lead_id` vazio — essa é
    a população inteira que ficava invisível.
  - **Fix**: JOIN agora casa por `lead_id` quando existir, senão cai pra `opp_id`
    (`ON (t.lead_id IS NOT NULL AND f.lead_id = t.lead_id) OR (t.lead_id IS NULL AND
    f.opp_id = t.opp_id)`). `f_operational_sales_touched` tem uns poucos `opp_id` duplicados
    (6 de 40 mil) — usei um `ROW_NUMBER() OVER (PARTITION BY COALESCE(lead_id, opp_id) ...)`
    pra dedup antes do JOIN (Redshift não tem `DISTINCT ON` nem `FILTER`, testado e confirmado
    via erro de sintaxe). **Validado no Redshift antes de aplicar**: recupera status pra +191
    linhas do recorte atual (8.475→8.666), e as poucas duplicatas de `opp_id` que aparecem
    depois do JOIN já existiam em `dhmv_sales_touched` sozinha, antes de qualquer JOIN — não são
    causadas por essa mudança.
  - **Impacto depois de re-puxar os dados**: estoque de ativação caiu mais um pouco (954→897
    na última semana: nuncaVendeu 256→242, vendendo 91→88, ativos 607→567) — menor que o fix
    do fallback CW+90d (que resolveu a maioria dos casos antigos sem `lead_id` nenhum), mas
    real. O opp_id do exemplo agora aparece corretamente como "saiu", com a data REAL (não
    fallback) — `unaccompFallback: false` na tela de validação.
- **Tela de validação atualizada** (`validacao_onboarding_pessoa.html`): dropdown de consulta
  por `opp_id` ganhou busca (por id/onboarder/e-mail), checkbox "só registros com data
  estimada" e um selo visual ("estimado: CW+90d") no painel de detalhe quando a data de
  Unaccomplished veio do fallback em vez da fonte — pra distinguir os dois casos na
  homologação.
- **Fallback pro `onboarding_unaccomplished_date` vazio: CW + 90 dias, quando o status já é
  "Unaccomplished"** — a pedido do Gabriel, resolve de vez o item 17 do Backlog (achado de
  30-31/07: 367 leads travados no estoque por terem status certo mas data vazia). Em
  `onbLeadsMap` (`build_data.js`): se `onboarding_status === 'Unaccomplished'` e
  `onboarding_unaccomplished_date` vier vazia, usa `closed_won_date + 90 dias` no lugar (nova
  função `addDaysStr`). Só se aplica a Unaccomplished — Accomplished sem data não foi pedido e
  não foi mexido.
  - **Impacto grande, como esperado** (isso destrava os leads que ficavam presos pra sempre):
    estoque de ativação caiu de 1.701 pra 954 (nuncaVendeu 541→256, vendendo 219→91, ativos
    941→607) na última semana. Dos 4.743 registros na tela de validação, 3.789 agora saem do
    estoque corretamente (accomplished/unaccomplished), contra bem menos antes.
  - Testado: números do dashboard batem exato com a tela de validação (`validacao_onboarding_
    pessoa.html`) depois do rebuild.
- **Estoque de ativação (Onboarding) reclassificado: nunca vendeu / vendendo / ativos** —
  resolve o item 18 do Backlog (registrado em 01/08, as definições vieram agora). Campos e
  regra final:
  - **ativo** = `activation_date_10k` preenchida — era exatamente o campo que já usávamos
    (`a10k`), só que agora com um papel diferente (ver saída, abaixo). Não precisou de nenhum
    campo/query novo.
  - **vendendo** = tem `activation_date_1k` OU `activation_date_5k` preenchida, mas ainda não é
    "ativo" (não chegou em 10k) — "já tem GMV, ainda não é ativo".
  - **nunca vendeu** = CW sem nenhuma das três datas de ativação — "sem GMV nenhum ainda".
  - **Entrada do estoque continua sendo o CW** (`closed_won_date`) — sem mudança.
  - **Saída do estoque mudou**: antes saía por `ativou 10k` OU `accomplished/unaccomplished`;
    agora **só sai por accomplished/unaccomplished** — "ativo" deixou de ser uma saída e virou
    uma faixa que fica acumulando no estoque (por isso o total do estoque cresceu bastante —
    ~800 → ~1.700 na última semana — esperado, é a mudança pedida, "ativos não saem").
  - Implementado em `onbEstoque` (`build_data.js`) e `onbEstoqueHTML` (`index.html`, legenda/
    cores/tooltip). O card "Status atual por semana de entrada (CW)" (`onbStatusHTML`) **não
    foi tocado** — continua com as faixas antigas (CW/1k+/5k+/Ativado 10k), que é uma coisa
    diferente (coorte por semana de entrada, não estoque).
  - ⚠️ **Não mexido de propósito**: o pill "Δ estoque" do KPI "Estoque atual" (`renderAreaOnboarding`
    em `index.html`) calcula saídas como `totAct` (throughput de ativações 10k na semana), não
    como accomplished+unaccomplished — ficou desalinhado da nova regra de saída do estoque (já
    era impreciso antes dessa mudança também, não é uma regressão nova). Se quiser que o Δ
    reflita exatamente entradas−saídas do novo estoque, trocar `totAct` por
    `coh.accomplished+coh.unaccomplished` nesse cálculo.
  - Testado no navegador: legenda/tooltip corretos, números batem (541/219/941 = 1.701 na
    semana 32), toggle Semana/Mês funciona igual, sem erros de console.
- **Tela temporária de homologação** (`app/validacao_onboarding_pessoa.html`), a pedido do
  Gabriel, pra conferir a reclassificação acima manualmente:
  - Tabela agregada por onboarder (nunca vendeu/vendendo/ativos/total), lendo
    `D.onbEstoquePorPessoa` (novo campo em `app_data.js`, snapshot de HOJE — não por semana).
  - Consulta individual por `opp_id`: campo de busca (por id/onboarder/e-mail) + dropdown +
    painel mostrando as datas cruas (CW/1k/5k/10k/accomplished/unaccomplished) e a situação
    calculada daquele registro. Dado (4.743 registros) fica num arquivo **à parte**
    (`app/validacao_onboarding_data.js`, gerado pelo `build_data.js` junto com o `app_data.js`)
    pra não inflar o arquivo principal que o dashboard todo carrega.
  - ⚠️ **Bug pego no meio do caminho**: o campo `ativos` (contagem) no `onbEstoquePorPessoa`
    tinha sido nomeado `ativo` (singular) na primeira versão — colidia com o campo `ativo`
    (booleano, status no roster) que `enrichPessoa()` já seta em qualquer pessoa. Renomeado pra
    `ativos` (plural); conferido que a soma por pessoa bate exata com o agregado semanal.
  - ⚠️ **Temporário, tirar depois de homologado**: os dois arquivos
    (`validacao_onboarding_pessoa.html`, `validacao_onboarding_data.js`) e o campo
    `onbEstoquePorPessoa`/bloco que o gera em `build_data.js` não fazem parte do dashboard.

## Concluído (01/08/2026)

- **Toggle Semana/Mês nos gráficos de Estoque e Status atual (Semanal Área — SDR, Closer e
  Onboarding).** Um botão só (`granToggleHTML()`, estado compartilhado `state.evolGran`) acima
  das duas seções "Evolução do resultado" (Estoque + Status), nas 3 sub-abas — trocar em uma
  página mantém a escolha ao navegar pras outras.
  - **Dois jeitos diferentes de agregar por mês**, dependendo do tipo de gráfico:
    - **Estoque** (`sdrEstoque`/`closerEstoque`/`onbEstoque`) é um **snapshot** (quantos estão
      parados agora) — não dá pra somar semanas. `estoqueParaMes()` pega o snapshot da
      **última semana de cada mês** (fim de mês), não soma nada.
    - **Status atual** (`sdrCohortStatus`/`closerCohortStatus`/`onbCohortStatus`) é
      **coorte/throughput** (quantos entraram naquela semana × situação hoje) — dá pra somar.
      `statusParaMes()` **soma** as contagens de todas as semanas do mês.
  - Visão mensal mostra últimos 12 meses (em vez de 16 semanas); rótulo do eixo vira
    `mesLabelShort` (ex. "jul/26"); "Variação do estoque · WoW" vira "· MoM" no modo mensal.
  - Testado no navegador nas 3 sub-abas: alterna corretamente, valores mudam, volta pra semana
    sem problema, sem erros de console.
- **Filtro de Nível (N2-N3/N4-N5/N6+) na Semanal Área — só Closer e Onboarding, não SDR.**
  A pedido do Gabriel: um segundo `<select>` (`selNivelArea`) ao lado do de Estratégia,
  **independente** dele (escolher um reseta o outro pra "Todos/Todas" — nunca os dois filtrando
  ao mesmo tempo, decisão explícita do Gabriel pra não precisar de um produto cartesiano
  estr×nível). Só aparece nas sub-abas Closers/Onboarding (`ctlNivelArea` some em SDR).
  - **`build_data.js`**: novo `CO_KEYS = ['all', ...ESTRS, ...NIVEIS]` — as 12 estruturas de
    Closer/Onboarding que já eram indexadas por estratégia (`closerCohort`,
    `closerCohortStatus`, `closerCohortSqlCw`, `closerLost`, `closerCwAcc`, `closerOppFteSet`,
    `closerCwFteSet`, `closerEstoque`, `onbCohort`, `onbCohortStatus`, `onbActAcc`,
    `onbCwFteSet`, `onbActFteSet`, `onbEstoque`) ganharam as 3 chaves de nível como **entradas
    irmãs** no mesmo dicionário (não um cruzamento estr×nível — cabe porque o filtro é
    independente). `closerLeads`/`onbLeadsMap` ganharam o campo `nivel` (via
    `bucketFromAmount`) pros dois estoques conseguirem bucketizar por nível também.
    `sdrEstoque`/`sdrOppFte`/`sdrContactFte` **não foram tocados** (continuam só com
    `ESTOQUE_KEYS`, sem nível — átomo do pedido do Gabriel).
  - **`index.html`**: `renderAreaClosers()`/`renderAreaOnboarding()` ganharam `filtF =
    state.nivelArea!=='all' ? state.nivelArea : estrF` — todas as buscas em `D.closerXxx`/
    `D.onbXxx` (KPIs, Estoque, Status, C4, FTE/produtividade) passaram de `[estrF]` pra
    `[filtF]`. `renderAreaSdr()` não foi tocado.
  - ⚠️ **Escopo consciente**: a tabela "Closers/Onboarding · por pessoa" **não é filtrada por
    nível** — nível é atributo do NEGÓCIO (cliente), não da pessoa (um closer atende contas de
    vários níveis), e a tabela por pessoa usa `porSemana` por pessoa que não tem quebra por
    nível hoje. Filtrar isso exigiria uma reestruturação bem maior (nível dentro de
    `porPessoaCloser[].porSemana[semana]`), fora do escopo pedido — a tabela continua mostrando
    todo mundo, só os cards/estoque/status acima dela é que respeitam o filtro de Nível.
  - Testado no navegador: nos dois sentidos (Nível reseta Estratégia e vice-versa), KPIs mudam
    de valor ao trocar de nível, filtro some corretamente ao voltar pra SDR, sem erros de
    console.


- **Nova aba "Semanal Sales"** (item 16 do Backlog anterior, agora resolvido): mesma estrutura
  e mesmos dados da Mensal Sales (5 KPIs Net Revenue/Opp/CW/GMV/Ativação 10K com Budget/
  Resultado/%Atingimento, tabela YTD e "Fechamento por nível de cliente" N2-N3/N4-N5/N6+), só
  que em cima de **semana** em vez de mês: "Semana fechada" no lugar de "Mês fechado" (com
  variação WoW no lugar de MoM) e "YTD por semana" no lugar de YTD por mês (semana 1 → semana
  selecionada, mesmo ano).
  - **"Semana fechada"**: nova regra `semanaFechada` em `build_data.js` (mesmo padrão do
    `mesFechado` já existente) — a reunião semanal é toda segunda-feira e revisa a semana que
    ACABOU DE FECHAR, então é sempre "a semana mais recente anterior à semana de hoje" (por
    data corrida), não "a última semana com dado". Fica estável a semana inteira até a virada
    da próxima segunda. Testado hoje (31/07, dentro da semana 31): `semanaFechada.semana` =
    2026-W30, correto.
  - **Reaproveitado de propósito** (em vez de duplicar): `mensalKpiCard` ganhou um parâmetro
    `suffix` (default `'MoM'`, a Semanal Sales passa `'WoW'`) e `nivelMiniTable` ganhou
    parâmetros `actualSrc`/`budgetSrc` (default `D.actual.mensal`/`D.budget.mensal`, a Semanal
    Sales passa `D.actual.semanal`/`D.budget.semanal`) — `metricsForSemana`/`nivelTotal` já
    eram genéricos o bastante, não precisaram mudar.
  - **Substituiu por completo** o layout antigo que já existia sob o nome "Semanal Sales"
    (funil + KPIs + ritmo por estratégia + ranking de closers), que estava escondido da
    navegação desde 28/07/2026 a pedido do Gabriel. Código antigo exclusivo dessa versão
    (`kpisHTML`, `funnelHTML`, `estrHTML`, `cicloHTML`, `segHTML`, `trendHTML`, `rankingHTML`,
    `entradasHTML`, `weeklyTotals`, consts `KPIS`/`FUNNEL`/`CIC`) foi removido — recuperável via
    git history se precisar no futuro. `semanaLabel`/`weeksInMonth`/`metricsForSemana` foram
    mantidos (reaproveitados por Semanal Área/1:1 Gestor ou pela nova Semanal Sales).
  - Controles simplificados: era Mês→Semana (cascata) + Estratégia + Referência
    (Budget/Reforecast); virou só Semana (todas do ano, sem cascata) + Estratégia — mesmo
    padrão de 2 controles da Mensal Sales.
  - Testado no navegador: seletor de semana troca corretamente (default = semana fechada),
    filtro de estratégia funciona, tabela YTD tem 31 colunas (semana 1 a 30) com scroll
    horizontal, sem erros de console.
  - **Segunda seção de cards "Realização vs meta · Semana Anterior"** logo abaixo da primeira
    (mesmo dia, a pedido do Gabriel): os mesmos 5 KPIs, sempre **1 semana antes da que estiver
    selecionada no topo** (não fixo em "semana fechada − 2"; se o usuário trocar a semana no
    seletor, essa segunda seção acompanha, ficando sempre "a anterior à selecionada"). Reaproveita
    `prev` (`D.semanas[idx-1]`), que já existia pro cálculo de WoW da primeira seção — a segunda
    seção tem seu próprio WoW, contra `D.semanas[idx-2]`.
- **`lead_flow`/`lead_flow_segmentation` (PQL/PPQL/Seed 1-2) passou a filtrar TODAS as
  contagens de funil, não só o Estoque de SDR/Onboarding — validado com match EXATO contra o
  Power BI.** O Gabriel mandou print do painel "Dashboard | Página Principal" do Power BI
  (Oportunidades/Closed Wons/Ativações, MTD/MTE vs budget), com os filtros "em todas as
  páginas" visíveis: `Current_office = BRAZIL`, `lead_flow` não é PPQL/PQL,
  `lead_flow_segmentation` não é Seed 1/Seed 2. Comparei contra o nosso Mensal Sales: pra
  jul/2026 MTD, o Power BI mostrava Opp=349/CW=141/Ativação=102 e o nosso card mostrava
  359/146/102 — pequena diferença em Opp/CW.
  - **Testei os dois filtros isolados nos dados de julho/2026**: aplicar só
    `lead_flow`/`lead_flow_segmentation` deu **349/141/102 — bate EXATO** com o Power BI.
    Aplicar `Current_office=BRAZIL` sozinho derruba pra 48/62/102 (mesma armadilha já
    documentada no Estoque de Onboarding, item 15 do Backlog — não usar).
  - **A causa**: `leadFlowOk()` já existia no `build_data.js` desde muito antes, mas só era
    aplicado no `sdrLeads`/`sdrEstoque`, no `onbLeadsMap`/`onbEstoque` e no `ownerReal` (que só
    gateava as métricas específicas da página SDR — FTE, coorte, opps por nível). **O loop
    principal que monta `funCell`/`funCellSemanal`** — a fonte de `D.actual.mensal`/
    `D.actual.semanal`, que alimenta os cards de Mensal Sales, Semanal Sales e Semanal Área —
    **nunca aplicava esse filtro**, então Contacted/Connected/Opps/SQL/CW/Ativação vinham
    inflados com PQL/PPQL/Seed 1-2 em TODAS as abas, não só onde já sabíamos do problema.
  - **Implementado**: `lfOk = leadFlowOk(r)` calculado uma vez por linha e usado no mesmo ponto
    de gating do fix de `is_lead_br_funnel`/`is_opp_br_funnel` de mais cedo hoje — zera o valor
    de qualquer campo de `STAGES` se `!lfOk`, então todo código que já checava
    `if (dates.xxx_date)` ficou protegido automaticamente (cohortes, ciclo, tabela por pessoa,
    FTE — tudo dentro do loop principal). `_lostD` (lost_deal_date, fora do `dates{}`) ganhou o
    gate explícito `&& lfOk` também. **`closerEstoque` continua SEM esse filtro** (mantido de
    propósito — testado em 30/07 e piora o ajuste do "Tamanho Carteira de Opps", ver Backlog
    item 9/comentário no código; é um visual de ESTOQUE, diferente do visual de THROUGHPUT MTD
    validado aqui).
  - **Resultado no histórico inteiro**: queda relevante em TUDO, não só num mês — Contacted
    -13,2% (49.639→43.106), Connected -11,2% (30.780→27.348), Opps -3,1%, SQL -2,9%, CW -3,5%,
    Ativação -1,5%. É uma correção grande porque PQL/PPQL/Seed 1-2 nunca tinham sido excluídos
    das contagens gerais antes — só do Estoque de SDR. Conferido também visualmente no
    navegador: card de Mensal Sales jul/2026 mostra exatamente Opp 349 / CW 141 / Ativação 102.
  - Dados já regenerados (`app_data.js`). **Ainda não commitado** — pedido pro Gabriel revisar
    antes, dado o tamanho do impacto.
- **Filtro de Brasil corrigido: agora é por OBJETO Salesforce (Lead vs. Opportunity), não por
  linha inteira.** O `06_operacional_raw.sql` filtrava a linha inteira com `is_lead_br_funnel =
  true` — e isso descartava, antes mesmo de chegar no `build_data.js`, **opps criadas sem lead
  ou com lead de outro office** (mas com a própria Opportunity válida no funil BR). A pedido do
  Gabriel (31/07/2026): o WHERE do SQL agora usa `OR` (`is_lead_br_funnel = true OR
  is_opp_br_funnel = true`, [Querys/06_operacional_raw.sql:68](../Querys/06_operacional_raw.sql#L68))
  pra não perder mais essas linhas, e é o `build_data.js` quem decide, **campo a campo**, qual
  filtro usar:
  - **Objeto Lead** (`contacted_date`, `connected_date`, `nurturing_date`, `qualified_date`,
    `unqualified_date`) → `is_lead_br_funnel`.
  - **Objeto Opportunity** (`opportunity_create_date`, `issues_identified_date`, `sql_date`,
    `offer_presented_date`, `contract_sent_date`, `closed_won_date`, `lost_deal_date`,
    `activation_date_10k`/`1k`/`5k`, `onboarding_status`) → `is_opp_br_funnel` (já estava certo
    pro Estoque de Closer/Onboarding via `oppValidOk`, que já checava esse campo — a lacuna era
    só nas contagens principais de funil e no Estoque de SDR).
  - Implementado com um único ponto de gating: `STAGES` (`build_data.js`) ganhou uma 3ª tag
    (`'lead'`/`'opp'`) por estágio, e a construção de `dates{}` no loop principal já zera o
    valor de cada campo se o objeto correspondente não for BR — o resto do código, que já
    checava `if (dates.xxx_date)` antes de usar, ficou automaticamente protegido sem precisar
    tocar em cada bloco individual. Só 2 leituras "soltas" (fora de um `if (dates...)`) precisaram
    de gate explícito: `ownerReal` (agora exige `leadBrOk`) e `lost_deal_date` (agora exige
    `oppBrOk`).
  - **Resultado, comparando o histórico inteiro antes/depois do fix**: `contacted`/`connected`
    (lado Lead) **não mudaram nada** (confirma que não regrediu nada) — `opps` +75, `sql` +74,
    `cw` +56, `ativação` +39 no acumulado geral. Efeito real mas modesto (edge case, não a
    maioria dos dados) — bate com o esperado pelo Gabriel.
  - Dados puxados de novo via `scripts/atualizar_dados.py` (só a query 06) e `app_data.js`
    regenerado. Roster de pessoas também mudou um pouco (63→71 SDR, 51→55 Closer, 55→59
    Onboarding no total histórico — gente que só aparecia em opps antes invisíveis).

## Concluído (30/07/2026)

- **Aba "1:1 Gestor" só mostra quem está ativo NO PAPEL certo hoje** (`enrichPessoa` em
  `build_data.js` ganhou um parâmetro `cargoEsperado`): antes, `p.ativo` só checava `Ativo='Sim'`
  na planilha de diretório, sem olhar o `Cargo` — então alguém como Olivio Blach/Lucas Guerrero
  (incluídos manualmente no roster de SDR via `SDR_MANUAL_INCLUI`, pra manter o histórico do
  funil de quando eram SDR) continuava aparecendo como SDR no 1:1 mesmo já promovidos a Closer.
  Agora `sdrList`/`closerList`/`onbList` passam o cargo esperado (`'SDR'`/`'Closer'`/
  `'Onboarding'`) e `p.ativo` só fica `true` se o `Cargo` atual na planilha bater com a lista.
  Resultado após o ajuste: **27 SDR / 17 Closer / 16 Onboarding** ativos no 1:1 (antes, o
  Olivio/Guerrero apareciam duplicados em SDR e Closer). Não afeta o Estoque/tabela por pessoa
  de nenhuma das 3 abas (só o 1:1 Gestor usa `p.ativo`).

## Concluído (29/07/2026)

- **Reconciliação dos 3 Estoques (SDR/Closer/Onboarding) com as medidas DAX/visuais reais do
  Power BI ("New Biz")** — o item 7 do Backlog (validar `sdrEstoque`/`onbEstoque` contra o
  Power BI) foi retomado a fundo, com o Gabriel mandando prints do painel de filtros dos
  visuais e as fórmulas DAX das medidas `Carteira_*`.
  - **Descoberta principal: `Dados/Imagens Sales.csv` (datasource Astrobox "Imagens Sales") já
    tem as colunas `Cargo` e `Ativo`** — dá pra derivar um roster "real" de SDR/Closer/
    Onboarding direto dessa planilha que já líamos só pra nome/foto, sem precisar de nenhum
    arquivo novo. Isso troca o heurístico antigo de `isRealSdr()` (qualquer email que já
    apareceu como `sdr_email_sf`, menos 4 exclusões manuais — incluía ~2x mais gente que o
    necessário: ex-SDRs, contas de time) pela lista oficial (`Cargo='SDR' AND Ativo='Sim'`).
    Comparado com o roster oficial do Power BI (`6.1d_SDR[Nome]`, visto no painel de filtros):
    bate 29 de 29, com 2 exceções (Olivio Blach e Lucas Guerrero, promovidos a Closer) que o
    Gabriel pediu pra manter manualmente no roster de SDR (`SDR_MANUAL_INCLUI` em
    `build_data.js`) — atuaram como SDR antes da promoção e o contato deles é relevante pro
    funil histórico.
  - **`sdrEstoque` reconciliado**: roster oficial (acima) + filtro de página do Power BI
    (`lead_flow` não é PQL/PPQL, `lead_flow_segmentation` não é Seed 1/Seed 2 — `leadFlowOk()`
    em `build_data.js`). Resultado: **bate exatamente** com o Power BI (semana 31: 1.090 = 1.090
    depois do Gabriel confirmar a inclusão manual de Olivio/Lucas Guerrero).
  - **`closerEstoque` reconciliado** contra o visual "Tamanho Carteira de Opps": roster
    `Cargo='Closer' AND Ativo='Sim'` (`isRealCloser()`) + `is_opp_valid`/`is_opp_br_funnel`
    (`oppValidOk()`, campos que já vêm no `06_operacional_raw.csv`, ~99,7% das opps já passam).
    **Testado e descartado**: aplicar `leadFlowOk()` (PQL/Seed) aqui também — piora o ajuste em
    vez de melhorar (o visual de Closer não parece usar esse filtro, ao contrário do de SDR) —
    fica documentado em comentário no código pra não reintroduzir por engano. Resultado: bate
    de perto (semana 31: 294 vs ~290 na imagem).
  - **`onbEstoque` reconciliado** contra "Tamanho Carteira de Cws", com a ajuda decisiva da
    fórmula DAX do `Onboarding_close_date` que o Gabriel passou:
    `IF(LEN(accomplished_date)>3, accomplished_date, IF(LEN(unaccomplished_date)>3,
    unaccomplished_date, DATE(2099,12,31)))` — ou seja, accomplished tem PRIORIDADE sobre
    unaccomplished (não é "o menor dos dois"). Implementado como saída do estoque (campo
    `close` em `onbLeadsMap`): antes, sem esse campo, um registro parado "envelhecia" no
    estoque pra sempre (❗ resolve a limitação documentada em "Concluído 23/07" abaixo).
    **Diferente de SDR/Closer, aqui o roster curado (`Cargo='Onboarding' AND Ativo='Sim'`)
    piora o ajuste em vez de melhorar** — testado e descartado: só 19 de 55 onboarders
    históricos estão "ativos" nesse diretório hoje, cortando o estoque bem abaixo do Power BI
    (~296 vs ~603 na semana 31). O filtro real "Nome onboarders não é em branco" foi
    implementado de forma literal (só exige `onboarding_email_sf` preenchido — quase sempre
    true, 4755/4756 dos CW já têm). Mantidos `is_opp_valid`/`is_opp_br_funnel` e
    `lead_flow`/`lead_flow_segmentation` (aqui SIM fazem diferença, ao contrário do Closer).
    **Resultado: ~682 vs ~603-712 na imagem (~13% acima) — não fechou 100%.**
    - **Investigado e descartado o filtro `Current_office=BRAZIL`** (visto como filtro
      "em todas as páginas", com cadeado, no painel do Power BI). O campo existe mesmo em
      `data_business.dhmv_sales_touched.current_office` (confirmado com o Gabriel, não é
      coluna calculada) — mas **só vem preenchido pra quem já tem `activation_date_1k`**
      (confirmado direto no Redshift, mesmo filtro Brasil+corte 2024 do nosso export: ~80% de
      cobertura entre CW, praticamente 100% correlacionado com ter ativação). Aplicar esse
      filtro corta o bloco "CW ainda sem 1k" (o maior bloco do estoque) quase por completo,
      derrubando o número bem abaixo do alvo. Também explorada a tabela onde
      `Current_office` "mora" oficialmente no modelo (`f_finance_sales` → provável
      `dhm_data_business.f_finance_sales_touched`, tabela de receita por `user_producer_id`/
      mês) — **não tem nenhuma chave (`opp_id`/`lead_id`) pra se relacionar com o funil
      operacional**, o que sugere que esse filtro "com cadeado" pode nem ter relacionamento
      ativo com o visual de Estoque no modelo do Power BI (filtro "ligado" mas sem efeito
      nesse gráfico específico — comportamento comum quando não há relacionamento entre as
      tabelas). Ver item novo no Backlog.
  - **Card "Estoque" de Closer e Onboarding redesenhados no mesmo padrão visual do de SDR**
    (`closerEstoqueHTML()`/`onbEstoqueHTML()` em `index.html`): legenda antes do gráfico
    (antes vinha depois), valor de cada segmento exibido dentro da barra (quando cabe) e nova
    linha de variação WoW (▲/▼) abaixo — antes só o Estoque de SDR tinha esse padrão completo.
- **Tabela "SDR · por pessoa" reordenada e sem colunas de semana anterior** — a pedido do
  Gabriel: `Contatados·sem., C1·sem., Opps·sem., Contat./BD·5s, Opps/BD·5s, C1·5s,
  Opp→SQL·5s, %N2-N3, %N4-N5, %N6+`. As colunas de produtividade (`Contat./BD`, `Opps/BD`)
  passaram da janela de 3 semanas pra 5 (reaproveitando a mesma janela do `Opp→SQL·5s`), e
  ganharam uma irmã nova, `C1·5s` (coorte contato→conexão acumulada em 5 semanas, mesmo
  espírito do `Opp→SQL·5s`). As colunas de semana anterior (`C1`/`Opps · S-1/S-2`) foram
  removidas.
- **Bug corrigido: colunas "Opp→CW · 5s" (Closer) e "CW→10K · 5s" (Onboarding) sempre
  zeradas.** Os campos `oppCw`/`cwAct10k` eram calculados certo dentro de `porSemana` durante o
  build, mas `buildPessoaSemanaCloser`/`buildPessoaSemanaOnb` — as funções que reconstroem o
  objeto por semana campo a campo pra exportar no `app_data.js` — esqueciam de incluí-los na
  lista. Corrigido incluindo os dois campos nessas funções; conferido depois do rebuild que
  773/1375 semana-pessoa de Closer e 704/1437 de Onboarding têm valor `>0` (antes, 100% zero).
- **Badge de % nas colunas "Hist. 5 semanas" de produtividade de Closer/Onboarding** (`Opps/BD`,
  `CW/BD`, `Ativ./BD`): como `BD_TGT_CLOSER`/`BD_TGT_ONB` continuam vazios (meta real ainda não
  confirmada, item 9 do Backlog), essas células ficavam sem nenhum badge, só o valor cru. A
  pedido do Gabriel, ganharam um badge no mesmo estilo visual (pill verde/vermelho) do
  atingimento-vs-meta do SDR, só que mostrando **variação semana a semana (WoW)** — janela de 5
  semanas atual vs. as 5 semanas imediatamente anteriores — em vez de % de meta.
  ⚠️ **Ponto de atenção pro futuro: isso é um substituto temporário, não a métrica final.**
  Assim que o time passar as metas reais de Closer/Onboarding, trocar esse badge WoW pelo de
  atingimento-vs-meta de verdade (preencher `BD_TGT_CLOSER`/`BD_TGT_ONB` no mesmo formato do
  `BD_TGT` de SDR — aí os badges de WoW somem sozinhos e vira % de meta, sem precisar mexer no
  resto do código). Ver Backlog item 9, atualizado.

## Concluído (28/07/2026)

- **Regra de nível de cliente (`bucketFromAmount` no `build_data.js`) corrigida — borda
  passa a ser inclusiva no nível DE CIMA.** Antes: `amount_12_months <= 1.000.000 → N2-N3`,
  `<= 5.000.000 → N4-N5` (quem estava exatamente em 1M ou 5M ficava no nível de baixo). Agora:
  `< 1.000.000 → N2-N3`, `< 5.000.000 → N4-N5`, `>= 5.000.000 → N6+` — confirmado com o
  Gabriel comparando contra um número real (CW de N6+ numa semana específica: eram 2, o
  esperado eram 4, por causa de 2 negócios de exatamente R$ 5.000.000 que deveriam contar
  como N6+). **Retroativo**: como o `build_data.js` recalcula o histórico inteiro a cada
  build, isso muda Opps/CW/Ativação por nível em TODAS as abas (Mensal Sales, Semanal Sales,
  Semanal Área), pra qualquer mês/semana já processado — não é só daqui pra frente. Só no mês
  fechado (jun/2026) isso moveu 714 leads de N2-N3→N4-N5 e 201 de N4-N5→N6+ no histórico
  completo (contando todos os registros na borda exata, não só o mês).
  **Net Revenue/GMV/SAP por nível também corrigidos, no mesmo dia.** Essas três métricas vêm
  de um export SQL separado (`01_receita_semana_nivel_estrategia.csv`), que já traz o nível
  pronto do Redshift — editei o corte de 1M/5M (`<=` → `<`) nas 6 queries que tinham essa
  mesma régua (`01_receita_semana_nivel_estrategia.sql`, `01b_financeira_raw.sql`,
  `02_safra_contacted.sql`, `03_safra_opportunity.sql`, `04_safra_closed_won.sql`,
  `05_produtividade.sql`) e rodei de novo via Astrobox só a `01_receita_semana_nivel_estrategia.sql`
  (é a única das 6 que o `build_data.js` realmente lê hoje — as outras 5 ficam só como
  referência histórica, editadas por consistência mas sem uso no pipeline). Conferi
  integridade: soma de Net Revenue/GMV por nível bate exatamente com o total sem quebra
  (nenhum registro se perdeu ou duplicou na redistribuição).
- **Aba Closers**: o card que era "C1 · Opp→SQL" virou **"C4 · SQL→CW"** — coorte nova e
  independente (`closerCohortSqlCw` no `build_data.js`), ancorada na semana do SQL (não do
  Opp): dos que chegaram a SQL na semana, quantos fecharam (CW) na mesma semana. O card
  "C2 · SQL→Offer" não mudou (continua encadeado a partir do `closerCohort`, ancorado no Opp).
  - **Novo card "Opps em Issues"**: contagem atual (snapshot na semana selecionada) de opps
    parados no estágio `issues_identified_date`, ainda não chegaram a SQL. Pra isso, o próprio
    **estoque do funil Closer ganhou um estágio novo**: era Opp→SQL→Offer→Contract, agora é
    **Opp→Issues→SQL→Offer→Contract** (`closerEstoque` e `closerEstoqueHTML()`) — o que antes
    ficava tudo junto em "Opp" agora se divide entre quem ainda não teve issues identificadas
    e quem já teve mas não chegou a SQL.
  - Com esses dois cards novos, a "Resultado semanal" de Closers foi de 7 pra **8 KPIs** —
    precisei adicionar suporte a grid de 8 no CSS (`.g8`, 2 linhas de 4 colunas).
- **Aba SDR**: meta da coorte **C1 · Opp→SQL confirmada em 60%** (`C1_OPP_SQL_META`) — não é
  mais mocada. Só que, a pedido do Gabriel, o card mostra a meta (`meta 60%`) **sem** o badge
  de % de atingimento (achou poluído) — então o número de atingimento é calculado
  (`c1CloPct`/`cohPct` vs `C1_OPP_SQL_META`) mas não é exibido, só a referência da meta.
  Isso vale nas duas abas onde esse card aparece (SDR e Closer, mesmo dado).
- **Aba Onboarding — pedido pausado no dia 26/07 (ver "Concluído 26/07" abaixo), retomado e
  concluído hoje:**
  - **Tirei os cards "C1 · CW→1k" e "C2 · 1k→5k".**
  - **Novo card "CW → 10K"**: coorte DIRETA na mesma semana (fechou CW em W → ativou 10k na
    MESMA W), sem exigir passar por 1k/5k — mesmo padrão do C3 que já existia no SDR
    (contato→qualificação pulando a conexão). Campo novo `a10k` dentro do `onbCohort`.
  - **"Saídas do funil" virou Accomplished/Unaccomplished.** Isso exigiu uma investigação de
    schema no Redshift (direto via Astrobox, `information_schema`/`svv_all_columns` — a busca
    por catálogo padrão não funcionava nesse datasource, tive que testar tabela por tabela):
    - **A tabela certa é `dhm_data_business.f_operational_sales_touched`** — schema DIFERENTE
      do que já usávamos (`data_business.dhmv_sales_touched`). Ela tem `lead_id` (mesma chave),
      e MUITO mais colunas de onboarding do que a nossa fonte original, incluindo
      `onboarding_accomplished_date`, `onboarding_unaccomplished_date` e um campo de
      **status direto**, `onboarding_status` (valores: Accomplished, Unaccomplished, New
      Onboarding, Active, Growth, Ready, Set Up, Activation & Monitoring, etc. — 20 valores).
    - **`Querys/06_operacional_raw.sql` ganhou um segundo LEFT JOIN** (além do já existente com
      `dhaf_salesforce."user"`) nessa tabela, por `lead_id`, trazendo as 3 colunas
      (`onboarding_status`, `onboarding_accomplished_date`, `onboarding_unaccomplished_date`).
      Confirmei antes que `lead_id` é único em `f_operational_sales_touched` pra linhas com
      `lead_id` preenchido (a única "duplicidade" que apareceu numa contagem inicial era de
      linhas com `lead_id` NULO, que não afeta o JOIN) — então o LEFT JOIN não multiplica
      nenhuma linha do nosso export (68.577 linhas antes e depois do JOIN).
    - ⚠️ **Abordagem alternativa considerada e descartada: usar as DATAS
      (`onboarding_accomplished_date`/`onboarding_unaccomplished_date`) em vez do status.**
      Essa era a primeira ideia — bucketizar "Saídas do funil" por semana usando a data, no
      mesmo padrão dos outros cards de "saídas" do projeto (SDR/Closer). Testei direto no
      Redshift: na tabela inteira (sem filtro), `onboarding_unaccomplished_date` tem 4.040
      linhas preenchidas — o campo existe e é usado. **Mas no nosso recorte (Brasil +
      CW a partir de 2024, o mesmo filtro do `06_operacional_raw.sql`), ela vem sempre
      nula.** Conferi 5 exemplos de leads com `onboarding_status = 'Unaccomplished'` e
      `closed_won_date` dentro do nosso filtro (jan-fev/2024) — nenhum tinha a data
      preenchida, mesmo com o status certo. Ou seja: implementando por data, o card
      "Unaccomplished" ficaria **sempre zerado** pros nossos dados atuais, mesmo havendo
      8.340 registros com esse status na fonte inteira. **Por isso troquei pra usar
      `onboarding_status` como SNAPSHOT** (situação de agora, não coorte por semana de saída)
      — funciona porque o status vem populado de forma muito mais confiável que a data.
      **Se um dia a Hotmart passar a preencher `onboarding_unaccomplished_date`
      consistentemente** (é um problema de qualidade de dado do lado deles, não nosso), dá pra
      trocar pra abordagem por data e ganhar a granularidade de "saiu NESSA semana" em vez de
      "está nesse status HOJE, entre quem fechou nessa semana" — a estrutura já fica pronta
      pra isso (só trocar a lógica de bucket no `build_data.js`, os dois campos já estão
      disponíveis no CSV).
    - **Como funciona hoje**: pra cada semana W (ancorada em `closed_won_date`, igual ao resto
      da página), conta quantos dos que fecharam CW em W estão com `onboarding_status` igual a
      `'Accomplished'` ou `'Unaccomplished'` **no momento do build** (não necessariamente saíram
      nessa semana — é o status atual de quem entrou naquela semana). Campos novos `accomplished`
      e `unaccomplished` dentro do `onbCohort`. Testado com semana 50/2025 (mais antiga, já com
      dado real): 16 accomplished · 20 unaccomplished, de 37 CW — bate com a query direta no
      Redshift. Semanas recentes (últimas ~8 semanas) ficam zeradas, esperado pelo ciclo longo
      de onboarding (~50 dias) — a maioria ainda não chegou a um status final.

## Concluído (26/07/2026)

- **Aba Onboarding ganhou a mesma paridade que a de Closers ganhou dia 24/07** (funil de
  ativação CW → 1k → 5k → 10k):
  - **7 KPIs no mesmo padrão de SDR/Closer**: Entradas (CW in), Saídas do funil (Ativados
    10k — única saída conhecida aqui, não existe "lost"/churn documentado), Estoque atual
    (com Δ estoque), **C1 · CW→1k** e **C2 · 1k→5k** (coortes na mesma semana), **CW/FTE/BD**
    e **Ativado/FTE/BD**.
  - ⚠️ **C1/C2 do Onboarding tendem a ficar baixos por natureza** (tipo ~5-10%, não é bug):
    o ciclo médio CW→Ativação é de **~50 dias** (`D.ciclo.dias_won_ativacao`), então a imensa
    maioria só cruza 1k/5k em semanas futuras, não na mesma semana do CW. É bem diferente do
    C1 de SDR/Closer, onde o ciclo é de poucos dias.
  - **Novo card "Status atual por semana de entrada (CW)"** (`onbStatusHTML()`), mesmo padrão
    do `closerStatusHTML` — barras empilhadas por semana de fechamento × situação hoje
    (cw/a1k/a5k/ativado_10k, sem "lost").
  - **"Ativação por nível de cliente" ganhou linha de meta** (do budget diário) e foi de 4
    para 8 semanas, igual ao padrão de SDR/Closer.
  - **Tabela "Onboarding · por pessoa" reformulada**: produtividade por dia útil (CW/BD e
    Ativado/BD, média 3 semanas), coorte C1 por pessoa em 3 semanas, agrupada por estratégia
    com totais, e agora **ordenável**.
  - **Filtro de Estratégia, que já existia em SDR e havia sido estendido a Closers, agora
    cobre as 3 sub-abas de Semanal Área** (KPIs, estoque, status, tabela por pessoa).
  - **Removidos os KPIs "Net Revenue · semana" e "GMV · semana"** que existiam antes no topo
    da aba — eram números de portfólio agregado (explicitamente "sem quebra por pessoa"),
    duplicados do que já aparece em Semanal Sales/Mensal Sales. Tirados pra manter os 7 cards
    no mesmo padrão operacional/produtividade das outras duas abas (o grid CSS só suporta até
    7 colunas — `g7` — então não dava pra manter os 4 KPIs antigos + os 7 novos juntos).
  - Novos campos em `build_data.js`: `onbCohort` (C1/C2), `onbCohortStatus`, `onbAct`,
    `onbCwFte`, `onbActFte`, `cohCw`/`coh1k` (em `porPessoa.onboarding[].porSemana`), e
    rastreamento de `estrategia` por onboarder (não existia).
  - ⚠️ **Mesmas duas coisas mocadas de propósito, com badge `⚠ a validar`**, pelo mesmo motivo
    de Closers: meta da coorte C1 (CW→1k) e metas de produtividade CW/BD e Ativado/BD
    (`BD_TGT_ONB = {}` vazio em `index.html` — preencher no mesmo formato do `BD_TGT`/
    `BD_TGT_CLOSER` assim que o time passar os números certos).
  - **Com isso, SDR/Closers/Onboarding agora têm a mesma estrutura de página** (item 8 do
    Backlog anterior, agora resolvido).

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

## Fonte de dados — segunda tabela no `06_operacional_raw.sql` (28/07/2026)

`Querys/06_operacional_raw.sql` agora faz **dois** LEFT JOIN a partir de
`data_business.dhmv_sales_touched` (a fonte principal, continua igual): um com
`dhaf_salesforce."user"` (já existia, resolve e-mail do owner) e um novo com
**`dhm_data_business.f_operational_sales_touched`** (schema `dhm_data_business`, note o "m" —
não confundir com `data_business`), por `lead_id`, só pra trazer `onboarding_status`,
`onboarding_accomplished_date` e `onboarding_unaccomplished_date` (campos que não existem em
`dhmv_sales_touched`). Essa segunda tabela tem bem mais colunas de onboarding que a nossa
fonte principal (~160 colunas, contra 101) — se precisar de mais algum campo de onboarding no
futuro, é ali que provavelmente está, não em `dhmv_sales_touched`.

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
- `closerCohortSqlCw` — coorte C4 (SQL→CW), independente do `closerCohort` acima: ancorada na
  semana do SQL, não do Opp. Dos que chegaram a SQL na semana, quantos fecharam na mesma semana.
- `closerEstoque` ganhou o campo `issues` (estágio "Issues Identified", entre Opp e SQL) —
  alimenta o card "Opps em Issues" e o novo segmento do gráfico de estoque.

Alimenta a página **Semanal Área › Onboarding**:

- `onbEstoque` — estoque de ativação pós-CW (cw/a1k/a5k) por `opp_id` (sai ao ativar 10k).
- `onbCohort` — coorte de ativação: fechou (CW) na semana × chegou a 1k na mesma semana (C1)
  × chegou a 5k na mesma semana, do sub-coorte que chegou a 1k (C2, encadeado — mesmo padrão
  do `closerCohort`). Tende a ficar baixo por natureza (ciclo médio CW→Ativação ~50 dias).
- `onbAct` — nº de ativações 10k por semana, só de leads com onboarder atribuído (mesmo papel
  do `closerCw` — throughput de saída do funil).
- `onbCwFte` / `onbActFte` — nº de onboarders distintos que receberam CW / que ativaram 10k
  na semana (denominador do "CW/FTE" e "Ativado/FTE").
- `onbCohortStatus` — por semana de ENTRADA no onboarding (CW), status atual (hoje) de cada
  lead: cw/a1k/a5k/ativado_10k (data mais recente vence, sem "lost").
- `cohCw`/`coh1k` (dentro de `porPessoa.onboarding[].porSemana`) — coorte C1 por pessoa (mesma
  lógica do `onbCohort`, só que por onboarder individual em vez do agregado).
- `onbCohort` ganhou os campos `a10k` (coorte direta CW→10k na mesma semana, sem exigir
  1k/5k) e `accomplished`/`unaccomplished` (snapshot do `onboarding_status` atual, de quem
  fechou CW naquela semana — ver "Concluído 28/07" acima pro porquê de não usar data).
- `onbLeadsMap` ganhou o campo `close` (`Onboarding_close_date`: accomplished_date com
  prioridade sobre unaccomplished_date, senão nunca) — usado como saída extra do `onbEstoque`
  (ver "Concluído 29/07" acima).

Helpers de roster/filtro "real" (29/07, em `build_data.js`, todos derivados de
`Dados/Imagens Sales.csv` — colunas `Cargo`/`Ativo`, exceto `leadFlowOk`/`oppValidOk` que vêm
de campos do `06_operacional_raw.csv`):

- `isRealSdr(email)` — `Cargo='SDR' AND Ativo='Sim'`, + inclusão manual de Olivio Blach/Lucas
  Guerrero (`SDR_MANUAL_INCLUI`). Fallback pro heurístico antigo se a planilha faltar.
- `isRealCloser(email)` — `Cargo='Closer' AND Ativo='Sim'`.
- `leadFlowOk(row)` — `lead_flow` não é PQL/PPQL e `lead_flow_segmentation` não é Seed 1/2.
  Usado em `sdrEstoque`/coortes de SDR e em `onbEstoque`. **Não usado em `closerEstoque`**
  (testado e piora o ajuste com o Power BI, ver "Concluído 29/07").
- `oppValidOk(row)` — `is_opp_valid` e `is_opp_br_funnel` ambos `True`. Usado em
  `closerEstoque` e `onbEstoque` (não se aplica a `sdrEstoque`, que é pré-opp).
- Onboarding **não tem** um `isRealOnb`/roster curado — testado e descartado (ver "Concluído
  29/07"): o filtro real é só `onboarding_email_sf` não-vazio.

Regenerar: `node app/build_data.js` (lê `Dados/*.csv` locais).

## Backlog / a confirmar

1. **FTE de SDR/Closer real:** "Contacted/FTE", "Opps/FTE", "Opp/FTE" e "CW/FTE" usam como FTE
   quem de fato contatou/gerou opp/recebeu opp/fechou na semana (aproximação). Trocar por base
   de headcount/escala real quando disponível.
2. ~~"Produtividade diária" (tabela por pessoa) usa ÷5/÷15 fixo~~ — **resolvido**: a tabela de
   SDR (`pdContacted`/`pdOpp`) e agora também a de Closer (`pdOpp`/`pdCw`) já usam
   `D.diasUteisSemana` (dias úteis realmente decorridos) em vez de dividir por 5/15 fixo.
3. ~~Filtro de Estratégia só na sub-aba SDR~~ — **resolvido pra Closers** (24/07) **e pra
   Onboarding** (26/07): agora filtra KPIs, estoque, status e tabela por pessoa nas 3 sub-abas.
4. **Tabela por pessoa × estratégia:** o filtro de estratégia nas tabelas de SDR e Closer usa a
   **estratégia primária** da pessoa (aprox., o último valor visto). Preciso por lead/semana
   exigiria quebrar o `porSemana` por estratégia no build.
5. **Chip de ícone nos KPI cards** (estilo Stravix, círculo colorido) — não implementado.
6. **Definição de "status atual" e "saída do estoque":** hoje um lead sai do estoque de SDR
   quando vira opp/qualificado ou é desqualificado; sai do estoque de Closer quando fecha
   (ganho ou perdido); sai do estoque de Onboarding quando ativa 10k (única saída conhecida —
   não há campo de "perda"/churn no funil de ativação). Confirmar se as três regras batem com
   a operação.
7. ~~Validar `sdrEstoque` e `onbEstoque` contra o Power BI~~ — **resolvido em boa parte
   (29/07)**: ver "Concluído 29/07" acima. `sdrEstoque` bate exato; `closerEstoque` bate de
   perto (~294 vs ~290); `onbEstoque` ficou ~13% acima (~682 vs ~603-712) por causa do filtro
   `Current_office=BRAZIL` que não conseguimos replicar (ver item 15, novo).
8. ~~Onboarding sem paridade com SDR/Closer~~ — **resolvido (26/07)**: mesma estrutura de
   página das outras duas abas, adaptada ao funil de ativação (CW → 1k → 5k → 10k).
9. **Validar com o time de Closer e de Onboarding as metas mocadas** — hoje não existe meta
   real confirmada, então nada é simulado:
   - Meta da coorte **C1 · Opp→SQL** (Closer, 24/07) e **C1 · CW→1k** (Onboarding, 26/07) —
     equivalente ao `COH_META=10%` fixo do SDR, mas sem valor real de negócio confirmado ainda
     pras outras duas áreas.
   - Metas de produtividade **Opp/BD e CW/BD** (Closer, `BD_TGT_CLOSER`) e **CW/BD e
     Ativado/BD** (Onboarding, `BD_TGT_ONB`) por estratégia — ambas `{}` vazias em
     `index.html` hoje. **Enquanto isso (29/07), a tabela por pessoa mostra um badge de
     variação semana a semana (WoW) no lugar do % de meta**, só pra não deixar a célula sem
     nenhum sinal visual — ver "Concluído 29/07" acima. Preencher `BD_TGT_CLOSER`/`BD_TGT_ONB`
     no mesmo formato do `BD_TGT` de SDR assim que o time passar os números certos, e então
     trocar o badge WoW de volta pro badge de atingimento-vs-meta (`bdCellClo`/`bdCellOnb` em
     `index.html`, funções perto da tabela por pessoa de Closer/Onboarding).
10. **`closerCohort`/`closerCohortStatus`/`closerLost`/`closerCw` e `onbCohort`/
    `onbCohortStatus`/`onbAct` ainda não foram validados contra nenhuma medida DAX do Power
    BI** (diferente do `sdrCohort`/`sdrCohortStatus`, que já foram comparados na lógica, ver
    item 7). Se o time tiver medida equivalente, comparar número a número antes de confiar
    100% nos valores. Vale sobretudo pro C1/C2 do Onboarding, que — pelo ciclo longo
    (~50 dias) — só vai ficar realmente sólido comparando várias semanas seguidas.
11. ~~Editar as 6 queries em `Querys/` pra usar a borda nova de nível~~ — **resolvido (28/07)**:
    as 6 foram editadas e a `01_receita_semana_nivel_estrategia.sql` (única em uso no pipeline)
    foi reexportada via Astrobox. Net Revenue/GMV/SAP por nível já refletem a borda nova.
12. ~~Aba Onboarding: Saídas do funil Accomplished/Unaccomplished, tirar C1/C2, add CW→10k~~ —
    **resolvido (28/07)**. Ver "Concluído 28/07" acima pro detalhe completo (schema novo,
    por que não usei data, como funciona hoje).
13. **Migrar "Saídas do funil" do Onboarding de status (snapshot) pra data (coorte por
    semana), se a Hotmart passar a preencher `onboarding_unaccomplished_date` de forma
    confiável.** Hoje esse campo vem sempre nulo no nosso recorte (Brasil + CW 2024+), mesmo
    em registros com `onboarding_status = 'Unaccomplished'` certo — por isso o card usa o
    status atual em vez da data. Os dois campos (`onboarding_accomplished_date`/
    `onboarding_unaccomplished_date`) já vêm no `06_operacional_raw.csv` (JOIN com
    `dhm_data_business.f_operational_sales_touched`), só não são usados ainda. Se a data
    passar a ser preenchida, dá pra trocar a lógica no `build_data.js` (bloco do `onbCohort`,
    perto do `a10kSame`) pra bucketizar por semana de saída de verdade, em vez de "status de
    quem entrou nessa semana".
14. **`onboarding_status`/accomplished/unaccomplished ainda não validados contra o Power BI** —
    mesma ressalva dos outros campos novos (ver item 10).
15. **`onbEstoque` ~13% acima do Power BI, causa provável: `Current_office=BRAZIL` sem
    conseguir replicar.** O campo `current_office` (`data_business.dhmv_sales_touched`) só vem
    preenchido pra quem já tem `activation_date_1k` (~80% de cobertura entre CW, quase 100%
    correlacionado com ter ativação — confirmado direto no Redshift, não é problema do nosso
    export). Aplicar o filtro estrito derruba o número bem abaixo do alvo, cortando o maior
    bloco do estoque (CW ainda sem 1k). A tabela onde `Current_office` mora oficialmente
    (`f_finance_sales`, provável `dhm_data_business.f_finance_sales_touched`) não tem chave
    (`opp_id`/`lead_id`) pra se relacionar com o funil operacional — hipótese mais provável é
    que esse filtro "em todas as páginas" do Power BI não tenha relacionamento ativo com o
    visual de Estoque (fica "ligado" mas sem efeito nesse gráfico específico). Se algum dia
    aparecer uma tabela-ponte (produtor/conta → país) com chave pro `opp_id`, dá pra tentar de
    novo. Mesma limitação estrutural já existia pro `sdrEstoque` (não documentada à parte
    porque lá o roster oficial sozinho já foi suficiente pra bater exato).
16. ~~Nova aba "Semanal Sales" igual à Mensal Sales, com Semana fechada~~ — **resolvido
    (31/07/2026)**, ver "Concluído 31/07" acima. Implementado com **"YTD por semana"** (semana
    1 → semana selecionada) no lugar de "Mês fechado"+YTD — o Gabriel não confirmou o "MTD"
    cogitado aqui em 30/07 quando descreveu o pedido de novo, então segui o mais literal ("mesma
    estrutura/dados da Mensal Sales"). Se ele quiser trocar por MTD depois, é só mudar o cálculo
    de `ytdWeeks` em `renderSemanal()` (`index.html`) pra somar só as semanas do MÊS corrente
    via `D.semanaMes`, em vez de semana 1 → selecionada. **Substituiu** a aba "Semanal Sales"
    antiga (funil/KPIs/ritmo por estratégia, escondida desde 28/07) — código antigo removido.
17. ~~Investigação do gap do `onbEstoque`: leads travados por status certo mas data vazia~~ —
    **resolvido (03/08/2026)**, ver "Concluído 03/08" acima: fallback `CW + 90 dias` quando
    status é Unaccomplished e a data vem vazia. (A ressalva de que o Power BI pode ter a mesma
    trava — já que `Onboarding_close_date` é coluna calculada lá também — continua válida: essa
    correção deixa nosso dado operacionalmente mais correto, mas não necessariamente bate mais
    perto do número exato do Power BI. `current_office=BRAZIL` e tirar `leadFlowOk`/`oppValidOk`
    continuam descartados, ver investigação original preservada no histórico do arquivo.)
18. ~~Estoque de ativação (Onboarding): reclassificar em "nunca vendeu" / "vendendo" /
    "ativos"~~ — **resolvido (03/08/2026)**, ver "Concluído 03/08" acima pro detalhe completo
    (definições, campos usados, o que ficou de fora de propósito no pill "Δ estoque").

## Convenções do projeto (não esquecer)

- Só commitar/push quando o Gabriel/Guilherme pedir explicitamente.
- `build_data.js` só lê campos por nome do `06_operacional_raw.csv` (que tem PII) — nunca
  fazer spread da linha inteira pro `app_data.js`.
- `FILTRO_ANO`/`FILTRO_ANO`-equivalente restringe filtros de mês ao ano corrente — ajustar na
  virada de ano.
