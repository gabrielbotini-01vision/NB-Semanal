# New Business · Cockpit

Dashboard de acompanhamento semanal/mensal do funil de New Business (SDR → Closer →
Onboarding), com KPIs vs. budget/reforecast, tendência de 4 semanas, ranking por pessoa
e visão 1:1 gestor ↔ funcionário.

## Estrutura do projeto

```
Querys/           queries Redshift (fonte oficial dos dados)
Dados/             CSVs exportados das queries + planilhas de budget/reforecast — LOCAL, não versionado
app/
  build_data.js    lê Dados/*.csv e gera app/app_data.js (dado agregado)
  app_data.js      dado agregado, gerado pelo build_data.js — este SIM é versionado
  index.html       o dashboard (abre direto no navegador, sem servidor)
Desgin System/     design system Hotmart (tokens de cor/tipografia usados no app/index.html)
```

`Dados/*.csv` nunca são versionados (contêm e-mail e receita linha a linha — ver `.gitignore`).
`app/app_data.js` é a versão agregada e é o único artefato de dado que vai pro GitHub, porque
é o que o dashboard publicado (GitHub Pages) precisa pra funcionar.

## Como abrir localmente

Sem instalação: abra `app/index.html` direto no navegador (duplo clique). Não precisa de
servidor nem de Node — Node só é necessário para *gerar* `app/app_data.js` a partir dos CSVs.

## Atualização semanal dos dados

Pré-requisito: [Node.js](https://nodejs.org) instalado (versão LTS).

1. Atualize `Dados/01_receita_semana_nivel_estrategia.csv` e `Dados/06_operacional_raw.csv`,
   de um dos dois jeitos:
   - **Automático (recomendado):** `python3 scripts/atualizar_dados.py` — roda as duas
     queries de `Querys/` direto no Astrobox (datasource `DHI_DATA_PRODUCTION`) e já escreve
     os CSVs em `Dados/`. Pré-requisito: `ASTROBOX_TOKEN` válido em `~/.env` (gerado pela
     skill `hotmart-oauth`; expira em ~48h, gere de novo quando o script acusar erro 401/403).
   - **Manual:** rode as queries no Redshift e exporte substituindo os arquivos com o mesmo
     nome, separador `;` (ver `Dados/README.md` para o contrato exato de cada arquivo).
   Atualize também `budget_oficial.csv`/`reforecast_oficial.csv` (meta mensal) e
   `f_budget_daily.csv`/`f_reforecast_daily.csv` (meta diária, alimenta a meta por semana)
   quando houver revisão de meta — essas continuam sendo planilhas mantidas à mão.
2. Duplo clique em `update.bat` (ou rode `node app/build_data.js` no terminal, a partir da
   raiz do projeto) — isso regenera `app/app_data.js`.
3. Abra `app/index.html` e confira as 4 abas.
4. Publique a atualização:
   ```
   git add app/app_data.js
   git commit -m "data: atualização semanal"
   git push
   ```

`06_operacional_raw.csv` traz 1 linha por lead (não pré-agregada por semana) — o `build_data.js`
faz a bucketização por semana/mês em JS, o que permite trocar o grão de tempo sem precisar
reescrever a query no Redshift. As antigas `02_safra_contacted.sql`...`05_produtividade.sql`
ficam em `Querys/` só como referência histórica.

## Abas do dashboard

- **Mensal Sales** — mês fechado vs. budget, MoM, fechamento por nível de cliente.
- **Semanal Sales** — KPIs da semana vs. meta, funil, motor de aquisição, ciclo, segmentação
  por nível, ranking de closers.
- **Semanal Área** (SDR / Closers / Onboarding) — produtividade e ranking por pessoa
  (`sdr_email`/`closer_email`/`onboarding_email` das bases).
- **1:1 Gestor** — busca por pessoa, tendência individual de 4 semanas, comparação com a
  mediana do squad, destaques/pontos de melhoria.

Onde a base real ainda não tem uma métrica (ex.: pipeline aberto, Net Revenue por onboarder
nomeado, meta individual por pessoa), o dashboard mostra "sem dado" em vez de inventar
número — ver `METRICAS.md` para o mapeamento completo métrica → coluna de origem.
