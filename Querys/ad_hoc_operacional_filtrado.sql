-- =============================================================================
-- ad_hoc_operacional_filtrado.sql · Query avulsa (NÃO faz parte do pipeline)
-- Amazon Redshift
-- -----------------------------------------------------------------------------
-- Objetivo: mesmo grão de Querys/06_operacional_raw.sql (1 linha por LEAD), mas com
--   os filtros do dashboard NB Semanal já aplicados campo a campo — pra consumir
--   direto (Excel/Sheets/BI externo) sem precisar rodar build_data.js primeiro
--   (14/08/2026, a pedido do Gabriel).
--
-- Fonte: data_business.dhmv_sales_touched (mesma de 06_operacional_raw.sql).
--
-- ⚠️ LIMITAÇÃO IMPORTANTE — filtros que este SQL NÃO consegue replicar:
--   O dashboard também filtra por "SDR/Closer/Onboarder REAL" (isRealSdr/isRealCloser/
--   isRealOnboarder em build_data.js) usando o Cargo/Ativo da planilha
--   `Dados/Imagens Sales.csv` (datasource Astrobox "Imagens Sales") — essa planilha NÃO é
--   uma tabela do Redshift, então não dá pra fazer esse JOIN aqui. Se você precisar do
--   recorte EXATO das abas SDR/Closer/Onboarding (que só contam gente "real"), essa
--   query sozinha não chega lá — precisaria cruzar o resultado com aquela planilha à
--   parte. Pra Mensal Sales/Semanal Sales (que não usam esse roster, só os filtros
--   abaixo), esta query já reproduz o comportamento exato.
--
-- Filtros aplicados (replicando build_data.js linha a linha):
--   1) lead_flow_ok  = lead_flow NOT IN ('PQL','PPQL')
--                       AND lead_flow_segmentation NOT IN ('Seed 1','Seed 2')
--      (leadFlowOk() em build_data.js — filtro "em todas as páginas" do New Biz)
--   2) lead_br_ok    = is_lead_br_funnel = true   → gate dos campos do objeto LEAD
--   3) opp_br_ok     = is_opp_br_funnel  = true   → gate dos campos do objeto OPPORTUNITY
--   4) opp_valid_ok  = is_opp_valid = true AND opp_br_ok
--      (oppValidOk() — usado no Estoque de Closer/Onboarding, não no funil principal)
--
-- Um campo de data só "sobrevive" (não vira NULL) se lead_flow_ok E o gate do SEU
-- OBJETO de origem forem verdadeiros — exatamente a regra de `dates{}` dentro do loop
-- principal do build_data.js. Os campos crus (lead_flow, is_lead_br_funnel etc.) também
-- vêm na saída, pra você conferir POR QUE uma data específica ficou NULL, se precisar.
--
-- Nível/Estratégia já vêm bucketizados no mesmo padrão do dashboard (bucketFromAmount()/
-- estr() em build_data.js), pra não precisar reimplementar essa lógica na sua ponta.
--
-- NÃO aplicado aqui (não existe no dashboard como filtro de LINHA, só de leitura de
--   campo específico): Current_office=BRAZIL — testado e descartado no passado, afasta
--   dos números reais do dashboard (ver Pendencias/README.md).
-- NÃO aplicado: corte de data >=2025-01-01 — esse corte só vale pras contagens de
--   "Actual" do funil (Mensal/Semanal Sales); coortes, estoque e ciclo usam o histórico
--   inteiro. Se for comparar contra os cards de Actual, filtre por data >= 2025-01-01
--   na sua ponta depois de exportar.
-- =============================================================================

WITH obd_dedup AS (
    SELECT
        o.opportunity__c,
        o.owner_email__c,
        o.onboarding_status__c AS onboarding_stage,
        o.createddate AS onboarding_created_date,
        LEFT(MIN(CASE WHEN oh.newvalue = 'Accomplished' THEN oh.createddate END), 10) AS onboarding_accomplished_date,
        LEFT(MIN(CASE WHEN oh.newvalue = 'Unaccomplished' THEN oh.createddate END), 10) AS onboarding_unaccomplished_date,
        ROW_NUMBER() OVER (PARTITION BY o.opportunity__c ORDER BY o.createddate DESC) AS rn
    FROM dhaf_salesforce.onboarding o
    LEFT JOIN dhaf_salesforce.onboarding_history oh ON o.id = oh.parentid
    GROUP BY o.id, o.opportunity__c, o.owner_email__c, o.onboarding_status__c, o.createddate
),

base AS (
    SELECT
        t.lead_id,
        t.opp_id,
        u.username AS owner_email,
        t.sdr_email_sf,
        t.closer_email_sf,
        t.onboarding_email_sf,
        f.owner_email__c AS onboarding_owner_email_atual,
        t.sales_strategy,
        t.amount_12_months,
        TRIM(t.lead_flow)              AS lead_flow,
        TRIM(t.lead_flow_segmentation) AS lead_flow_segmentation,
        t.is_lead_br_funnel::boolean   AS is_lead_br_funnel,
        t.is_opp_br_funnel::boolean    AS is_opp_br_funnel,
        t.is_opp_valid::boolean        AS is_opp_valid,
        -- datas do objeto LEAD
        NULLIF(NULLIF(TRIM(t.contacted_date),  ''), 'null')::date AS contacted_date,
        NULLIF(NULLIF(TRIM(t.connected_date),  ''), 'null')::date AS connected_date,
        NULLIF(NULLIF(TRIM(t.nurturing_date),  ''), 'null')::date AS nurturing_date,
        NULLIF(NULLIF(TRIM(t.qualified_date),  ''), 'null')::date AS qualified_date,
        NULLIF(NULLIF(TRIM(t.unqualified_date),''), 'null')::date AS unqualified_date,
        -- datas do objeto OPPORTUNITY
        NULLIF(NULLIF(TRIM(t.opportunity_create_date), ''), 'null')::date AS opportunity_create_date,
        NULLIF(NULLIF(TRIM(t.issues_identified_date),  ''), 'null')::date AS issues_identified_date,
        NULLIF(NULLIF(TRIM(t.sql_date),                ''), 'null')::date AS sql_date,
        NULLIF(NULLIF(TRIM(t.offer_presented_date),    ''), 'null')::date AS offer_presented_date,
        NULLIF(NULLIF(TRIM(t.contract_sent_date),      ''), 'null')::date AS contract_sent_date,
        NULLIF(NULLIF(TRIM(t.closed_won_date),         ''), 'null')::date AS closed_won_date,
        NULLIF(NULLIF(TRIM(t.lost_deal_date),          ''), 'null')::date AS lost_deal_date,
        NULLIF(NULLIF(TRIM(t.activation_date_1k),      ''), 'null')::date AS activation_date_1k,
        NULLIF(NULLIF(TRIM(t.activation_date_5k),      ''), 'null')::date AS activation_date_5k,
        NULLIF(NULLIF(TRIM(t.activation_date_10k),     ''), 'null')::date AS activation_date_10k,
        -- onboarding (mesmo JOIN de 06_operacional_raw.sql, ver comentário lá pro histórico)
        f.onboarding_stage AS onboarding_status,
        f.onboarding_accomplished_date,
        f.onboarding_unaccomplished_date
    FROM data_business.dhmv_sales_touched t
    LEFT JOIN dhaf_salesforce."user" u ON u.id = t.lead_owner_id
    LEFT JOIN obd_dedup f
        ON t.opp_id = f.opportunity__c
        AND t.is_opp_valid::boolean = true
        AND t.closed_won_date IS NOT NULL
        AND LEFT(f.onboarding_created_date, 10) >= t.closed_won_date
        AND f.rn = 1
    WHERE (t.is_lead_br_funnel::boolean = true OR t.is_opp_br_funnel::boolean = true)
      AND (
            NULLIF(NULLIF(TRIM(t.contacted_date),          ''), 'null')::date >= DATE '2024-01-01'
         OR NULLIF(NULLIF(TRIM(t.connected_date),          ''), 'null')::date >= DATE '2024-01-01'
         OR NULLIF(NULLIF(TRIM(t.opportunity_create_date), ''), 'null')::date >= DATE '2024-01-01'
         OR NULLIF(NULLIF(TRIM(t.sql_date),                ''), 'null')::date >= DATE '2024-01-01'
         OR NULLIF(NULLIF(TRIM(t.closed_won_date),         ''), 'null')::date >= DATE '2024-01-01'
         OR NULLIF(NULLIF(TRIM(t.activation_date_10k),     ''), 'null')::date >= DATE '2024-01-01'
          )
),

flags AS (
    SELECT *,
        (COALESCE(lead_flow, '') NOT IN ('PQL', 'PPQL')
         AND COALESCE(lead_flow_segmentation, '') NOT IN ('Seed 1', 'Seed 2')) AS lead_flow_ok,
        is_lead_br_funnel AS lead_br_ok,
        is_opp_br_funnel  AS opp_br_ok,
        (is_opp_valid AND is_opp_br_funnel) AS opp_valid_ok,
        CASE
            WHEN amount_12_months IS NULL THEN 'Sem nivel'
            WHEN amount_12_months < 1000000 THEN 'N2-N3'
            WHEN amount_12_months < 5000000 THEN 'N4-N5'
            ELSE 'N6+'
        END AS nivel,
        CASE UPPER(COALESCE(sales_strategy, ''))
            WHEN 'OUTBOUND' THEN 'Outbound'
            WHEN 'INBOUND'  THEN 'Inbound'
            WHEN 'HUNTING'  THEN 'Hunting'
            ELSE NULL
        END AS estrategia
    FROM base
)

SELECT
    lead_id, opp_id, owner_email, sdr_email_sf, closer_email_sf, onboarding_email_sf,
    onboarding_owner_email_atual,
    estrategia, nivel, amount_12_months,
    lead_flow, lead_flow_segmentation, lead_flow_ok, lead_br_ok, opp_br_ok, opp_valid_ok,
    -- objeto LEAD: só sobrevive se lead_flow_ok E lead_br_ok (senão NULL, igual build_data.js)
    CASE WHEN lead_flow_ok AND lead_br_ok THEN contacted_date   END AS contacted_date,
    CASE WHEN lead_flow_ok AND lead_br_ok THEN connected_date   END AS connected_date,
    CASE WHEN lead_flow_ok AND lead_br_ok THEN nurturing_date   END AS nurturing_date,
    CASE WHEN lead_flow_ok AND lead_br_ok THEN qualified_date   END AS qualified_date,
    CASE WHEN lead_flow_ok AND lead_br_ok THEN unqualified_date END AS unqualified_date,
    -- objeto OPPORTUNITY: só sobrevive se lead_flow_ok E opp_br_ok
    CASE WHEN lead_flow_ok AND opp_br_ok THEN opportunity_create_date END AS opportunity_create_date,
    CASE WHEN lead_flow_ok AND opp_br_ok THEN issues_identified_date  END AS issues_identified_date,
    CASE WHEN lead_flow_ok AND opp_br_ok THEN sql_date                END AS sql_date,
    CASE WHEN lead_flow_ok AND opp_br_ok THEN offer_presented_date    END AS offer_presented_date,
    CASE WHEN lead_flow_ok AND opp_br_ok THEN contract_sent_date      END AS contract_sent_date,
    CASE WHEN lead_flow_ok AND opp_br_ok THEN closed_won_date         END AS closed_won_date,
    CASE WHEN lead_flow_ok AND opp_br_ok THEN lost_deal_date          END AS lost_deal_date,
    CASE WHEN lead_flow_ok AND opp_br_ok THEN activation_date_1k      END AS activation_date_1k,
    CASE WHEN lead_flow_ok AND opp_br_ok THEN activation_date_5k      END AS activation_date_5k,
    CASE WHEN lead_flow_ok AND opp_br_ok THEN activation_date_10k     END AS activation_date_10k,
    -- onboarding: sem gate de lead_flow/BR aqui — build_data.js trata isso à parte
    -- (onbCloseInfo/onbLeadsMap, com seus próprios filtros de roster+leadFlowOkOnb)
    onboarding_status, onboarding_accomplished_date, onboarding_unaccomplished_date
FROM flags
ORDER BY lead_id;
