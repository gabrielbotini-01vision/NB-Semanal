# New Business · Cockpit — Métricas (nossa v0)

Mapeamento entre as métricas do dashboard e as **colunas reais** das tabelas do n8n
(`financeira` e `operacional`). Grau de confiança por métrica.

**Legenda de confiança**
- 🟢 **Alto** — mapeia direto para coluna existente; cálculo simples (count/sum/ratio).
- 🟡 **Médio** — exige uma decisão (segmentação, moeda, parse de data) ou a coluna veio **vazia na amostra** de 1 linha.
- 🔴 **Baixo** — **não há fonte** nos dados atuais.

---

## Containers do dashboard

| # | Container | Métrica | Fonte (tabela.coluna) | Cálculo | Confiança |
|---|-----------|---------|------------------------|---------|-----------|
| 1 | Net Revenue (BRL) | Receita líquida realizada | `financeira.revenue_net_brl_sales` | Σ da coluna nas linhas ganhas | 🟢 Alto |
| 2 | GMV (BRL) | GMV realizado | `financeira.gmv_brl_sales` | Σ da coluna | 🟢 Alto |
| 3 | Closed Won (contagem) | Nº de deals ganhos | `financeira.closed_won_date` | count(≠ vazio); fallback = nº de linhas | 🟢 Alto |
| 5 | Ticket médio | Receita por deal | derivado (1 ÷ 3) | Net Revenue BRL ÷ Closed Won | 🟡 Médio — depende de 1 linha = 1 deal |
| 6 | Funil (7 estágios) | Volume por estágio | `operacional.*_date` | count(≠ vazio) por estágio (ver abaixo) | 🟡 Médio (misto) |
| 7 | Taxas de conversão | Passagem entre estágios | derivado do funil | estágio(n+1) ÷ estágio(n) | 🟡 Médio |
| 8 | Net Revenue por nível | Receita por segmento de cliente | `financeira.revenue_net_brl_sales` + `financeira.segmentation` | Σ agrupado por bucket de nível | 🟡 Médio — mapeamento de níveis |
| 9 | Closed Won por nível | Deals por segmento | `financeira.segmentation` | count agrupado por bucket | 🟡 Médio |
| 10 | Inbound × Outbound | Leads/Opps por motor | `operacional.sales_strategy` | agrupa por estratégia; Opp = opp ≠ vazio | 🟢 Alto |
| 11 | Tempos de ciclo | Quali / Deal / Ativação médios | `operacional.Quali_time`, `Deal_time`, `Activation_Time` | média (linhas ≠ vazio) | 🟡 Médio — unidade a confirmar |
| 12 | Bloqueadas | (ver seção abaixo) | — | — | 🔴 Baixo |

### Detalhe do funil (container 6)

| Estágio | Fonte | Cálculo | Confiança |
|---------|-------|---------|-----------|
| Lead in | `operacional` (linhas) / `lead_create_date` | count de linhas | 🟢 Alto |
| Contatado | `operacional.contacted_date` | count(≠ vazio) | 🟢 Alto |
| Conectado | `operacional.connected_date` | count(≠ vazio) | 🟡 Médio — nulo na amostra |
| Opp in | `operacional.opportunity_create_date` (fallback `opp_id`) | count(≠ vazio) | 🟢 Alto |
| SQL | `operacional.sql_date` | count(≠ vazio) | 🟡 Médio — nulo na amostra |
| Closed Won | `operacional.closed_won_date` | count(≠ vazio) | 🟢 Alto |
| Ativado 10k | `operacional.activation_date_10k` | count(≠ vazio) | 🟢 Alto |

Mapeamento de segmentação (containers 8 e 9): `N2,N3 → N2/N3` · `N4,N5 → N4/N5` · `N6+ → N6+`.

---

## Métricas bloqueadas (container 12) — o mockup pede, os dados não têm

| Métrica do mockup | Por que está bloqueada | O que destrava |
|-------------------|------------------------|----------------|
| Meta / Budget / Target (Net Rev, CW, Opp, Ativação) | Não existe coluna de meta em nenhuma tabela | Tabela de metas por período/nível/pessoa |
| Pacing MTD × BTD, Atingimento %, Gap vs budget, Forecast vs meta | Todos dependem de budget/meta | idem acima |
| Ranking por pessoa (nome) | Só há IDs (`lead_owner_id`, `closer_email_sf`, `onboarding_email_sf`), nulos na amostra | De-para ID → nome (usuários SF) |
| Saúde da carteira (ontrack / carrinho / atrasado) | Sem coluna de estado de onboarding | Aproximar por datas, ou coluna de status |
| Cobertura de pipeline (CW) | Depende de meta de CW restante + opps abertas | Meta de CW + snapshot de pipe aberto |
| Tendência semanal (WoW / 4 semanas) | Datas por extenso ("sábado, 13 de junho de 2026") — precisa parse + bucket semanal | Parser de data (fica pra v1) |
| Net Revenue consolidado (BRL+USD+EUR) | Moedas separadas, sem taxa de câmbio | Definir FX ou coluna já consolidada |

---

## Colunas ainda não usadas (candidatas a métrica)

- `financeira`: `sale_type`, `is_current_new`, `user_producer_id`, `user_office_name`, `RecordNome`, `BU`, `GMV_buckets`, `InicioDoMes`, `date`
- `operacional`: `unqualified_date`, `lost_deal_date`, `lead_recordtypeid`, `Filtro_Data` (formato `d/m/aaaa` — bom para bucket semanal), `amount_12_months`, `st_biz_unit`
