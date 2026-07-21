-- =============================================================================
-- 01b_financeira_raw.sql  ·  Aba/Data Table: financeira_raw
-- Amazon Redshift
-- -----------------------------------------------------------------------------
-- Objetivo: 1 linha por EVENTO de receita elegível (grão diário — a mesma linha
--   que `01_receita_semana_nivel_estrategia.sql` já produzia antes do GROUP BY),
--   SEM agregação por semana/nível/estratégia. A bucketização por qualquer grão
--   de tempo passa a acontecer no navegador, via DuckDB-Wasm sobre o Parquet
--   gerado a partir deste export — é isso que destrava dar qualquer corte de
--   tempo (semana, 10 dias móveis, mês) sem reescrever a query.
--
-- Substitui, no pipeline do dashboard: 01_receita_semana_nivel_estrategia.sql
--   (mantida no repo só como referência histórica — build_data.js não lê mais
--   o CSV dela; a agregação por semana que ela fazia agora é feita em SQL no
--   navegador, sobre este export).
--
-- Fontes e regras de negócio: IDÊNTICAS à 01_receita_semana_nivel_estrategia.sql —
--   Financeiro   data_business.dhmv_finance_sales_touched  (revenue_net_brl_sales, hub date)
--   Operacional  data_business.dhmv_sales_touched          (amount_12_months -> nível; ativação)
--   Join: finance.user_producer_id = op.user_id AND finance.closed_won_date = op.closed_won_date
--   • Receita               -> revenue_net_brl_sales (receita Sales)
--   • Só Brasil             -> finance.is_br_funnel = true
--   • Hub a partir de 2025  -> hub_index_purchase_reference_date >= '2025-01-01'
--   • Ano do hub = ano da ativação (igualdade linha a linha)
--   • Dedup operacional     -> 1 linha por user_id, ficando com o closed_won_date MAIS RECENTE
--
-- ⚠️ Sobre a semana: esta query NÃO calcula ano_semana/semana — só entrega
--   `hub_date` cru. Quem consumir este export (o SQL rodado no DuckDB-Wasm) deve
--   replicar a MESMA regra de semana já documentada em 01_receita_semana_nivel_estrategia.sql
--   (semana 1 = 01/jan até o dia anterior à 1ª segunda-feira do ano; da 2ª semana
--   em diante começa sempre na segunda) para manter o histórico comparável — um
--   `date_trunc('week', hub_date)` puro do DuckDB usa segunda-feira mas SEM a
--   regra de semana-1-parcial, então os totais da semana 1 de cada ano vão
--   divergir levemente do que o dashboard mostrava antes se essa regra não for
--   replicada no client.
--
-- Saída: hub_date | user_producer_id | closed_won_date | nivel | estrategia |
--   producer_key | revenue_net_brl_sales | gmv_brl_sales
--   producer_key = user_producer_id||'|'||closed_won_date, para COUNT(DISTINCT) de
--   SAP no client (mesmo uso que tinha na query antiga — não somar entre linhas).
-- =============================================================================

WITH op AS (
    SELECT
        user_id,
        NULLIF(NULLIF(TRIM(closed_won_date),      ''), 'null')::date         AS closed_won_date,
        NULLIF(NULLIF(TRIM(activation_date_10k),  ''), 'null')::date         AS activation_date_10k,
        NULLIF(NULLIF(TRIM(amount_12_months::varchar), ''), 'null')::numeric AS amount_12_months
    FROM data_business.dhmv_sales_touched
),

deal_ranked AS (
    SELECT
        user_id,
        closed_won_date,
        activation_date_10k,
        amount_12_months,
        ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY closed_won_date DESC
        ) AS rn
    FROM op
    WHERE closed_won_date IS NOT NULL
),

deal AS (
    SELECT user_id, closed_won_date, activation_date_10k, amount_12_months
    FROM deal_ranked
    WHERE rn = 1
),

fin AS (
    SELECT
        user_producer_id,
        NULLIF(NULLIF(TRIM(closed_won_date), ''), 'null')::date                     AS closed_won_date,
        NULLIF(NULLIF(TRIM(hub_index_purchase_reference_date), ''), 'null')::date   AS hub_date,
        sales_strategy         AS estrategia,
        revenue_net_brl_sales,
        gmv_brl_sales
    FROM data_business.dhmv_finance_sales_touched
    WHERE is_br_funnel::boolean = true
      AND NULLIF(NULLIF(TRIM(hub_index_purchase_reference_date), ''), 'null')::date >= DATE '2025-01-01'
)

SELECT
    f.hub_date,
    f.user_producer_id,
    f.closed_won_date,
    CASE
        WHEN n.amount_12_months IS NULL       THEN 'Sem nivel'
        WHEN n.amount_12_months <=   600000   THEN 'N2'
        WHEN n.amount_12_months <=  1000000   THEN 'N3'
        WHEN n.amount_12_months <=  2000000   THEN 'N4'
        WHEN n.amount_12_months <=  5000000   THEN 'N5'
        WHEN n.amount_12_months <= 10000000   THEN 'N6'
        ELSE 'N7'
    END AS nivel,
    f.estrategia,
    f.user_producer_id::varchar || '|' || f.closed_won_date::varchar AS producer_key,
    f.revenue_net_brl_sales,
    f.gmv_brl_sales
FROM fin f
JOIN deal n
    ON  n.user_id         = f.user_producer_id
    AND n.closed_won_date = f.closed_won_date
-- Ano do hub = ano da ativação (linha a linha). Exclui deals sem ativação (YEAR(NULL) nunca casa).
WHERE EXTRACT(YEAR FROM f.hub_date) = EXTRACT(YEAR FROM n.activation_date_10k)
ORDER BY f.hub_date;
