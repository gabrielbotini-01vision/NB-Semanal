# Pendências · New Business Cockpit

Notas de handoff para quem continuar o desenvolvimento. Última atualização: 22/07/2026.

## Estado atual do redesign

- O front novo (estilo admin SaaS "Stravix", sidebar lateral, laranja Hotmart, cards
  arredondados) **já é o `app/index.html` publicado** (promovido em 22/07/2026).
- O layout **antigo** ficou em **`app/index.legacy.html`** como backup (não é publicado).
- A wordmark "hotmart" na sidebar é **texto**, não o SVG oficial — trocar pelo vetor quando
  houver o asset (`app/hotmart-logo.svg`).

## Estruturas novas no `build_data.js` (todas indexadas por estratégia: all/Outbound/Inbound/Hunting)

Alimentam a página **Semanal Área › SDR**:

- `sdrEstoque` — estoque do funil (contacted/connected/nurturing) por semana, snapshot no fim
  de cada semana (semana em curso = snapshot até hoje).
- `sdrCohort` — coorte contato→conexão: contatados na semana × conectaram na mesma semana.
- `sdrUnq` — unqualifieds por semana.
- `sdrOppsNivel` — opps por nível × semana.
- `sdrOppFte` / `sdrContactFte` — nº de SDRs distintos que geraram opp / que contataram, por semana.
- `sdrCohortStatus` — por semana de CONTATO, status atual (hoje) de cada lead:
  contacted/connected/nurturing/qualified/unqualified (data mais recente vence).

Regenerar: `node app/build_data.js` (lê `Dados/*.csv` locais).

## Backlog / a confirmar

1. **FTE de SDR real:** "Contacted/FTE" e "Opps/FTE" usam como FTE os SDRs que de fato
   contataram / geraram opp na semana (aproximação). Trocar por base de headcount/escala real
   quando disponível.
2. **"Produtividade diária" (tabela por pessoa):** hoje = **opps/dia** = `opps da semana ÷ 5`
   e média 3 semanas = `(W + W-1 + W-2) ÷ 15`. Confirmar se é isso mesmo ou contatados/dia, e
   se deve usar dias úteis decorridos na semana em curso em vez de fixar 5.
3. **Filtro de Estratégia:** hoje só funciona/aparece na sub-aba **SDR**. Estender para
   Closers e Onboarding (KPIs já dá via `porEstrategia`; tabelas por pessoa precisam de
   dimensão de estratégia por pessoa/semana).
4. **Tabela por pessoa × estratégia:** o filtro de estratégia na tabela de SDR usa a
   **estratégia primária** da pessoa (aprox.). Preciso por lead/semana exigiria quebrar o
   `porSemana` por estratégia no build.
5. **Chip de ícone nos KPI cards** (estilo Stravix, círculo colorido) — não implementado.
6. **Definição de "status atual" e "saída do estoque":** hoje um lead sai do estoque de SDR
   quando vira opp/qualificado ou é desqualificado. Confirmar se a regra bate com a operação.

## Convenções do projeto (não esquecer)

- Só commitar/push quando o Gabriel/Guilherme pedir explicitamente.
- `build_data.js` só lê campos por nome do `06_operacional_raw.csv` (que tem PII) — nunca
  fazer spread da linha inteira pro `app_data.js`.
- `FILTRO_ANO`/`FILTRO_ANO`-equivalente restringe filtros de mês ao ano corrente — ajustar na
  virada de ano.
