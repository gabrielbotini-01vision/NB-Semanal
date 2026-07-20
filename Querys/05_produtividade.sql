-- =============================================================================
-- 05_produtividade.sql  ·  Aba/Data Table: produtividade
-- Amazon Redshift
-- -----------------------------------------------------------------------------
-- Objetivo: base de PRODUTIVIDADE (throughput) — cada etapa contada na semana
--   em que ELA de fato aconteceu (não por coorte). É o UNPIVOT das colunas de
--   data do lead: uma linha por (lead, etapa, data_da_etapa).
--
-- Diferença p/ as safras (02-04): lá a data-âncora define a coorte e conta-se
--   quantos evoluíram; aqui cada evento entra na semana da sua própria data.
--
-- Fonte:  data_business.dhmv_sales_touched  (1 linha = 1 lead)
--   Owner: join com dhaf_salesforce."user" (id -> username).
--
-- Etapas despivotadas (todas as datas): Contatado, Conectado, Opp, SQL, CW,
--   Ativado 10k, Desqualificado (unqualified_date), Perdido (lost_deal_date).
--
-- Granularidade: ano_semana | semana | mes | etapa_ordem | etapa
--                + nivel | estrategia | sdr_email | closer_email | onboarding_email | owner_email
--
-- Regras:
--   • Só Brasil  -> is_lead_br_funnel = true.
--   • Cada evento entra de 2025+ -> data_da_etapa >= 2025-01-01.
--   • Semana/mes -> mesma regra (semana 1 parcial de 01/jan; depois segunda-feira),
--                   ancorada na data DA ETAPA.
--   • Nível      -> amount_12_months (<=600k N2 ... >10M N7; NULL = 'Sem nivel').
--
-- Saída: qtd = nº de leads que tiveram aquela etapa naquela semana/dimensões.
-- =============================================================================

WITH lead_base AS (
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
),

dims AS (
    -- Atributos por lead (uma linha por lead), com nível e e-mail do owner.
    SELECT
        lb.lead_id,
        CASE
            WHEN lb.amount_12_months IS NULL       THEN 'Sem nivel'
            WHEN lb.amount_12_months <=   600000   THEN 'N2'
            WHEN lb.amount_12_months <=  1000000   THEN 'N3'
            WHEN lb.amount_12_months <=  2000000   THEN 'N4'
            WHEN lb.amount_12_months <=  5000000   THEN 'N5'
            WHEN lb.amount_12_months <= 10000000   THEN 'N6'
            ELSE 'N7'
        END AS nivel,
        lb.estrategia,
        lb.sdr_email,
        lb.closer_email,
        lb.onboarding_email,
        u.username AS owner_email,
        lb.amount_3_months,
        lb.amount_12_months
    FROM lead_base lb
    LEFT JOIN dhaf_salesforce."user" u
        ON u.id = lb.lead_owner_id
),

eventos AS (
    -- UNPIVOT: 1 linha por (lead, etapa) onde a data da etapa não é nula.
    -- data_anterior = data da etapa imediatamente anterior (p/ o delta). Contatado e ramos
    -- de perda (Desqualificado/Perdido) não têm predecessora clara -> NULL.
    SELECT lead_id, 1 AS etapa_ordem, 'Contatado'      AS etapa, contacted_date          AS data_etapa, NULL::date              AS data_anterior FROM lead_base WHERE contacted_date          IS NOT NULL
    UNION ALL
    SELECT lead_id, 2, 'Conectado',      connected_date,          contacted_date          FROM lead_base WHERE connected_date          IS NOT NULL
    UNION ALL
    SELECT lead_id, 3, 'Opp',            opportunity_create_date, connected_date          FROM lead_base WHERE opportunity_create_date IS NOT NULL
    UNION ALL
    SELECT lead_id, 4, 'SQL',            sql_date,                opportunity_create_date FROM lead_base WHERE sql_date                IS NOT NULL
    UNION ALL
    SELECT lead_id, 5, 'CW',             closed_won_date,         sql_date                FROM lead_base WHERE closed_won_date         IS NOT NULL
    UNION ALL
    SELECT lead_id, 6, 'Ativado 10k',    activation_date_10k,     closed_won_date         FROM lead_base WHERE activation_date_10k     IS NOT NULL
    UNION ALL
    SELECT lead_id, 7, 'Desqualificado', unqualified_date,        NULL::date              FROM lead_base WHERE unqualified_date        IS NOT NULL
    UNION ALL
    SELECT lead_id, 8, 'Perdido',        lost_deal_date,          NULL::date              FROM lead_base WHERE lost_deal_date          IS NOT NULL
),

bucketed AS (
    SELECT
        e.etapa_ordem,
        e.etapa,
        CASE WHEN e.data_etapa < DATEADD(day, MOD(1 - EXTRACT(DOW FROM DATE_TRUNC('year', e.data_etapa)::date)::int + 7, 7), DATE_TRUNC('year', e.data_etapa)::date)
             THEN DATE_TRUNC('year', e.data_etapa)::date
             ELSE DATE_TRUNC('week', e.data_etapa)::date
        END AS semana,
        CASE WHEN e.data_etapa < DATEADD(day, MOD(1 - EXTRACT(DOW FROM DATE_TRUNC('year', e.data_etapa)::date)::int + 7, 7), DATE_TRUNC('year', e.data_etapa)::date)
             THEN 1
             ELSE (DATEDIFF(day, DATEADD(day, MOD(1 - EXTRACT(DOW FROM DATE_TRUNC('year', e.data_etapa)::date)::int + 7, 7), DATE_TRUNC('year', e.data_etapa)::date), e.data_etapa) / 7)::int + 2
        END AS semana_num,
        DATE_TRUNC('month', e.data_etapa)::date AS mes,
        d.nivel,
        d.estrategia,
        d.sdr_email,
        d.closer_email,
        d.onboarding_email,
        d.owner_email,
        d.amount_3_months,
        d.amount_12_months,
        e.lead_id,
        -- delta desde a etapa anterior (dias); negativo -> 0, nulo -> ignorado no AVG
        CASE WHEN DATEDIFF(day, e.data_anterior, e.data_etapa) < 0 THEN 0
             ELSE DATEDIFF(day, e.data_anterior, e.data_etapa) END AS dias_desde_anterior
    FROM eventos e
    JOIN dims d ON d.lead_id = e.lead_id
    WHERE e.data_etapa >= DATE '2025-01-01'
)

SELECT
    EXTRACT(YEAR FROM semana) || '-W' || LPAD(semana_num::varchar, 2, '0') AS ano_semana,
    semana,
    mes,
    etapa_ordem,
    etapa,
    nivel,
    estrategia,
    sdr_email,
    closer_email,
    onboarding_email,
    owner_email,
    COUNT(DISTINCT lead_id)          AS qtd,
    SUM(amount_3_months)             AS amount_3m,
    SUM(amount_12_months)            AS amount_12m,
    ROUND(AVG(dias_desde_anterior), 1) AS dias_desde_etapa_anterior
FROM bucketed
GROUP BY 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11
ORDER BY semana, mes, etapa_ordem, nivel, estrategia, sdr_email, closer_email, onboarding_email, owner_email;
