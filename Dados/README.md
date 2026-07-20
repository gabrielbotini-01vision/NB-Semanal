# Dados — contrato dos arquivos

Esta pasta é **local, nunca vai pro GitHub** (veja `.gitignore` na raiz). Contém os exports
brutos do Redshift + as planilhas de budget/reforecast mantidas à mão. O `app/build_data.js`
lê exatamente estes 7 arquivos, com estes nomes, e escreve `app/app_data.js` (esse sim vai
pro repositório, porque é o dado já agregado que o dashboard publicado usa).

**Regra geral de export:** separador `;` (ponto e vírgula), primeira linha = cabeçalho,
mesmos nomes de coluna da query. Datas em `YYYY-MM-DD` nos exports do Redshift; em
`DD/MM/YYYY` nas planilhas de budget/reforecast (mantido assim de propósito — não mudar).

## Exports do Redshift (rodar `Querys/0X_*.sql` e sobrescrever o CSV correspondente)

| Arquivo | Query | Colunas esperadas |
|---|---|---|
| `01_receita_semana_nivel_estrategia.csv` | `Querys/01_receita_semana_nivel_estrategia.sql` | `ano_semana;semana;mes;nivel;estrategia;receita_net_brl_sales;gmv_brl_sales;sap_semana;sap_mensal` |
| `02_safra_contacted.csv` | `Querys/02_safra_contacted.sql` | `ano_semana;semana;mes;nivel;estrategia;sdr_email;closer_email;onboarding_email;owner_email;contatados;conectados;oportunidades;sqls;ganhos;ativados_10k;desqualificados;perdidos;amount_3m;amount_12m;dias_contato_conectado;dias_conectado_opp;dias_opp_sql;dias_sql_won;dias_won_ativacao` |
| `03_safra_opportunity.csv` | `Querys/03_safra_opportunity.sql` | `ano_semana;semana;mes;nivel;estrategia;sdr_email;closer_email;onboarding_email;owner_email;oportunidades;sqls;ganhos;ativados_10k;desqualificados;perdidos;amount_3m;amount_12m;dias_opp_sql;dias_sql_won;dias_won_ativacao` |
| `04_safra_closed_won.csv` | `Querys/04_safra_closed_won.sql` | `ano_semana;semana;mes;nivel;estrategia;sdr_email;closer_email;onboarding_email;owner_email;ganhos;ativados_10k;desqualificados;perdidos;amount_3m;amount_12m;dias_won_ativacao` |
| `05_produtividade.csv` *(opcional — ver abaixo)* | `Querys/05_produtividade.sql` | `ano_semana;semana;mes;etapa_ordem;etapa;nivel;estrategia;sdr_email;closer_email;onboarding_email;owner_email;qtd;amount_3m;amount_12m;dias_desde_etapa_anterior` |

`05_produtividade.csv` alimenta só o funil mensal/semanal por etapa (Contatado → Conectado →
Opp → SQL → CW → Ativado 10k) na aba **Semanal Sales**. Se ele não existir, o `build_data.js`
roda mesmo assim (não é obrigatório) e o app mostra "dado parcial" nessa seção — todo o resto
do dashboard (KPIs, Mensal Sales, Semanal Área, 1:1 Gestor) funciona só com 01-04 + budget/reforecast.

## Planilhas mantidas à mão (atualizar direto na planilha oficial e reexportar)

| Arquivo | Colunas esperadas |
|---|---|
| `budget_oficial.csv` | `Data;Estrategia;Nivel;Contacted;Connected;Opps;SQL;CW;Activation;SAP;GMV;Net Revenue` |
| `reforecast_oficial.csv` | `Data;Estratégia;Nível;Contacted;Connected;Opps;SQL;CW;Activation;SAP;GMV;Net Revenue` |

- `Data` no formato `DD/MM/YYYY` (primeiro dia do mês, ex.: `01/07/2026`).
- `Nivel`/`Nível` usa direto os buckets `N2-N3`, `N4-N5`, `N6+` (não `N2`/`N3`/... separados).
- Colunas numéricas usam `.` como separador de milhar e não têm casas decimais
  (ex.: `R$ 1.234.567` ou `1.234`) — o parser (`money()` em `build_data.js`) remove tudo
  que não é dígito, então isso é seguro tanto com quanto sem o prefixo `R$`.

## Atualização semanal

Ver o `README.md` da raiz do projeto para o passo a passo completo. Resumo: substitua os
CSVs desta pasta (mesmo nome, mesmo separador) e rode `update.bat` (ou `node app/build_data.js`).
