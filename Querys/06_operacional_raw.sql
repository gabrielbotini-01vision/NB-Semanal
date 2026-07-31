-- =============================================================================
-- 06_operacional_raw.sql  ·  Aba/Data Table: operacional_raw
-- Amazon Redshift
-- -----------------------------------------------------------------------------
-- Objetivo: 1 linha por LEAD, com TODAS as colunas da tabela fonte — sem
--   pré-agregação, sem seleção de campo, sem bucketização por semana/mês. A
--   ideia é trazer tudo de uma vez pra habilitar qualquer subquery/corte futuro
--   (qualquer grão de tempo, qualquer dimensão nova) sem precisar voltar no
--   Redshift toda vez. Quem decide o que É USADO no dashboard é o
--   `app/build_data.js` (client-side), não esta query.
--
-- Substitui, no pipeline do dashboard: 02_safra_contacted.sql, 03_safra_opportunity.sql,
--   04_safra_closed_won.sql e 05_produtividade.sql (mantidas no repo só como
--   referência histórica — build_data.js não lê mais os CSVs delas).
--
-- Fonte: data_business.dhmv_sales_touched (1 linha = 1 lead).
--   Owner: join com dhaf_salesforce."user" (id -> username), só pra resolver o
--   e-mail do owner — não faz parte da tabela fonte.
--   Accomplished/Unaccomplished (Onboarding): join com
--   dhm_data_business.f_operational_sales_touched (schema DIFERENTE — "dhm_data_business",
--   não "data_business") por lead_id, só pra trazer onboarding_accomplished_date/
--   onboarding_unaccomplished_date — campos que NÃO existem em dhmv_sales_touched.
--   Confirmado 28/07/2026 que lead_id é único nessa tabela pra linhas com lead_id
--   preenchido (a única "duplicidade" era de linhas com lead_id NULL, que não afetam
--   o JOIN) — LEFT JOIN por lead_id não multiplica linha nenhuma do export.
--
-- Filtro: só Brasil -> is_lead_br_funnel = true OU is_opp_br_funnel = true (30/07/2026: WHERE
--   antes só usava is_lead_br_funnel, e isso descartava opps criadas SEM lead ou com lead de
--   outro office mas opp válida no funil BR — a linha inteira sumia do export antes mesmo do
--   build_data.js poder decidir por campo. Com o OR, a linha entra se qualquer um dos dois
--   objetos for BR; o build_data.js aplica o filtro CERTO por campo: is_lead_br_funnel pros
--   campos do objeto Lead (contacted/connected/nurturing/qualified/unqualified) e
--   is_opp_br_funnel pros campos do objeto Opportunity (opp/issues/sql/offer/contract/CW/
--   lost/ativação) — ver comentário perto de STAGES em build_data.js.
--   + corte de 2024 em diante (pra reduzir tamanho do export), mantendo a linha se
--   QUALQUER UMA das datas de etapa cair em 2024+ — não só contacted_date, senão um
--   lead contatado em 2023 mas fechado (CW) em 2024 seria descartado por engano.
--
-- ⚠️ PRIVACIDADE: como este export traz TODAS as colunas da fonte, ele pode conter
--   telefone e outra PII direta do lead — e por isso é OBRIGATORIAMENTE local
--   (Dados/*.csv nunca é versionado, ver .gitignore). A barreira de privacidade
--   real está no `app/build_data.js`: ele só lê campos específicos por nome pra
--   montar o que vai pro navegador — nunca repassa a linha inteira. Não adicione
--   telefone/PII ao app_data.js sem decisão explícita.
--
-- Colunas usadas hoje pelo build_data.js (as demais vêm juntas, disponíveis para
--   análises futuras, mas não tocadas pelo pipeline atual):
--   lead_id, contacted_date, connected_date, opportunity_create_date, sql_date,
--   closed_won_date, activation_date_10k, amount_12_months, sales_strategy,
--   sdr_email_sf, closer_email_sf, onboarding_email_sf, owner_email (derivado do join),
--   is_lead_br_funnel, is_opp_br_funnel (30/07/2026 — filtro por campo, ver acima),
--   onboarding_status (derivada do join — accomplished_date/unaccomplished_date também
--   vêm juntas mas hoje não são usadas: no recorte Brasil/2024+ a data de unaccomplished
--   sempre vem nula mesmo com status definido, então o build_data.js usa o status como
--   snapshot em vez de tentar bucketizar por semana com a data)
-- =============================================================================

SELECT
    t.*,
    u.username AS owner_email,
    f.onboarding_accomplished_date,
    f.onboarding_unaccomplished_date,
    f.onboarding_status
FROM data_business.dhmv_sales_touched t
LEFT JOIN dhaf_salesforce."user" u
    ON u.id = t.lead_owner_id
LEFT JOIN dhm_data_business.f_operational_sales_touched f
    ON f.lead_id = t.lead_id
WHERE (t.is_lead_br_funnel::boolean = true OR t.is_opp_br_funnel::boolean = true)
  AND (
        NULLIF(NULLIF(TRIM(t.contacted_date),          ''), 'null')::date >= DATE '2024-01-01'
     OR NULLIF(NULLIF(TRIM(t.connected_date),          ''), 'null')::date >= DATE '2024-01-01'
     OR NULLIF(NULLIF(TRIM(t.opportunity_create_date), ''), 'null')::date >= DATE '2024-01-01'
     OR NULLIF(NULLIF(TRIM(t.sql_date),                ''), 'null')::date >= DATE '2024-01-01'
     OR NULLIF(NULLIF(TRIM(t.closed_won_date),         ''), 'null')::date >= DATE '2024-01-01'
     OR NULLIF(NULLIF(TRIM(t.activation_date_10k),     ''), 'null')::date >= DATE '2024-01-01'
      )
ORDER BY t.lead_id;
