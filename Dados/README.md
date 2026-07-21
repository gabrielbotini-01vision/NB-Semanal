# Dados — contrato dos arquivos

Esta pasta é **local, nunca vai pro GitHub** (veja `.gitignore` na raiz). Contém os exports
brutos do Redshift + as planilhas de budget/reforecast mantidas à mão. O `app/build_data.js`
lê exatamente estes arquivos, com estes nomes, e escreve `app/app_data.js` (esse sim vai
pro repositório, porque é o dado já agregado que o dashboard publicado usa).

**Regra geral de export:** separador `;` (ponto e vírgula), primeira linha = cabeçalho,
mesmos nomes de coluna da query. Datas em `YYYY-MM-DD` nos exports do Redshift; em
`DD/MM/YYYY` nas planilhas de budget/reforecast (mantido assim de propósito — não mudar).

## Exports do Redshift (rodar `Querys/0X_*.sql` e sobrescrever o CSV correspondente)

| Arquivo | Query | Colunas esperadas |
|---|---|---|
| `01_receita_semana_nivel_estrategia.csv` | `Querys/01_receita_semana_nivel_estrategia.sql` | `ano_semana;semana;mes;nivel;estrategia;receita_net_brl_sales;gmv_brl_sales;sap_semana;sap_mensal` |
| `06_operacional_raw.csv` | `Querys/06_operacional_raw.sql` | `SELECT *` de `dhmv_sales_touched` + `owner_email` — todas as colunas da tabela fonte, não uma lista fixa (ver abaixo) |

`01_receita_semana_nivel_estrategia.csv` ainda alimenta Net Revenue/GMV/SAP como hoje (pré-agregado
por semana). Existe uma versão granular pronta para o futuro — `Querys/01b_financeira_raw.sql` /
`01b_financeira_raw.csv` — que vai substituir este arquivo quando a etapa de Parquet + DuckDB-Wasm
entrar (ver o plano da sessão); até lá, **não precisa exportar `01b_financeira_raw.csv`**, o
`build_data.js` de hoje não lê esse arquivo.

`06_operacional_raw.csv` substitui os antigos `02_safra_contacted.csv`, `03_safra_opportunity.csv`,
`04_safra_closed_won.csv` e `05_produtividade.csv` — essas 4 queries continuam no repositório
(`Querys/`) só como referência histórica, mas `build_data.js` não lê mais os CSVs delas.
É **obrigatório** (sem ele o build para).

⚠️ **Este arquivo traz TODAS as colunas de `dhmv_sales_touched` (`SELECT *`), de propósito —
para habilitar qualquer subquery/corte futuro sem precisar voltar no Redshift. Isso inclui,
provavelmente, telefone e outra PII direta do lead.** Por isso:
- É **local, gitignored, nunca sobe pro GitHub** — igual aos outros arquivos desta pasta.
- A barreira de privacidade real está no `app/build_data.js`: ele só lê os campos abaixo
  **por nome** e nunca repassa a linha inteira pro `app_data.js` (o arquivo que vai pro
  navegador). Colunas usadas hoje: `lead_id`, `contacted_date`, `connected_date`,
  `opportunity_create_date`, `sql_date`, `closed_won_date`, `activation_date_10k`,
  `amount_12_months` (deriva o nível), `sales_strategy`, `sdr_email_sf`, `closer_email_sf`,
  `onboarding_email_sf`, `owner_email`. Se um dia for preciso expor um campo novo no
  dashboard, é uma decisão explícita — não um efeito colateral de trazer tudo.

`build_data.js` faz o "unpivot" por etapa (cada evento contado na semana da sua própria data)
e a bucketização por semana/mês em JS — é isso que permite mudar o grão de tempo sem
reescrever a query no Redshift.

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
- Essas duas alimentam só `budget.mensal`/`reforecast.mensal` (aba **Mensal Sales**, mês
  fechado). A meta por **semana** (aba Semanal Sales) vem dos arquivos daily abaixo, não
  destas.

## Budget/reforecast diário (obrigatório — meta real por semana)

| Arquivo | Separador | Granularidade |
|---|---|---|
| `f_budget_daily.csv` | `;` | 1 linha por dia × nível × estratégia × pessoa (SDR/Closer/Onboarding), com rateio |
| `f_reforecast_daily.csv` | `;` | idem |

Data vem por extenso em português (`"sexta-feira, 13 de março de 2026"`), mas `build_data.js`
**não precisa parsear isso** — usa direto as colunas `Ano` + `Semana_Ano` (já seguem a mesma
regra de semana do resto do projeto: semana 1 parcial a partir de 01/jan, depois sempre
segunda-feira) e `Ano` + `Mes_Num`. As colunas `*_Dia` (`Contacted_Dia`, `Net_Revenue_Dia` etc.)
já vêm rateadas por dia/pessoa com **vírgula como separador decimal** (`numBr()` em
`build_data.js` — diferente do `money()` usado nas planilhas mensais, que usa ponto de
milhar sem decimal). Somar as `_Dia` de todas as linhas de uma mesma semana reconstrói a
meta da semana; somar o mês inteiro reconstrói o `f_goals.*` (validado, ~0,02% de diferença
por arredondamento).

Essas colunas também trazem meta por **pessoa** (SDR/Closer/Onboarding + `Percent_Rateio`) —
não usado ainda no dashboard, mas disponível para uma meta individual real no futuro (hoje
o 1:1 Gestor só compara com a mediana do squad, não com uma meta pessoal).

## Diretório de pessoas (opcional — alimenta nome + foto no dashboard)

| Arquivo | Separador | Colunas usadas |
|---|---|---|
| `Imagens Sales.csv` | `,` (vírgula — diferente do resto da pasta) | `Email`, `Nome Completo` (ou `Nome`), `Image` (URL da foto) |

Casa por e-mail (`sdr_email_sf`/`closer_email_sf`/`onboarding_email_sf`/`owner_email` do
`06_operacional_raw.csv`) com a coluna `Email` desta planilha. Se faltar este arquivo, ou se
uma pessoa não tiver linha correspondente, o dashboard cai de volta pro prefixo do e-mail
como nome e mostra um avatar com iniciais no lugar da foto — não é obrigatório.

## Atualização semanal

Ver o `README.md` da raiz do projeto para o passo a passo completo. Resumo: substitua os
CSVs desta pasta (mesmo nome, mesmo separador) e rode `update.bat` (ou `node app/build_data.js`).
