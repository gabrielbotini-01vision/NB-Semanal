-- =============================================================================
-- ad_hoc_homologacao_onboarding_stage.sql · Query avulsa (NÃO faz parte do pipeline)
-- -----------------------------------------------------------------------------
-- Objetivo: homologar user_id x opp_id x stage/status de onboarding numa ferramenta
--   própria (10/08/2026, a pedido do Gabriel) — comparar com o que vemos na tabela
--   dhm_data_business.f_operational_sales_touched (a mesma que o build_data.js usa).
--
-- Mesmo JOIN já usado em Querys/06_operacional_raw.sql (lead_id, com fallback pra
--   opp_id quando lead_id é nulo — ver comentário lá pra detalhe do porquê).
--
-- Troque o valor de user_id no WHERE da CTE abaixo pelo que quiser conferir.
--   Exemplo usado na investigação (opp_id 006SG00000RbRMfYAN / 006SG00000c7abyYAA,
--   onboarder Liana Wieloch): user_id = 84919731
--
-- ⚠️ 10/08/2026: reescrita pra filtrar user_id ANTES do join (numa CTE), não depois.
--   A condição do JOIN (OR entre lead_id e opp_id) impede o otimizador do Redshift
--   de fazer um hash join — sem isso, mesmo um WHERE bem seletivo (1 user_id) força
--   escanear as duas tabelas inteiras antes de filtrar (60-170s+ observado nessa
--   investigação). Filtrando "t" primeiro, o join só precisa casar 1-2 linhas.
-- =============================================================================

WITH t AS (
    SELECT *
    FROM data_business.dhmv_sales_touched
    WHERE user_id = 84919731
)
SELECT
    t.user_id,
    t.opp_id,
    f.onboarding_status AS stage,
    t.closed_won_date,
    f.onboarding_accomplished_date,
    f.onboarding_unaccomplished_date,
    t.onboarding_email_sf,
    t.name AS account_name
FROM t
LEFT JOIN dhm_data_business.f_operational_sales_touched f
    ON (t.lead_id IS NOT NULL AND f.lead_id = t.lead_id)
    OR (t.lead_id IS NULL AND f.opp_id = t.opp_id)
ORDER BY t.closed_won_date;
