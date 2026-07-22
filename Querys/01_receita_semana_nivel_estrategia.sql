-- =============================================================================
-- 01_receita_semana_nivel_estrategia.sql  ·  Aba/Data Table: receita_nivel
-- Amazon Redshift
-- -----------------------------------------------------------------------------
-- Objetivo: receita Sales líquida (BRL) por SEMANA x NÍVEL x ESTRATÉGIA.
--
-- Fontes:
--   Financeiro   data_business.dhmv_finance_sales_touched  (revenue_net_brl_sales, hub date)
--   Operacional  data_business.dhmv_sales_touched          (amount_12_months -> nível; ativação)
--
-- Join: finance.user_producer_id = op.user_id  AND  finance.closed_won_date = op.closed_won_date
--
-- Regras de negócio:
--   • Receita                  -> revenue_net_brl_sales (receita Sales)
--   • Só Brasil                -> finance.is_br_funnel = true
--   • Hub a partir de 2025     -> hub_index_purchase_reference_date >= '2025-01-01'
--   • Ano do hub = ano da ativação (igualdade linha a linha):
--                                 YEAR(hub_index_purchase_reference_date) = YEAR(activation_date_10k)
--   • Semana da RECEITA        -> bucket por hub_index_purchase_reference_date (data da compra).
--                                 Regra: semana 1 = 01/jan até o dia anterior à 1ª segunda (PARCIAL);
--                                 da 2ª semana em diante começa sempre na segunda-feira.
--   • Dedup operacional        -> 1 linha por user_id, ficando com o closed_won_date MAIS RECENTE.
--
-- NOTA DE TIPAGEM: colunas de data vêm como VARCHAR ('', 'null' ou 'AAAA-MM-DD').
--   Normalizo ('' e 'null' -> NULL) e casto para date. amount/boolean também blindados.
--
-- Nível (derivado de amount_12_months):
--   <= 600k = N2 | <= 1M = N3 | <= 2M = N4 | <= 5M = N5 | <= 10M = N6 | > 10M = N7
--
-- Saída: ano_semana | semana | mes | nivel | estrategia | receita_net_brl_sales | gmv_brl_sales | sap_semana | sap_mensal
--   sap_semana = produtores distintos (user_producer_id + closed_won_date) com receita NA SEMANA.
--   sap_mensal = produtores distintos ACUMULADOS no mês até aquela semana (MTD). Na última semana
--                do mês fica = SAP mensal total. Ambos são contagem distinta -> não somar entre linhas.
--   Obs.: mes (1º dia do mês do hub) quebra semanas que cruzam a virada de mês -> soma de receita fecha.
-- =============================================================================

WITH op AS (
    -- Normaliza tipos do operacional (datas/valor vêm como texto).
    SELECT
        user_id,
        NULLIF(NULLIF(TRIM(closed_won_date),      ''), 'null')::date         AS closed_won_date,
        NULLIF(NULLIF(TRIM(activation_date_10k),  ''), 'null')::date         AS activation_date_10k,
        NULLIF(NULLIF(TRIM(amount_12_months::varchar), ''), 'null')::numeric AS amount_12_months
    FROM data_business.dhmv_sales_touched
),

deal_ranked AS (
    -- Numera por CW decrescente dentro de cada user_id (para pegar o deal mais recente).
    SELECT
        user_id,
        closed_won_date,
        activation_date_10k,
        amount_12_months,
        ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY closed_won_date DESC            -- "último" = CW mais recente
        ) AS rn
    FROM op
    WHERE closed_won_date IS NOT NULL
),

deal AS (
    -- 1 linha por user_id: o deal de closed_won_date mais recente (com sua ativação e nível).
    SELECT user_id, closed_won_date, activation_date_10k, amount_12_months
    FROM deal_ranked
    WHERE rn = 1
),

fin AS (
    -- Normaliza datas do finance, filtra Brasil e hub >= 2025 (poda o scan).
    SELECT
        user_producer_id,
        NULLIF(NULLIF(TRIM(closed_won_date), ''), 'null')::date                     AS closed_won_date,
        NULLIF(NULLIF(TRIM(hub_index_purchase_reference_date), ''), 'null')::date   AS hub_date,
        sales_strategy,
        revenue_net_brl_sales,
        gmv_brl_sales
    FROM data_business.dhmv_finance_sales_touched
    WHERE is_br_funnel::boolean = true                                            -- só Brasil
      AND NULLIF(NULLIF(TRIM(hub_index_purchase_reference_date), ''), 'null')::date >= DATE '2025-01-01'
),

per_row AS (
    -- 1 linha por registro de receita elegível, já com a 1ª segunda-feira do ano do hub.
    SELECT
        f.hub_date,
        f.user_producer_id,
        f.closed_won_date,
        f.sales_strategy         AS estrategia,      -- INBOUND / OUTBOUND
        f.revenue_net_brl_sales,
        f.gmv_brl_sales,
        n.amount_12_months,
        -- 1ª segunda-feira do ano do hub: se 01/jan não for segunda, avança até a próxima.
        -- (aritmética de data pura em vez de DATEADD — portável entre Redshift e Postgres)
        (
            DATE_TRUNC('year', f.hub_date)::date
            + MOD(1 - EXTRACT(DOW FROM DATE_TRUNC('year', f.hub_date)::date)::int + 7, 7)
        ) AS primeira_segunda
    FROM fin f
    JOIN deal n
        ON  n.user_id         = f.user_producer_id
        AND n.closed_won_date = f.closed_won_date
    -- Ano do hub = ano da ativação (linha a linha). Exclui deals sem ativação (YEAR(NULL) nunca casa).
    WHERE EXTRACT(YEAR FROM f.hub_date) = EXTRACT(YEAR FROM n.activation_date_10k)
),

bucketed AS (
    -- Regra de semana: semana 1 = 01/jan até o dia anterior à 1ª segunda (parcial);
    --                  da 2ª semana em diante começa sempre na segunda-feira.
    SELECT
        CASE WHEN hub_date < primeira_segunda
             THEN DATE_TRUNC('year', hub_date)::date          -- início da semana 1 = 01/jan
             ELSE DATE_TRUNC('week', hub_date)::date           -- segunda-feira da semana
        END AS semana,
        CASE WHEN hub_date < primeira_segunda
             THEN 1
             ELSE ((hub_date - primeira_segunda) / 7)::int + 2
        END AS semana_num,
        DATE_TRUNC('month', hub_date)::date AS mes,   -- quebra semanas que cruzam a virada de mês
        CASE
            WHEN amount_12_months <=   600000 THEN 'N2'
            WHEN amount_12_months <=  1000000 THEN 'N3'
            WHEN amount_12_months <=  2000000 THEN 'N4'
            WHEN amount_12_months <=  5000000 THEN 'N5'
            WHEN amount_12_months <= 10000000 THEN 'N6'
            ELSE 'N7'
        END AS nivel,
        estrategia,
        -- chave do produtor/deal p/ SAP (contagem distinta de produtores que geraram receita)
        user_producer_id::varchar || '|' || closed_won_date::varchar AS producer_key,
        revenue_net_brl_sales,
        gmv_brl_sales
    FROM per_row
),

agg AS (
    -- Agregação semanal: receita, GMV e SAP da semana (distinto de produtores na semana).
    SELECT
        semana, semana_num, mes, nivel, estrategia,
        SUM(revenue_net_brl_sales)   AS receita_net_brl_sales,
        SUM(gmv_brl_sales)           AS gmv_brl_sales,
        COUNT(DISTINCT producer_key) AS sap_semana
    FROM bucketed
    GROUP BY 1, 2, 3, 4, 5
),

prod_first AS (
    -- 1ª semana em que cada produtor gerou receita dentro do (mes, nivel, estrategia).
    SELECT producer_key, mes, nivel, estrategia, MIN(semana) AS primeira_semana
    FROM bucketed
    GROUP BY 1, 2, 3, 4
),

novos AS (
    -- Produtores "novos" no mês por semana (cada produtor conta só na 1ª semana em que aparece).
    SELECT primeira_semana AS semana, mes, nivel, estrategia, COUNT(*) AS novos_produtores
    FROM prod_first
    GROUP BY 1, 2, 3, 4
),

mtd AS (
    -- SAP acumulado no mês (MTD) = soma cumulativa dos produtores novos por semana.
    SELECT
        a.semana, a.mes, a.nivel, a.estrategia,
        SUM(COALESCE(n.novos_produtores, 0)) OVER (
            PARTITION BY a.mes, a.nivel, a.estrategia
            ORDER BY a.semana
            ROWS UNBOUNDED PRECEDING
        ) AS sap_mensal
    FROM agg a
    LEFT JOIN novos n
        ON  n.semana = a.semana AND n.mes = a.mes
        AND n.nivel  = a.nivel  AND n.estrategia = a.estrategia
)

SELECT
    EXTRACT(YEAR FROM a.semana) || '-W' || LPAD(a.semana_num::varchar, 2, '0') AS ano_semana,
    a.semana,
    a.mes,
    a.nivel,
    a.estrategia,
    a.receita_net_brl_sales,
    a.gmv_brl_sales,
    a.sap_semana,
    m.sap_mensal
FROM agg a
JOIN mtd m
    ON  m.semana = a.semana AND m.mes = a.mes
    AND m.nivel  = a.nivel  AND m.estrategia = a.estrategia
ORDER BY a.semana, a.mes, a.nivel, a.estrategia;
