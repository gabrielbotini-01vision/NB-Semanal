-- =============================================================================
-- 04_safra_closed_won.sql  ·  Aba/Data Table: safra_closed_won
-- Amazon Redshift
-- -----------------------------------------------------------------------------
-- Objetivo: análise de SAFRA (coorte) por data de CLOSED WON.
--   Para cada semana de closed_won_date, quantos leads daquela safra passaram
--   por cada etapa do funil (contatado, conectado, opp, sql, ganho, ativado 10k).
--
-- Fonte:  data_business.dhmv_sales_touched  (1 linha = 1 lead)
--   Owner: join com dhaf_salesforce."user" (id -> username) p/ e-mail do owner.
--
-- Granularidade: ano_semana | semana | mes | nivel | estrategia
--                + sdr_email | closer_email | onboarding_email | owner_email
--
-- Regras:
--   • Coorte     -> leads com closed_won_date >= 2025-01-01 (a "safra" de ganhos).
--   • Só Brasil  -> is_lead_br_funnel = true.
--   • Semana/mes -> mesma regra da query 1/2, ancorada em closed_won_date.
--   • Nível      -> amount_12_months (<=600k N2 ... >10M N7; NULL = 'Sem nivel').
--
-- Contagens (wide): só as etapas a partir da âncora (ganho -> ativado 10k).
--   A coluna 'ganhos' = tamanho da safra (todos têm closed_won). 'ativados_10k' = downstream.
-- =============================================================================

WITH op AS (
    SELECT
        lead_id,
        NULLIF(NULLIF(TRIM(contacted_date),          ''), 'null')::date        AS contacted_date,
        NULLIF(NULLIF(TRIM(connected_date),          ''), 'null')::date        AS connected_date,
        NULLIF(NULLIF(TRIM(opportunity_create_date), ''), 'null')::date        AS opportunity_create_date,
        NULLIF(NULLIF(TRIM(sql_date),                ''), 'null')::date        AS sql_date,
        NULLIF(NULLIF(TRIM(closed_won_date),         ''), 'null')::date        AS closed_won_date,
        NULLIF(NULLIF(TRIM(activation_date_10k),     ''), 'null')::date        AS activation_date_10k,
        NULLIF(NULLIF(TRIM(unqualified_date),        ''), 'null')::date        AS unqualified_date,
        NULLIF(NULLIF(TRIM(lost_deal_date),          ''), 'null')::date        AS lost_deal_date,
        NULLIF(NULLIF(TRIM(amount_12_months::varchar), ''), 'null')::numeric   AS amount_12_months,
        NULLIF(NULLIF(TRIM(amount_3_months::varchar),  ''), 'null')::numeric   AS amount_3_months,
        sales_strategy                                                         AS estrategia,
        NULLIF(NULLIF(TRIM(sdr_email_sf),        ''), 'null')                  AS sdr_email,
        NULLIF(NULLIF(TRIM(closer_email_sf),     ''), 'null')                  AS closer_email,
        NULLIF(NULLIF(TRIM(onboarding_email_sf), ''), 'null')                  AS onboarding_email,
        NULLIF(NULLIF(TRIM(lead_owner_id),       ''), 'null')                  AS lead_owner_id
    FROM data_business.dhmv_sales_touched
    WHERE is_lead_br_funnel::boolean = true
      AND NULLIF(NULLIF(TRIM(closed_won_date), ''), 'null')::date >= DATE '2025-01-01'  -- safra CLOSED WON 2025+
),

joined AS (
    SELECT
        op.*,
        u.username AS owner_email,
        DATEADD(
            day,
            MOD(1 - EXTRACT(DOW FROM DATE_TRUNC('year', op.closed_won_date)::date)::int + 7, 7),
            DATE_TRUNC('year', op.closed_won_date)::date
        ) AS primeira_segunda
    FROM op
    LEFT JOIN dhaf_salesforce."user" u
        ON u.id = op.lead_owner_id
),

bucketed AS (
    SELECT
        CASE WHEN closed_won_date < primeira_segunda
             THEN DATE_TRUNC('year', closed_won_date)::date
             ELSE DATE_TRUNC('week', closed_won_date)::date
        END AS semana,
        CASE WHEN closed_won_date < primeira_segunda
             THEN 1
             ELSE (DATEDIFF(day, primeira_segunda, closed_won_date) / 7)::int + 2
        END AS semana_num,
        DATE_TRUNC('month', closed_won_date)::date AS mes,
        CASE
            WHEN amount_12_months IS NULL       THEN 'Sem nivel'
            WHEN amount_12_months <=   600000   THEN 'N2'
            WHEN amount_12_months <=  1000000   THEN 'N3'
            WHEN amount_12_months <=  2000000   THEN 'N4'
            WHEN amount_12_months <=  5000000   THEN 'N5'
            WHEN amount_12_months <= 10000000   THEN 'N6'
            ELSE 'N7'
        END AS nivel,
        estrategia,
        sdr_email,
        closer_email,
        onboarding_email,
        owner_email,
        amount_3_months,
        amount_12_months,
        lead_id,
        contacted_date,
        connected_date,
        opportunity_create_date,
        sql_date,
        closed_won_date,
        activation_date_10k,
        unqualified_date,
        lost_deal_date
    FROM joined
)

SELECT
    EXTRACT(YEAR FROM semana) || '-W' || LPAD(semana_num::varchar, 2, '0') AS ano_semana,
    semana,
    mes,
    nivel,
    estrategia,
    sdr_email,
    closer_email,
    onboarding_email,
    owner_email,
    COUNT(DISTINCT CASE WHEN closed_won_date         IS NOT NULL THEN lead_id END)       AS ganhos,
    COUNT(DISTINCT CASE WHEN activation_date_10k     IS NOT NULL THEN lead_id END)       AS ativados_10k,
    COUNT(DISTINCT CASE WHEN unqualified_date        IS NOT NULL THEN lead_id END)       AS desqualificados,
    COUNT(DISTINCT CASE WHEN lost_deal_date          IS NOT NULL THEN lead_id END)       AS perdidos,
    SUM(amount_3_months)                                                                 AS amount_3m,
    SUM(amount_12_months)                                                                AS amount_12m,
    -- delta médio ganho -> ativação (dias); negativo -> 0, nulo/etapa-não-atingida -> ignorado no AVG
    ROUND(AVG(CASE WHEN DATEDIFF(day, closed_won_date, activation_date_10k) < 0 THEN 0 ELSE DATEDIFF(day, closed_won_date, activation_date_10k) END), 1) AS dias_won_ativacao
FROM bucketed
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9
ORDER BY semana, mes, nivel, estrategia, sdr_email, closer_email, onboarding_email, owner_email;
