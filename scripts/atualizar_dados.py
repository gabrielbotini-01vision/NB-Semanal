#!/usr/bin/env python3
"""
atualizar_dados.py — puxa as queries de Querys/*.sql direto do Astrobox (datasource
DHI_DATA_PRODUCTION) e escreve os CSVs em Dados/, no lugar de rodar a query na mão
no Redshift/console e exportar manualmente.

Uso:
    python3 scripts/atualizar_dados.py            # roda as duas queries abaixo
    python3 scripts/atualizar_dados.py 06          # roda só uma (prefixo do nome)

Token: lido de ~/.env (ASTROBOX_TOKEN=...), igual ao padrão da skill astrobox-api.
Nunca commitar esse arquivo — o token é pessoal e expira em ~48h.
"""

import csv
import json
import os
import sys
import urllib.request
import urllib.error

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QUERYS_DIR = os.path.join(ROOT, "Querys")
DADOS_DIR = os.path.join(ROOT, "Dados")

DATASOURCE_ID = "cf50b492-856d-464a-bc02-769f29aaa3e2"  # DHI_DATA_PRODUCTION (Postgres)

# arquivo .sql em Querys/ -> csv de saída em Dados/ (mesmo contrato do Dados/README.md)
JOBS = [
    ("06_operacional_raw.sql", "06_operacional_raw.csv"),
    ("01_receita_semana_nivel_estrategia.sql", "01_receita_semana_nivel_estrategia.csv"),
]


def load_token():
    env_file = os.path.join(os.path.expanduser("~"), ".env")
    if not os.path.isfile(env_file):
        print(f"Erro: arquivo .env não encontrado em {env_file}", file=sys.stderr)
        print("Crie o arquivo com: ASTROBOX_TOKEN=<seu_token> (gerado pela skill hotmart-oauth)", file=sys.stderr)
        sys.exit(1)
    with open(env_file, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line.startswith("ASTROBOX_TOKEN="):
                token = line.split("=", 1)[1].strip()
                if not token:
                    break
                return token
    print("Erro: ASTROBOX_TOKEN não definido em ~/.env", file=sys.stderr)
    sys.exit(1)


def run_query(token, sql):
    payload = json.dumps({
        "sql": sql,
        "dataSourceId": DATASOURCE_ID,
        "parameters": {"_gmt": "-03:00"},
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api-astrobox.hotmart.com/v1/executor/reactive/real-time",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/x-ndjson",
            "Accept": "application/x-ndjson",
            "Origin": "https://astrobox.hotmart.com",
            "x-client-name": "astrobox",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            print(f"Erro: token expirado ou sem permissão (HTTP {e.code}).", file=sys.stderr)
            print("Gere um token novo (skill hotmart-oauth) e atualize ~/.env.", file=sys.stderr)
            sys.exit(2)
        print(f"Erro: HTTP {e.code}", file=sys.stderr)
        print(e.read().decode("utf-8", "replace"), file=sys.stderr)
        sys.exit(1)

    rows = [json.loads(line) for line in body.strip().splitlines() if line.strip()]
    return rows


def write_csv(rows, out_path):
    if not rows:
        print(f"[aviso] query não retornou linhas — {out_path} não foi escrito.", file=sys.stderr)
        return 0
    # ordem das colunas = ordem das chaves da primeira linha (é a ordem do SELECT).
    header = list(rows[0].keys())
    with open(out_path, "w", encoding="utf-8", newline="") as f:
        w = csv.writer(f, delimiter=";", quoting=csv.QUOTE_MINIMAL)
        w.writerow(header)
        for r in rows:
            w.writerow(["" if r.get(h) is None else r.get(h) for h in header])
    return len(rows)


def main():
    token = load_token()
    only = sys.argv[1] if len(sys.argv) > 1 else None
    jobs = [j for j in JOBS if not only or j[0].startswith(only)]
    if not jobs:
        print(f"Nenhuma query casa com o prefixo '{only}'.", file=sys.stderr)
        sys.exit(1)

    os.makedirs(DADOS_DIR, exist_ok=True)
    for sql_name, csv_name in jobs:
        sql_path = os.path.join(QUERYS_DIR, sql_name)
        with open(sql_path, encoding="utf-8") as f:
            sql = f.read()
        print(f"Rodando {sql_name} (datasource DHI_DATA_PRODUCTION)...")
        rows = run_query(token, sql)
        n = write_csv(rows, os.path.join(DADOS_DIR, csv_name))
        print(f"  -> Dados/{csv_name}: {n} linha(s)")

    print("Pronto. Rode 'node app/build_data.js' (ou update.bat) pra regerar o app_data.js.")


if __name__ == "__main__":
    main()
