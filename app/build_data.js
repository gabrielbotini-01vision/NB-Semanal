const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'Dados') + path.sep;
const outDir = __dirname + path.sep;

// ---------- checagem de arquivos obrigatórios ----------
const REQUIRED = {
  '01_receita_semana_nivel_estrategia.csv': '01_receita_semana_nivel_estrategia.sql',
  '06_operacional_raw.csv': '06_operacional_raw.sql',
  'budget_oficial.csv': null,
  'reforecast_oficial.csv': null,
  'f_budget_daily.csv': null,
  'f_reforecast_daily.csv': null,
};
const missing = Object.keys(REQUIRED).filter(f => !fs.existsSync(DIR + f));
if (missing.length) {
  console.error('Faltam arquivos obrigatórios em Dados/:');
  missing.forEach(f => console.error('  - ' + f + (REQUIRED[f] ? '  (rode Querys/' + REQUIRED[f] + ' no Redshift e exporte com esse nome, separador ";")' : '  (planilha de budget/reforecast mantida à mão)')));
  console.error('\nVeja Dados/README.md para o contrato de cada arquivo.');
  process.exit(1);
}

// Parser de CSV de verdade (RFC4180: campo entre aspas pode conter delimitador/quebra de
// linha literal; "" dentro de aspas = aspas escapada). Os exports gerados pelo
// scripts/atualizar_dados.py (Astrobox -> NDJSON -> CSV via csv.writer do Python) já saem
// assim, então texto livre com quebra de linha/`;` embutido (motivo de perda, nome de
// produtor etc.) vem corretamente entre aspas e este parser lê direto, sem corromper nada.
function parseCsvRows(raw, delim) {
  const rows = [];
  let field = '', row = [], inQuotes = false, atFieldStart = true;
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (inQuotes) {
      if (c === '"') {
        if (raw[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else field += c;
      continue;
    }
    // Só entra em modo "aspas" se a aspa é o PRIMEIRO caractere do campo (RFC4180: campo
    // é inteiramente cotado ou não é). Isso evita que uma aspa solta no meio de texto livre
    // (comum em export antigo, sem escape de verdade) seja confundida com abertura de aspas.
    if (c === '"' && atFieldStart) { inQuotes = true; atFieldStart = false; continue; }
    if (c === delim) { row.push(field); field = ''; atFieldStart = true; continue; }
    if (c === '\r') continue;
    if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; atFieldStart = true; continue; }
    field += c; atFieldStart = false;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}
// Fallback pra exports antigos, exportados à mão do Redshift SEM aspas ao redor de campo com
// quebra de linha embutida (não é CSV válido nesse caso) — junta linhas consecutivas até
// bater a contagem de colunas do cabeçalho. Em um CSV bem formado (gerado pelo
// scripts/atualizar_dados.py) toda linha já sai com a contagem certa, então isso não faz nada.
function reassembleByFieldCount(rows, H) {
  const out = [];
  let buf = null;
  let descartadas = 0;
  for (const fields of rows) {
    if (buf === null) buf = fields;
    else { buf[buf.length - 1] += '\n' + fields[0]; buf = buf.concat(fields.slice(1)); }
    if (buf.length >= H) { out.push(buf.slice(0, H)); buf = null; }
  }
  if (buf !== null) descartadas++;
  return { rows: out, descartadas };
}
function readCsv(name, delim) {
  delim = delim || ';';
  const raw = fs.readFileSync(DIR + name, 'utf8').replace(/^﻿/, '');
  const rawRows = parseCsvRows(raw, delim);
  if (!rawRows.length) return [];
  const head = rawRows[0].map(h => h.trim());
  const { rows, descartadas } = reassembleByFieldCount(rawRows.slice(1), head.length);
  if (descartadas) console.warn('[aviso] ' + name + ': ' + descartadas + ' linha(s) final(is) incompleta(s) descartada(s).');
  return rows.map(cols => {
    const o = {};
    head.forEach((h, i) => o[h] = cols[i]);
    return o;
  });
}
// Arquivos opcionais (enriquecimento) — se faltar, o resto do build segue normal.
function readCsvOptional(name, delim) {
  try { return readCsv(name, delim); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
}

const mesKey = d => d ? d.slice(0, 7) : null;            // '2025-01-01' -> '2025-01'
const mesBr  = d => { const [dd, mm, yy] = d.split('/'); return yy + '-' + mm; }; // '01/02/2026'->'2026-02'
const bucket = n => { n = (n || '').replace('N', ''); const x = +n;
  if (x === 2 || x === 3) return 'N2-N3'; if (x === 4 || x === 5) return 'N4-N5'; if (x >= 6) return 'N6+'; return 'Sem nivel'; };
// operacional_raw.csv vem cru (SELECT *) — nível é derivado direto do amount_12_months
// numérico, mesma régua de sempre (<=1M N2/N3 · <=5M N4/N5 · acima N6+).
const bucketFromAmount = s => { const amt = parseFloat(s);
  if (!isFinite(amt)) return 'Sem nivel'; if (amt <= 1000000) return 'N2-N3'; if (amt <= 5000000) return 'N4-N5'; return 'N6+'; };
// operacional_raw.csv tem campos de texto livre sem nenhum escape/aspa ao redor (motivo de
// perda, nome de produtor com "&" etc.) — uma minoria de linhas fica desalinhada de um jeito
// que a reconstrução por contagem de coluna (readCsv) não recupera 100%. Em vez de tentar
// reconstruir cada caso exótico, validamos o FORMATO de cada campo antes de confiar nele:
// se não parece data/e-mail de verdade, vira null em vez de contaminar semana/mês/pessoa.
const estr = s => ({ OUTBOUND: 'Outbound', INBOUND: 'Inbound', HUNTING: 'Hunting' }[(s || '').toUpperCase()] || null);
const money = s => parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0;  // 'R$ 1.234.567' -> 1234567
const num = s => { const v = parseFloat(s); return isFinite(v) ? v : 0; };
// f_budget_daily/f_reforecast_daily usam vírgula como separador DECIMAL (sem separador de
// milhar) — diferente do money() acima, que é pra planilha mensal (ponto de milhar, sem decimal).
const numBr = s => { const v = parseFloat(String(s).replace(',', '.')); return isFinite(v) ? v : 0; };
// datas do Redshift vêm como '', 'null' (texto) ou 'AAAA-MM-DD'; só aceita se bater o formato.
const cleanDate = s => { if (!s) return null; const t = String(s).trim(); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null; };
const cleanEmail = s => { if (!s) return null; const t = String(s).trim(); return t.includes('@') ? t : null; };

// Mesma regra de semana usada nas queries SQL (Querys/01 e Querys/05): semana 1 = 01/jan até
// o dia anterior à 1ª segunda-feira do ano (parcial); da 2ª semana em diante começa na segunda.
function firstMondayUTC(year) {
  const jan1 = new Date(Date.UTC(year, 0, 1));
  const add = (8 - jan1.getUTCDay()) % 7;
  const d = new Date(jan1); d.setUTCDate(d.getUTCDate() + add);
  return d;
}
function anoSemana(dateStr) {
  const d = new Date(dateStr + 'T00:00:00Z');
  const year = d.getUTCFullYear();
  const fm = firstMondayUTC(year);
  if (d < fm) return year + '-W01';
  const weekNum = Math.floor((d - fm) / 86400000 / 7) + 2;
  return year + '-W' + String(weekNum).padStart(2, '0');
}

const NIVEIS = ['N2-N3', 'N4-N5', 'N6+'];
const ESTRS = ['Outbound', 'Inbound', 'Hunting'];
const METRICS = ['contacted', 'connected', 'opps', 'sql', 'cw', 'activation', 'sap', 'gmv', 'receita'];
function blankM() { const o = {}; METRICS.forEach(m => o[m] = 0); return o; }
function addM(a, b) { METRICS.forEach(m => a[m] += b[m] || 0); return a; }
function getP(map, email) { if (!map[email]) map[email] = { email }; return map[email]; }
function wk(p, w) { return (p.porSemana || (p.porSemana = {}))[w] || (p.porSemana[w] = {}); }
function last4Weekly(semanalObj, allWeeks) {
  const ws = allWeeks.filter(w => semanalObj && semanalObj[w] != null).sort().slice(-4);
  return ws.map(w => ({ semana: w, valor: Math.round(semanalObj[w]) }));
}

// ---------- ACTUAL: 01 (receita/gmv/sap) ----------
// Ainda pré-agregada por semana no SQL — a versão granular (financeira_raw.csv, via
// Parquet + DuckDB-Wasm) entra numa etapa seguinte; por ora este arquivo não muda.
const f01 = readCsv('01_receita_semana_nivel_estrategia.csv');
const finCell = {};   // key mes|nivelbucket|estr
const finCellSemanal = {}; // key ano_semana|nivelbucket|estr (mesma coisa, grão semana)
for (const r of f01) {
  const b = bucket(r.nivel), e = estr(r.estrategia);
  const mk = mesKey(r.mes);
  const k = mk + '|' + b + '|' + e;
  if (!finCell[k]) finCell[k] = { receita: 0, gmv: 0, sap: 0 };
  finCell[k].receita += num(r.receita_net_brl_sales);
  finCell[k].gmv += num(r.gmv_brl_sales);
  finCell[k].sap = Math.max(finCell[k].sap, +r.sap_mensal || 0); // max MTD = sap do mês por celula
  const w = r.ano_semana;
  const kw = w + '|' + b + '|' + e;
  if (!finCellSemanal[kw]) finCellSemanal[kw] = { receita: 0, gmv: 0, sap: 0 };
  finCellSemanal[kw].receita += num(r.receita_net_brl_sales);
  finCellSemanal[kw].gmv += num(r.gmv_brl_sales);
}

// ---------- ACTUAL: operacional_raw (1 linha por lead — substitui 02/03/04/05) ----------
// Cada estágio é contado na semana da SUA PRÓPRIA data (throughput, não coorte) — isso é
// o "unpivot" que antes era feito em SQL (05_produtividade.sql), agora em JS, para poder
// trocar o grão de tempo sem reescrever query nenhuma.
//
// ⚠️ operacional_raw.csv é um SELECT * (Querys/06_operacional_raw.sql) — pode conter PII
// (telefone etc.) que não tem nada a ver com o dashboard. A partir daqui só lemos os campos
// abaixo, POR NOME — nunca fazemos spread da linha inteira. Se for adicionar um campo novo
// ao app_data.js (o arquivo que vai pro navegador), confirme antes que não é PII.
const fop = readCsv('06_operacional_raw.csv');
const STAGES = [
  ['contacted_date', 'contacted'],
  ['connected_date', 'connected'],
  ['opportunity_create_date', 'opps'],
  ['sql_date', 'sql'],
  ['closed_won_date', 'cw'],
  ['activation_date_10k', 'activation'],
];
const CUTOFF = '2025-01-01';

const funCell = {};   // mes|nivelbucket|estr -> {contacted,...}
const funCellSemanal = {}; // ano_semana|nivelbucket|estr -> {contacted,...} (mesma coisa, grão semana)
const semContactedNivel = {}, semOppNivel = {}, semCwNivel = {}, semActNivel = {};
const porPessoaSdr = {}, porPessoaCloser = {}, porPessoaOnb = {};
const rankCw = {}, rankOwner = {};
const fteBy = {};
const fteByWeek = {}; // semana -> estrategia -> {sdrs:Set, contacted, opps} (mesma coisa que fteBy, por semana)
const cicloAcc = { dias_contato_conectado: [], dias_conectado_opp: [], dias_opp_sql: [], dias_sql_won: [], dias_won_ativacao: [] };
// coorte de contato→conexão POR SEMANA: dos leads contatados na semana W, quantos conectaram
// na PRÓPRIA semana W (não é o throughput de connected, que conta conexões de coortes antigas).
const sdrCohort = { all: {}, Outbound: {}, Inbound: {}, Hunting: {} }; // estr -> W -> { contacted, conn }
const sdrUnq = { all: {}, Outbound: {}, Inbound: {}, Hunting: {} };    // estr -> W -> nº de unqualifieds
const sdrOppFteSet = { all: {}, Outbound: {}, Inbound: {}, Hunting: {} }; // estr -> W -> Set(sdr que gerou opp)
// coorte por semana de CONTATO × status ATUAL (hoje) do lead — situação mais recente entre
// contacted/connected/nurturing/qualified/unqualified (data mais recente vence).
const sdrCohortStatus = { all: {}, Outbound: {}, Inbound: {}, Hunting: {} }; // estr -> W(contato) -> {status: n}
const sdrContactFteSet = { all: {}, Outbound: {}, Inbound: {}, Hunting: {} }; // estr -> W -> Set(sdr que contatou)

function pushCiclo(key, dateA, dateB) {
  if (!dateA || !dateB) return null;
  const d = (new Date(dateB + 'T00:00:00Z') - new Date(dateA + 'T00:00:00Z')) / 86400000;
  if (!isFinite(d) || d < 0) return null;
  cicloAcc[key].push(d);
  return d;
}

for (const r of fop) {
  const b = bucketFromAmount(r.amount_12_months), e = estr(r.sales_strategy);
  const sdr = cleanEmail(r.sdr_email_sf), closer = cleanEmail(r.closer_email_sf), onb = cleanEmail(r.onboarding_email_sf), owner = cleanEmail(r.owner_email);
  // datas cruas normalizadas uma vez por lead (SELECT * pode trazer '', 'null' ou data real)
  const dates = {}; for (const [col] of STAGES) dates[col] = cleanDate(r[col]);

  // coorte semanal contato→conexão (por estratégia): denom = contatado em W; num = conectou em W.
  const _estrLead = estr(r.sales_strategy);
  if (dates.contacted_date) {
    const wc = anoSemana(dates.contacted_date);
    const connSame = dates.connected_date && anoSemana(dates.connected_date) === wc;
    const bumpCoh = o => { const cc = o[wc] || (o[wc] = { contacted: 0, conn: 0 }); cc.contacted++; if (connSame) cc.conn++; };
    bumpCoh(sdrCohort.all); if (_estrLead) bumpCoh(sdrCohort[_estrLead]);
  }
  const _unq = cleanDate(r.unqualified_date);
  if (_unq) { const wq = anoSemana(_unq); sdrUnq.all[wq] = (sdrUnq.all[wq] || 0) + 1; if (_estrLead) sdrUnq[_estrLead][wq] = (sdrUnq[_estrLead][wq] || 0) + 1; }
  if (dates.contacted_date) {
    const wc = anoSemana(dates.contacted_date);
    const sd = { contacted: dates.contacted_date, connected: dates.connected_date,
      nurturing: cleanDate(r.nurturing_date), qualified: cleanDate(r.qualified_date), unqualified: _unq };
    let status = 'contacted', bestD = sd.contacted;
    for (const k of ['connected', 'nurturing', 'qualified', 'unqualified']) if (sd[k] && sd[k] >= bestD) { bestD = sd[k]; status = k; }
    const bumpSt = o => { const cc = o[wc] || (o[wc] = { contacted: 0, connected: 0, nurturing: 0, qualified: 0, unqualified: 0 }); cc[status]++; };
    bumpSt(sdrCohortStatus.all); if (_estrLead) bumpSt(sdrCohortStatus[_estrLead]);
  }

  if (e) {
    const f = fteBy[e] || (fteBy[e] = { sdrs: new Set(), contacted: 0, opps: 0 });
    if (sdr) f.sdrs.add(sdr);
  }

  // tempos de ciclo — por lead, independente do corte >=2025 usado nas contagens de estágio
  const dCC = pushCiclo('dias_contato_conectado', dates.contacted_date, dates.connected_date);
  pushCiclo('dias_conectado_opp', dates.connected_date, dates.opportunity_create_date);
  const dOS = pushCiclo('dias_opp_sql', dates.opportunity_create_date, dates.sql_date);
  const dSW = pushCiclo('dias_sql_won', dates.sql_date, dates.closed_won_date);
  const dWA = pushCiclo('dias_won_ativacao', dates.closed_won_date, dates.activation_date_10k);
  // ciclo por semana: bucketiza pela semana da data "de chegada" de cada transição (mesma
  // data que já bucketiza o estágio correspondente mais abaixo), pra poder mostrar o ciclo
  // médio da semana selecionada nas tabelas de Semanal Área.
  if (dCC != null && sdr) {
    const p = getP(porPessoaSdr, sdr); p._dCCsum = (p._dCCsum || 0) + dCC; p._dCCn = (p._dCCn || 0) + 1;
    if (dates.connected_date) { const pw = wk(p, anoSemana(dates.connected_date)); pw.dCCsum = (pw.dCCsum || 0) + dCC; pw.dCCn = (pw.dCCn || 0) + 1; }
  }
  if (dOS != null && closer) {
    const p = getP(porPessoaCloser, closer); p._dOSsum = (p._dOSsum || 0) + dOS; p._dOSn = (p._dOSn || 0) + 1;
    if (dates.sql_date) { const pw = wk(p, anoSemana(dates.sql_date)); pw.dOSsum = (pw.dOSsum || 0) + dOS; pw.dOSn = (pw.dOSn || 0) + 1; }
  }
  if (dSW != null && closer) {
    const p = getP(porPessoaCloser, closer); p._dSWsum = (p._dSWsum || 0) + dSW; p._dSWn = (p._dSWn || 0) + 1;
    if (dates.closed_won_date) { const pw = wk(p, anoSemana(dates.closed_won_date)); pw.dSWsum = (pw.dSWsum || 0) + dSW; pw.dSWn = (pw.dSWn || 0) + 1; }
  }
  if (dWA != null && onb) {
    const p = getP(porPessoaOnb, onb); p._dWAsum = (p._dWAsum || 0) + dWA; p._dWAn = (p._dWAn || 0) + 1;
    if (dates.activation_date_10k) { const pw = wk(p, anoSemana(dates.activation_date_10k)); pw.dWAsum = (pw.dWAsum || 0) + dWA; pw.dWAn = (pw.dWAn || 0) + 1; }
  }

  for (const [col, key] of STAGES) {
    const dateStr = dates[col];
    if (!dateStr || dateStr < CUTOFF) continue;
    const mk = dateStr.slice(0, 7), w = anoSemana(dateStr);

    const ck = mk + '|' + b + '|' + e;
    if (!funCell[ck]) funCell[ck] = { contacted: 0, connected: 0, opps: 0, sql: 0, cw: 0, activation: 0 };
    funCell[ck][key] += 1;
    const ckw = w + '|' + b + '|' + e;
    if (!funCellSemanal[ckw]) funCellSemanal[ckw] = { contacted: 0, connected: 0, opps: 0, sql: 0, cw: 0, activation: 0 };
    funCellSemanal[ckw][key] += 1;

    if (key === 'contacted') {
      (semContactedNivel[w] = semContactedNivel[w] || {})[b] = (semContactedNivel[w][b] || 0) + 1;
      if (sdr) {
        const p = getP(porPessoaSdr, sdr); p.contacted = (p.contacted || 0) + 1; p.estrategia = e || p.estrategia;
        wk(p, w).contacted = (wk(p, w).contacted || 0) + 1;
        (sdrContactFteSet.all[w] = sdrContactFteSet.all[w] || new Set()).add(sdr);
        if (e) (sdrContactFteSet[e][w] = sdrContactFteSet[e][w] || new Set()).add(sdr);
      }
      if (e) {
        fteBy[e].contacted += 1;
        const fwe = (fteByWeek[w] = fteByWeek[w] || {})[e] = (fteByWeek[w] || {})[e] || { sdrs: new Set(), contacted: 0, opps: 0 };
        if (sdr) fwe.sdrs.add(sdr);
        fwe.contacted += 1;
      }
    }
    if (key === 'connected' && sdr) {
      const p = getP(porPessoaSdr, sdr); p.connected = (p.connected || 0) + 1;
      wk(p, w).connected = (wk(p, w).connected || 0) + 1;
    }
    if (key === 'opps') {
      (semOppNivel[w] = semOppNivel[w] || {})[b] = (semOppNivel[w][b] || 0) + 1;
      if (sdr) {
        const p = getP(porPessoaSdr, sdr);
        p.opps = (p.opps || 0) + 1;
        p.oppNivel = p.oppNivel || {}; p.oppNivel[b] = (p.oppNivel[b] || 0) + 1;
        p.semanal = p.semanal || {}; p.semanal[w] = (p.semanal[w] || 0) + 1;
        const pw = wk(p, w); pw.opps = (pw.opps || 0) + 1; pw.oppNivel = pw.oppNivel || {}; pw.oppNivel[b] = (pw.oppNivel[b] || 0) + 1;
        (sdrOppFteSet.all[w] = sdrOppFteSet.all[w] || new Set()).add(sdr);
        if (e) (sdrOppFteSet[e][w] = sdrOppFteSet[e][w] || new Set()).add(sdr);
      }
      if (closer) {
        const p = getP(porPessoaCloser, closer); p.opps = (p.opps || 0) + 1;
        wk(p, w).opps = (wk(p, w).opps || 0) + 1;
      }
      if (e) {
        fteBy[e].opps += 1;
        const fwe = (fteByWeek[w] = fteByWeek[w] || {})[e] = (fteByWeek[w] || {})[e] || { sdrs: new Set(), contacted: 0, opps: 0 };
        fwe.opps += 1;
      }
    }
    if (key === 'sql' && closer) {
      const p = getP(porPessoaCloser, closer); p.sql = (p.sql || 0) + 1;
      wk(p, w).sql = (wk(p, w).sql || 0) + 1;
    }
    if (key === 'cw') {
      (semCwNivel[w] = semCwNivel[w] || {})[b] = (semCwNivel[w][b] || 0) + 1;
      if (closer) {
        const p = getP(porPessoaCloser, closer);
        p.cw = (p.cw || 0) + 1;
        p.cwNivel = p.cwNivel || {}; p.cwNivel[b] = (p.cwNivel[b] || 0) + 1;
        p.semanal = p.semanal || {}; p.semanal[w] = (p.semanal[w] || 0) + 1;
        const pw = wk(p, w); pw.cw = (pw.cw || 0) + 1; pw.cwNivel = pw.cwNivel || {}; pw.cwNivel[b] = (pw.cwNivel[b] || 0) + 1;
        rankCw[closer] = rankCw[closer] || { email: closer, cw: 0, ativados: 0 }; rankCw[closer].cw += 1;
      }
      if (onb) {
        const p = getP(porPessoaOnb, onb); p.cwIn = (p.cwIn || 0) + 1;
        wk(p, w).cwIn = (wk(p, w).cwIn || 0) + 1;
      }
      if (owner) { rankOwner[owner] = rankOwner[owner] || { email: owner, cw: 0, ativados: 0 }; rankOwner[owner].cw += 1; }
    }
    if (key === 'activation') {
      (semActNivel[w] = semActNivel[w] || {})[b] = (semActNivel[w][b] || 0) + 1;
      if (onb) {
        const p = getP(porPessoaOnb, onb);
        p.activated = (p.activated || 0) + 1;
        p.actNivel = p.actNivel || {}; p.actNivel[b] = (p.actNivel[b] || 0) + 1;
        p.semanal = p.semanal || {}; p.semanal[w] = (p.semanal[w] || 0) + 1;
        const pw = wk(p, w); pw.activated = (pw.activated || 0) + 1; pw.actNivel = pw.actNivel || {}; pw.actNivel[b] = (pw.actNivel[b] || 0) + 1;
      }
      if (closer) { rankCw[closer] = rankCw[closer] || { email: closer, cw: 0, ativados: 0 }; rankCw[closer].ativados += 1; }
      if (owner) { rankOwner[owner] = rankOwner[owner] || { email: owner, cw: 0, ativados: 0 }; rankOwner[owner].ativados += 1; }
    }
  }
}

// montar actual.mensal
function buildMensal(cells) {
  // cells: key mes|nivel|estr -> partial metrics; retorna {mes:{total,porNivel,porEstrategia,porNivelEstrategia}}
  // porNivelEstrategia é o cruzamento nível x estratégia (aditivo, não muda o shape de
  // porNivel/porEstrategia já existentes) — alimenta o filtro de Estratégia na Mensal Sales
  // sem quebrar quem já lê porNivel/porEstrategia direto (Semanal Sales, Semanal Área).
  const out = {};
  for (const k in cells) {
    const [mk, b, e] = k.split('|');
    if (!out[mk]) out[mk] = { total: blankM(), porNivel: {}, porEstrategia: {}, porNivelEstrategia: {} };
    const cell = cells[k];
    addM(out[mk].total, cell);
    if (!out[mk].porNivel[b]) out[mk].porNivel[b] = blankM();
    addM(out[mk].porNivel[b], cell);
    if (!out[mk].porEstrategia[e]) out[mk].porEstrategia[e] = blankM();
    addM(out[mk].porEstrategia[e], cell);
    if (!out[mk].porNivelEstrategia[b]) out[mk].porNivelEstrategia[b] = {};
    if (!out[mk].porNivelEstrategia[b][e]) out[mk].porNivelEstrategia[b][e] = blankM();
    addM(out[mk].porNivelEstrategia[b][e], cell);
  }
  return out;
}
const actualCells = {};
function mergeInto(dst, src) { for (const k in src) { if (!dst[k]) dst[k] = blankM(); addM(dst[k], src[k]); } }
mergeInto(actualCells, finCell);
mergeInto(actualCells, funCell);
const actualMensal = buildMensal(actualCells);

function roundM(o) { METRICS.forEach(m => o[m] = Math.round(o[m])); return o; }
for (const mk in actualMensal) {
  roundM(actualMensal[mk].total);
  for (const b in actualMensal[mk].porNivel) roundM(actualMensal[mk].porNivel[b]);
  for (const e in actualMensal[mk].porEstrategia) roundM(actualMensal[mk].porEstrategia[e]);
  for (const b in actualMensal[mk].porNivelEstrategia)
    for (const e in actualMensal[mk].porNivelEstrategia[b]) roundM(actualMensal[mk].porNivelEstrategia[b][e]);
}

// ---------- BUDGET / REFORECAST ----------
function buildRef(name, estCol, nivCol) {
  const rows = readCsv(name);
  const cells = {};
  for (const r of rows) {
    const mk = mesBr(r.Data); const e = estr(r[estCol] || r.Estrategia || r['Estratégia']);
    const b = (r[nivCol] || r.Nivel || r['Nível'] || '').trim(); if (!b) continue; // pula linhas sem nivel
    const k = mk + '|' + b + '|' + e;
    cells[k] = {
      contacted: money(r.Contacted), connected: money(r.Connected), opps: money(r.Opps),
      sql: money(r.SQL), cw: money(r.CW), activation: money(r.Activation), sap: money(r.SAP),
      gmv: money(r.GMV), receita: money(r['Net Revenue'])
    };
  }
  return buildMensal(cells);
}
const budgetMensal = buildRef('budget_oficial.csv', 'Estrategia', 'Nivel');
const reforecastMensal = buildRef('reforecast_oficial.csv', 'Estratégia', 'Nível');

// ---------- BUDGET / REFORECAST DIÁRIO (meta real por semana) ----------
// f_budget_daily/f_reforecast_daily: 1 linha por dia × nível × estratégia × pessoa (SDR/
// Closer/Onboarding), já rateada — somar as colunas "_Dia" de TODAS as linhas de uma mesma
// semana reconstrói a meta da semana (validado: soma do mês bate com f_goals.* dentro de
// ~0,02%). Ano+Semana_Ano já seguem a MESMA regra de ano_semana usada no resto do projeto
// (semana 1 parcial + segunda-feira em diante), então não precisa parsear a data por extenso.
function buildDailySemanal(name) {
  const rows = readCsv(name);
  const cells = {};
  for (const r of rows) {
    const niv = (r['f_goals.Nivel'] || '').trim(); if (!niv) continue;
    const est = estr(r['f_goals.Estrategia']); if (!est) continue;
    const wk = r.Ano + '-W' + String(+r.Semana_Ano).padStart(2, '0');
    const k = wk + '|' + niv + '|' + est;
    if (!cells[k]) cells[k] = blankM();
    cells[k].contacted += numBr(r.Contacted_Dia);
    cells[k].connected += numBr(r.Connected_Dia);
    cells[k].opps += numBr(r.Opps_Dia);
    cells[k].sql += numBr(r.SQL_Dia);
    cells[k].cw += numBr(r.CW_Dia);
    cells[k].activation += numBr(r.Activation_Dia);
    cells[k].sap += numBr(r.SAP_Dia);
    cells[k].gmv += numBr(r.GMV_Dia);
    cells[k].receita += numBr(r.Net_Revenue_Dia);
  }
  return buildMensal(cells); // genérico o bastante pra reaproveitar (chave semana em vez de mês)
}
const budgetSemanal = buildDailySemanal('f_budget_daily.csv');
const reforecastSemanal = buildDailySemanal('f_reforecast_daily.csv');

// actual.semanal — mesma estrutura {total,porNivel,porEstrategia} do actual.mensal, só que
// por semana (reaproveita buildMensal, que não sabe/não liga se a chave é mês ou semana).
const actualCellsSemanal = {};
mergeInto(actualCellsSemanal, finCellSemanal);
mergeInto(actualCellsSemanal, funCellSemanal);
const actualSemanal = buildMensal(actualCellsSemanal);
for (const w in actualSemanal) {
  roundM(actualSemanal[w].total);
  for (const b in actualSemanal[w].porNivel) roundM(actualSemanal[w].porNivel[b]);
  for (const e in actualSemanal[w].porEstrategia) roundM(actualSemanal[w].porEstrategia[e]);
}
const semanas = [...new Set([...Object.keys(actualSemanal), ...Object.keys(budgetSemanal), ...Object.keys(reforecastSemanal)])].sort();

// semana -> mês (chave 'YYYY-MM'), usado pelo filtro em cascata Mês → Semana no dashboard.
// Mês de uma semana = mês da SEGUNDA-FEIRA que abre a semana (ou 01/jan pra semana 1 parcial).
function weekStartUTC(weekKey) {
  const [ys, ws] = weekKey.split('-W');
  const year = +ys, w = +ws;
  if (w === 1) return new Date(Date.UTC(year, 0, 1));
  const fm = firstMondayUTC(year);
  const d = new Date(fm); d.setUTCDate(d.getUTCDate() + (w - 2) * 7);
  return d;
}
const semanaMes = {};
for (const w of semanas) semanaMes[w] = weekStartUTC(w).toISOString().slice(0, 7);

// fte por semana (mesma coisa que "fte" acima, só que por semana, pro filtro de Semanal Área)
const fteSemanal = {};
for (const w in fteByWeek) {
  fteSemanal[w] = ESTRS.filter(e => fteByWeek[w][e]).map(e => ({
    estrategia: e, fte: fteByWeek[w][e].sdrs.size,
    contacted: Math.round(fteByWeek[w][e].contacted), opps: Math.round(fteByWeek[w][e].opps)
  }));
}

// ---------- ESTOQUE DO FUNIL SDR (snapshot no FIM de cada semana) ----------
// Diferente das contagens de throughput acima (que contam cada estágio na semana da SUA
// data): aqui é ESTOQUE — quantos leads estavam PARADOS em cada estágio no último dia de
// cada semana. Um lead está "em contacted" no fim da semana W se foi contatado até o fim de
// W e ainda NÃO avançou (connected/nurturing) nem saiu do funil de SDR (virou opp/qualificado
// ou foi desqualificado) até o fim de W. Mesma lógica, mais fundo, para connected e nurturing.
// Só datas são lidas por nome (contacted/connected/nurturing/qualified/unqualified/opp) —
// nenhuma PII entra no app_data.js, só contagens semanais agregadas.
function weekEndUTC(weekKey) {
  const [ys, ws] = weekKey.split('-W'); const year = +ys, w = +ws;
  if (w === 1) { const d = firstMondayUTC(year); d.setUTCDate(d.getUTCDate() - 1); return d; } // véspera da 1ª segunda
  const d = weekStartUTC(weekKey); d.setUTCDate(d.getUTCDate() + 6); return d;                  // domingo
}
const sdrLeads = fop.map(r => ({
  estr: estr(r.sales_strategy),
  contacted: cleanDate(r.contacted_date), connected: cleanDate(r.connected_date),
  nurturing: cleanDate(r.nurturing_date), qualified: cleanDate(r.qualified_date),
  unqualified: cleanDate(r.unqualified_date), opp: cleanDate(r.opportunity_create_date),
})).filter(l => l.contacted); // só quem chegou a contacted pode estar no estoque de SDR
const hojeStr = new Date().toISOString().slice(0, 10);
const ESTOQUE_KEYS = ['all', ...ESTRS];
const sdrEstoque = {}; ESTOQUE_KEYS.forEach(k => sdrEstoque[k] = []); // estr -> [{semana,contacted,connected,nurturing}]
for (const w of semanas) {
  const startStr = weekStartUTC(w).toISOString().slice(0, 10);
  if (startStr > hojeStr) continue;              // semana totalmente no futuro (só budget as tem)
  let T = weekEndUTC(w).toISOString().slice(0, 10);
  if (T > hojeStr) T = hojeStr;                  // semana EM CURSO: snapshot até hoje
  const acc = {}; ESTOQUE_KEYS.forEach(k => acc[k] = { contacted: 0, connected: 0, nurturing: 0 });
  for (const l of sdrLeads) {
    if (l.contacted > T) continue;                                  // ainda não contatado até T
    if ((l.opp && l.opp <= T) || (l.qualified && l.qualified <= T) || (l.unqualified && l.unqualified <= T)) continue; // saiu do funil SDR
    let best = l.contacted, stage = 'contacted';                    // etapa SDR mais recente até T
    if (l.connected && l.connected <= T && l.connected >= best) { best = l.connected; stage = 'connected'; }
    if (l.nurturing && l.nurturing <= T && l.nurturing >= best) { best = l.nurturing; stage = 'nurturing'; }
    acc.all[stage]++;
    if (l.estr) acc[l.estr][stage]++;
  }
  ESTOQUE_KEYS.forEach(k => sdrEstoque[k].push({ semana: w, ...acc[k] }));
}
// SDRs distintos que geraram opp por semana (por estratégia) — denominador do "Opps / FTE"
const sdrOppFte = { all: {}, Outbound: {}, Inbound: {}, Hunting: {} };
for (const k of ESTOQUE_KEYS) for (const w in sdrOppFteSet[k]) sdrOppFte[k][w] = sdrOppFteSet[k][w].size;
const sdrContactFte = { all: {}, Outbound: {}, Inbound: {}, Hunting: {} };
for (const k of ESTOQUE_KEYS) for (const w in sdrContactFteSet[k]) sdrContactFte[k][w] = sdrContactFteSet[k][w].size;
// opps por nível × semana (por estratégia) — alimenta os pequenos múltiplos de 4 semanas do SDR
const sdrOppsNivel = { all: {}, Outbound: {}, Inbound: {}, Hunting: {} };
for (const key in funCellSemanal) {
  const [w, b, e] = key.split('|');
  const v = funCellSemanal[key].opps || 0; if (!v || !NIVEIS.includes(b)) continue;
  (sdrOppsNivel.all[w] = sdrOppsNivel.all[w] || {})[b] = (sdrOppsNivel.all[w][b] || 0) + v;
  if (sdrOppsNivel[e]) (sdrOppsNivel[e][w] = sdrOppsNivel[e][w] || {})[b] = (sdrOppsNivel[e][w][b] || 0) + v;
}

// ---------- CICLO (médias simples por lead, direto do unpivot acima) ----------
const avg = arr => arr.length ? +(arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(1) : null;
const ciclo = {
  dias_contato_conectado: avg(cicloAcc.dias_contato_conectado),
  dias_conectado_opp: avg(cicloAcc.dias_conectado_opp),
  dias_opp_sql: avg(cicloAcc.dias_opp_sql),
  dias_sql_won: avg(cicloAcc.dias_sql_won),
  dias_won_ativacao: avg(cicloAcc.dias_won_ativacao),
};

// ---------- RANKING (closer/owner, direto do unpivot acima) ----------
const ranking = {
  closers: Object.values(rankCw).sort((a, b) => b.cw - a.cw).slice(0, 12),
  owners: Object.values(rankOwner).sort((a, b) => b.cw - a.cw).slice(0, 12),
  sdrs: null,
};

// ---------- DIRETÓRIO DE PESSOAS (nome + foto, opcional) ----------
// Planilha mantida à mão (Dados/Imagens Sales.csv, separador ",") — se faltar, nome/foto
// ficam null e a interface cai de volta pro prefixo do e-mail (sem foto).
const fimg = readCsvOptional('Imagens Sales.csv', ',');
const diretorio = {};
for (const r of fimg) {
  const email = cleanEmail(r.Email); if (!email) continue;
  diretorio[email.toLowerCase()] = {
    nome: (r['Nome Completo'] || r.Nome || '').trim() || null,
    foto: (r.Image || '').trim() || null,
    ativo: (r.Ativo || '').trim().toLowerCase() === 'sim',
  };
}
function enrichPessoa(p) {
  const d = diretorio[p.email.toLowerCase()];
  p.nome = d?.nome || null;
  p.foto = d?.foto || null;
  p.ativo = d?.ativo === true; // só "Sim" na planilha conta como ativo (sem match = inativo)
  return p;
}

// porSemana por pessoa: mesmas métricas do total, só que uma célula por semana — alimenta
// a Semanal Área quando o usuário filtra por uma semana específica em vez do acumulado.
function buildPessoaSemanaSdr(p) {
  const out = {};
  for (const w in (p.porSemana || {})) {
    const pw = p.porSemana[w];
    out[w] = {
      contacted: Math.round(pw.contacted || 0), connected: Math.round(pw.connected || 0), opps: Math.round(pw.opps || 0),
      contactRate: pw.contacted ? +(pw.connected / pw.contacted).toFixed(3) : null,
      oppNivel: NIVEIS.map(n => Math.round((pw.oppNivel || {})[n] || 0)),
      diasContatoConectado: pw.dCCn ? +(pw.dCCsum / pw.dCCn).toFixed(1) : null,
    };
  }
  return out;
}
function buildPessoaSemanaCloser(p) {
  const out = {};
  for (const w in (p.porSemana || {})) {
    const pw = p.porSemana[w];
    out[w] = {
      opps: Math.round(pw.opps || 0), sql: Math.round(pw.sql || 0), cw: Math.round(pw.cw || 0),
      sqlRate: pw.opps ? +(pw.sql / pw.opps).toFixed(3) : null,
      winRate: pw.sql ? +(pw.cw / pw.sql).toFixed(3) : null,
      cwNivel: NIVEIS.map(n => Math.round((pw.cwNivel || {})[n] || 0)),
      diasOppSql: pw.dOSn ? +(pw.dOSsum / pw.dOSn).toFixed(1) : null,
      diasSqlWon: pw.dSWn ? +(pw.dSWsum / pw.dSWn).toFixed(1) : null,
    };
  }
  return out;
}
function buildPessoaSemanaOnb(p) {
  const out = {};
  for (const w in (p.porSemana || {})) {
    const pw = p.porSemana[w];
    out[w] = {
      cwIn: Math.round(pw.cwIn || 0), activated: Math.round(pw.activated || 0),
      actRate: pw.cwIn ? +(pw.activated / pw.cwIn).toFixed(3) : null,
      actNivel: NIVEIS.map(n => Math.round((pw.actNivel || {})[n] || 0)),
      diasWonAtivacao: pw.dWAn ? +(pw.dWAsum / pw.dWAn).toFixed(1) : null,
    };
  }
  return out;
}

// ---------- PESSOAS (SDR / Closer / Onboarding) ----------
const sdrList = Object.values(porPessoaSdr).map(p => enrichPessoa({
  email: p.email, estrategia: p.estrategia || null,
  contacted: Math.round(p.contacted || 0), connected: Math.round(p.connected || 0), opps: Math.round(p.opps || 0),
  contactRate: p.contacted ? +(p.connected / p.contacted).toFixed(3) : null,
  diasContatoConectado: p._dCCn ? +(p._dCCsum / p._dCCn).toFixed(1) : null,
  oppNivel: NIVEIS.map(n => Math.round((p.oppNivel || {})[n] || 0)),
  metricaSemanal: 'opps', semanal: last4Weekly(p.semanal, semanas),
  porSemana: buildPessoaSemanaSdr(p),
})).sort((a, b) => b.opps - a.opps);

const closerList = Object.values(porPessoaCloser).map(p => enrichPessoa({
  email: p.email,
  opps: Math.round(p.opps || 0), sql: Math.round(p.sql || 0), cw: Math.round(p.cw || 0),
  sqlRate: p.opps ? +(p.sql / p.opps).toFixed(3) : null,
  winRate: p.sql ? +(p.cw / p.sql).toFixed(3) : null,
  diasOppSql: p._dOSn ? +(p._dOSsum / p._dOSn).toFixed(1) : null,
  diasSqlWon: p._dSWn ? +(p._dSWsum / p._dSWn).toFixed(1) : null,
  cwNivel: NIVEIS.map(n => Math.round((p.cwNivel || {})[n] || 0)),
  metricaSemanal: 'cw', semanal: last4Weekly(p.semanal, semanas),
  porSemana: buildPessoaSemanaCloser(p),
})).sort((a, b) => b.cw - a.cw);

const onbList = Object.values(porPessoaOnb).map(p => enrichPessoa({
  email: p.email,
  cwIn: Math.round(p.cwIn || 0), activated: Math.round(p.activated || 0),
  actRate: p.cwIn ? +(p.activated / p.cwIn).toFixed(3) : null,
  diasWonAtivacao: p._dWAn ? +(p._dWAsum / p._dWAn).toFixed(1) : null,
  actNivel: NIVEIS.map(n => Math.round((p.actNivel || {})[n] || 0)),
  metricaSemanal: 'activated', semanal: last4Weekly(p.semanal, semanas),
  porSemana: buildPessoaSemanaOnb(p),
})).sort((a, b) => b.activated - a.activated);

// ---------- SÉRIES SEMANAIS POR NÍVEL (direto do unpivot acima) ----------
function roundNivelWeek(obj) {
  const out = {};
  for (const w in obj) { out[w] = {}; NIVEIS.forEach(n => out[w][n] = Math.round(obj[w][n] || 0)); }
  return out;
}
const semanalPorNivel = {
  contacted: roundNivelWeek(semContactedNivel),
  opps: roundNivelWeek(semOppNivel),
  cw: roundNivelWeek(semCwNivel),
  activation: roundNivelWeek(semActNivel),
};

// ---------- FTEs por estratégia (produtividade) ----------
const fte = ESTRS.filter(e => fteBy[e]).map(e => ({
  estrategia: e, fte: fteBy[e].sdrs.size,
  contacted: Math.round(fteBy[e].contacted), opps: Math.round(fteBy[e].opps)
}));

// ---------- MÊS FECHADO (para a aba Mensal Sales) ----------
const mesesComActual = Object.keys(actualMensal).sort();
const curMonthKey = new Date().toISOString().slice(0, 7);
let closedIdx = mesesComActual.length - 1;
if (mesesComActual[closedIdx] === curMonthKey) closedIdx--;
const mesFechado = {
  mes: mesesComActual[closedIdx] || null,
  mesAnterior: mesesComActual[closedIdx - 1] || null,
};

// ---------- OUTPUT ----------
const meses = [...new Set([...Object.keys(actualMensal), ...Object.keys(budgetMensal), ...Object.keys(reforecastMensal)])].sort();
const DATA = {
  geradoEm: new Date().toISOString().slice(0, 10),
  meses, semanas, semanaMes, niveis: NIVEIS, estrategias: ESTRS,
  actual: { mensal: actualMensal, semanal: actualSemanal },
  budget: { mensal: budgetMensal, semanal: budgetSemanal },
  reforecast: { mensal: reforecastMensal, semanal: reforecastSemanal },
  ciclo, ranking,
  porPessoa: { sdr: sdrList, closer: closerList, onboarding: onbList },
  semanalPorNivel,
  fte, fteSemanal,
  sdrEstoque, sdrCohort, sdrUnq, sdrOppsNivel, sdrOppFte, sdrCohortStatus, sdrContactFte,
  mesFechado,
};
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outDir + 'app_data.js', 'window.DATA = ' + JSON.stringify(DATA) + ';');
console.log('OK app_data.js — meses:', meses.length, '| semanas:', semanas.length, '| leads (operacional_raw):', fop.length);
console.log('ultimo mes actual:', Object.keys(actualMensal).sort().pop());
console.log('mes fechado:', mesFechado.mes, '(anterior:', mesFechado.mesAnterior + ')');
console.log('pessoas — sdr:', sdrList.length, '| closer:', closerList.length, '| onboarding:', onbList.length);
const comFoto = [...sdrList, ...closerList, ...onbList].filter(p => p.foto).length;
console.log('diretório (Imagens Sales.csv):', fimg.length, 'linhas | pessoas com foto casada:', comFoto);
console.log('exemplo 2026-06 total:', JSON.stringify(actualMensal['2026-06']?.total));
console.log('budget 2026-06 total:', JSON.stringify(budgetMensal['2026-06']?.total));
console.log('ciclo:', JSON.stringify(ciclo));
console.log('top closer:', JSON.stringify(ranking.closers[0]));
console.log('estoque SDR all (últ. semana):', JSON.stringify(sdrEstoque.all[sdrEstoque.all.length - 1]), '| pontos:', sdrEstoque.all.length);
