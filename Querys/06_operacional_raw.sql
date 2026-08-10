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
--
--   Accomplished/Unaccomplished (Onboarding) — REESCRITO 10/08/2026, a pedido do Gabriel:
--   até 03/08/2026 isto vinha de dhm_data_business.f_operational_sales_touched (join por
--   lead_id, com fallback por opp_id). Investigação de homologação (10/08/2026, ver
--   Pendencias/README.md item 19) provou, com um caso real (opp_id 006SG00000RbRMfYAN,
--   onboarder Liana Wieloch), que essa tabela fica DESSINCRONIZADA da fonte viva do
--   Salesforce: o registro estava "Unaccomplished" (com unaccomplished_date real,
--   30/12/2025) na fonte, mas f_operational_sales_touched continuava mostrando
--   "Ready for Activation" indefinidamente. Isso inflava o Estoque de ativação (confirmado
--   contra planilha de referência do time de Onboarding: 659 no dashboard vs 551 reais).
--
--   Fix: join direto com dhaf_salesforce.onboarding (objeto bruto do Salesforce, a mesma
--   fonte que a query oficial "Operational Sales Touched" do time de dados usa) +
--   dhaf_salesforce.onboarding_history (pra extrair a data real de quando o registro virou
--   Accomplished/Unaccomplished, via MIN(createddate) na mudança de status). Mesma lógica de
--   JOIN/dedup da query oficial: liga por opp_id = opportunity__c (não lead_id — o onboarding
--   é vinculado à OPORTUNIDADE, não ao lead), só quando a oportunidade é válida e tem CW, e só
--   considera um registro de onboarding CRIADO NA OU DEPOIS da data do CW daquela oportunidade
--   (onboarding_created_date >= closed_won_date) — isso evita que um onboarding antigo de uma
--   compra anterior do mesmo cliente "vaze" pra uma oportunidade nova. Dedup por
--   ROW_NUMBER() PARTITION BY opportunity__c ORDER BY onboarding_created_date DESC, rn=1 (uma
--   oportunidade pode ter mais de um registro de onboarding ao longo do tempo — fica só o mais
--   recente). Testado direto no Redshift antes de aplicar: JOIN por igualdade simples
--   (opp_id = opportunity__c) é MUITO mais rápido que o antigo (que usava OR entre lead_id/
--   opp_id e travava o otimizador do Redshift em nested loop — 60-3600s+ observado) — o
--   dataset inteiro (21 mil oportunidades com CW) roda em ~4-5s com o JOIN novo. Confirmado
--   que não duplica nenhuma linha do export (COUNT(*) bate com COUNT(DISTINCT opp_id), a menos
--   de 4 duplicatas que já existiam em dhmv_sales_touched antes deste JOIN, sem relação com ele).
--
--   Colunas de saída mantidas com o MESMO NOME de antes (onboarding_status,
--   onboarding_accomplished_date, onboarding_unaccomplished_date) — o build_data.js não
--   precisou mudar nada além de passar a receber dado mais correto. Escopo do impacto: só
--   afeta estruturas de Onboarding (Estoque de ativação, Carteira atual, KPI "Saídas do
--   funil", telas de validação) — SDR, Closer, Mensal Sales, Semanal Sales e receita/GMV não
--   leem esses 3 campos, não são afetados por esta troca.
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
--   onboarding_status, onboarding_accomplished_date, onboarding_unaccomplished_date
--   (derivadas do join com dhaf_salesforce.onboarding/onboarding_history — ver comentário
--   acima, reescrito 10/08/2026; as duas datas agora vêm preenchidas quando o registro já
--   fechou, diferente da fonte antiga)
-- =============================================================================

WITH obd_dedup AS (
    SELECT
        o.opportunity__c,
        o.owner_email__c,
        o.onboarding_status__c AS onboarding_stage,
        o.createddate AS onboarding_created_date,
        LEFT(MIN(CASE WHEN oh.newvalue = 'Accomplished' THEN oh.createddate END), 10) AS onboarding_accomplished_date,
        LEFT(MIN(CASE WHEN oh.newvalue = 'Unaccomplished' THEN oh.createddate END), 10) AS onboarding_unaccomplished_date,
        ROW_NUMBER() OVER (
            PARTITION BY o.opportunity__c
            ORDER BY o.createddate DESC
        ) AS rn
    FROM dhaf_salesforce.onboarding o
    LEFT JOIN dhaf_salesforce.onboarding_history oh
        ON o.id = oh.parentid
    GROUP BY
        o.id,
        o.opportunity__c,
        o.owner_email__c,
        o.onboarding_status__c,
        o.createddate
)
SELECT
    t.*,
    u.username AS owner_email,
    f.onboarding_accomplished_date,
    f.onboarding_unaccomplished_date,
    f.onboarding_stage AS onboarding_status,
    -- dono ATUAL do registro de onboarding (10/08/2026) — pode ser diferente de
    -- t.onboarding_email_sf quando o caso foi reatribuído no Salesforce depois da criação da
    -- oportunidade. Coluna À PARTE (não sobrescreve onboarding_email_sf): usada só pra decidir
    -- de quem é a responsabilidade na Carteira/Estoque ATUAL (onbLeadsMap); histórico
    -- semanal/rankings continuam com t.onboarding_email_sf (quem fez o trabalho na época), a
    -- pedido do Gabriel — ver Pendencias/README.md.
    f.owner_email__c AS onboarding_owner_email_atual
FROM data_business.dhmv_sales_touched t
LEFT JOIN dhaf_salesforce."user" u
    ON u.id = t.lead_owner_id
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
ORDER BY t.lead_id;
