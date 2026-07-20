-- =============================================================================
-- 02_safra_contacted.sql  ·  Aba/Data Table: safra_contacted
-- Amazon Redshift
-- -----------------------------------------------------------------------------
-- Objetivo: análise de SAFRA (coorte) por data de CONTACTED.
--   Para cada semana de contacted_date, quantos leads daquela safra evoluíram
--   para cada etapa POSTERIOR do funil (conectado, opp, sql, ganho, ativado 10k).
--
-- Fonte:  data_business.dhmv_sales_touched  (1 linha = 1 lead)
--   Owner: join com dhaf_salesforce."user" (id -> username) p/ e-mail do owner.
--          ("user" é palavra reservada no Redshift -> precisa aspas.)
--
-- Granularidade: ano_semana | semana | mes | nivel | estrategia
--                + sdr_email | closer_email | onboarding_email | owner_email
--
-- Regras:
--   • Coorte     -> leads com contacted_date >= 2025-01-01 (a "safra"; dados existem desde 2022).
--   • Só Brasil  -> is_lead_br_funnel = true.
--   • Semana/mes -> mesma regra da query 1, ancorada em contacted_date
--                   (semana 1 parcial de 01/jan até a 1ª segunda; depois segunda-feira).
--   • Nível      -> amount_12_months (<=600k N2 ... >10M N7; NULL = 'Sem nivel').
--
-- Contagens (wide): quantos leads da safra atingiram cada etapa (data ≠ nula, cumulativo).
-- =============================================================================

WITH op AS (
    -- Normaliza tipos e filtra a safra (contatados BR).
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
      AND NULLIF(NULLIF(TRIM(contacted_date), ''), 'null')::date >= DATE '2025-01-01'  -- safra CONTACTED de 2025+
),

joined AS (
    -- Traz o e-mail do owner e a 1ª segunda-feira do ano da safra.
    SELECT
        op.*,
        u.username AS owner_email,
        DATEADD(
            day,
            MOD(1 - EXTRACT(DOW FROM DATE_TRUNC('year', op.contacted_date)::date)::int + 7, 7),
            DATE_TRUNC('year', op.contacted_date)::date
        ) AS primeira_segunda
    FROM op
    LEFT JOIN dhaf_salesforce."user" u
        ON u.id = op.lead_owner_id
),

bucketed AS (
    SELECT
        CASE WHEN contacted_date < primeira_segunda
             THEN DATE_TRUNC('year', contacted_date)::date
             ELSE DATE_TRUNC('week', contacted_date)::date
        END AS semana,
        CASE WHEN contacted_date < primeira_segunda
             THEN 1
             ELSE (DATEDIFF(day, primeira_segunda, contacted_date) / 7)::int + 2
        END AS semana_num,
        DATE_TRUNC('month', contacted_date)::date AS mes,
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
    COUNT(DISTINCT lead_id)                                                              AS contatados,
    COUNT(DISTINCT CASE WHEN connected_date          IS NOT NULL THEN lead_id END)       AS conectados,
    COUNT(DISTINCT CASE WHEN opportunity_create_date IS NOT NULL THEN lead_id END)       AS oportunidades,
    COUNT(DISTINCT CASE WHEN sql_date                IS NOT NULL THEN lead_id END)       AS sqls,
    COUNT(DISTINCT CASE WHEN closed_won_date         IS NOT NULL THEN lead_id END)       AS ganhos,
    COUNT(DISTINCT CASE WHEN activation_date_10k     IS NOT NULL THEN lead_id END)       AS ativados_10k,
    COUNT(DISTINCT CASE WHEN unqualified_date        IS NOT NULL THEN lead_id END)       AS desqualificados,
    COUNT(DISTINCT CASE WHEN lost_deal_date          IS NOT NULL THEN lead_id END)       AS perdidos,
    SUM(amount_3_months)                                                                 AS amount_3m,
    SUM(amount_12_months)                                                                AS amount_12m,
    -- deltas médios entre etapas (dias); negativo -> 0, nulo/etapa-não-atingida -> ignorado no AVG
    ROUND(AVG(CASE WHEN DATEDIFF(day, contacted_date,          connected_date)          < 0 THEN 0 ELSE DATEDIFF(day, contacted_date,          connected_date)          END), 1) AS dias_contato_conectado,
    ROUND(AVG(CASE WHEN DATEDIFF(day, connected_date,          opportunity_create_date) < 0 THEN 0 ELSE DATEDIFF(day, connected_date,          opportunity_create_date) END), 1) AS dias_conectado_opp,
    ROUND(AVG(CASE WHEN DATEDIFF(day, opportunity_create_date, sql_date)                < 0 THEN 0 ELSE DATEDIFF(day, opportunity_create_date, sql_date)                END), 1) AS dias_opp_sql,
    ROUND(AVG(CASE WHEN DATEDIFF(day, sql_date,                closed_won_date)         < 0 THEN 0 ELSE DATEDIFF(day, sql_date,                closed_won_date)         END), 1) AS dias_sql_won,
    ROUND(AVG(CASE WHEN DATEDIFF(day, closed_won_date,         activation_date_10k)     < 0 THEN 0 ELSE DATEDIFF(day, closed_won_date,         activation_date_10k)     END), 1) AS dias_won_ativacao
FROM bucketed
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9
ORDER BY semana, mes, nivel, estrategia, sdr_email, closer_email, onboarding_email, owner_email;
