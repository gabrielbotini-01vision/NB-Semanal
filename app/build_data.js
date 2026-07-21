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
};
const missing = Object.keys(REQUIRED).filter(f => !fs.existsSync(DIR + f));
if (missing.length) {
  console.error('Faltam arquivos obrigatórios em Dados/:');
  missing.forEach(f => console.error('  - ' + f + (REQUIRED[f] ? '  (rode Querys/' + REQUIRED[f] + ' no Redshift e exporte com esse nome, separador ";")' : '  (planilha de budget/reforecast mantida à mão)')));
  console.error('\nVeja Dados/README.md para o contrato de cada arquivo.');
  process.exit(1);
}

// Alguns exports (o SELECT * do operacional, principalmente) têm campos de texto livre
// (motivo de perda, detalhes, notas) com quebra de linha LITERAL embutida, sem nenhuma aspa
// ou escape ao redor — não é um CSV "de verdade" nesse sentido. Um split de linha ingênuo
// (raw.split('\n')) parte uma linha lógica em várias linhas físicas e desalinha tudo dali
// pra frente. Reconstituímos a linha real juntando fragmentos até bater a contagem de
// colunas do cabeçalho (a quebra de linha embutida vira '\n' dentro do campo de texto).
function readCsv(name, delim) {
  delim = delim || ';';
  const raw = fs.readFileSync(DIR + name, 'utf8').replace(/^﻿/, '');
  const physLines = raw.split(/\r?\n/);
  while (physLines.length && physLines[physLines.length - 1] === '') physLines.pop();
  const head = physLines[0].split(delim).map(h => h.trim());
  const H = head.length;
  const rows = [];
  let buf = null;
  let descartadas = 0;
  for (let i = 1; i < physLines.length; i++) {
    const fields = physLines[i].split(delim);
    if (buf === null) buf = fields;
    else { buf[buf.length - 1] += '\n' + fields[0]; buf = buf.concat(fields.slice(1)); }
    if (buf.length >= H) { rows.push(buf.slice(0, H)); buf = null; }
  }
  if (buf !== null) descartadas++; // sobrou fragmento incompleto no fim do arquivo
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
function last4Weekly(semanalObj, allWeeks) {
  const ws = allWeeks.filter(w => semanalObj && semanalObj[w] != null).sort().slice(-4);
  return ws.map(w => ({ semana: w, valor: Math.round(semanalObj[w]) }));
}

// ---------- ACTUAL: 01 (receita/gmv/sap) ----------
// Ainda pré-agregada por semana no SQL — a versão granular (financeira_raw.csv, via
// Parquet + DuckDB-Wasm) entra numa etapa seguinte; por ora este arquivo não muda.
const f01 = readCsv('01_receita_semana_nivel_estrategia.csv');
const finCell = {};   // key mes|nivelbucket|estr
const semanaFin = {}; // ano_semana -> {receita,gmv}
for (const r of f01) {
  const mk = mesKey(r.mes), b = bucket(r.nivel), e = estr(r.estrategia);
  const k = mk + '|' + b + '|' + e;
  if (!finCell[k]) finCell[k] = { receita: 0, gmv: 0, sap: 0 };
  finCell[k].receita += num(r.receita_net_brl_sales);
  finCell[k].gmv += num(r.gmv_brl_sales);
  finCell[k].sap = Math.max(finCell[k].sap, +r.sap_mensal || 0); // max MTD = sap do mês por celula
  const w = r.ano_semana;
  if (!semanaFin[w]) semanaFin[w] = { receita: 0, gmv: 0 };
  semanaFin[w].receita += num(r.receita_net_brl_sales);
  semanaFin[w].gmv += num(r.gmv_brl_sales);
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
const semanaFun = {}; // ano_semana -> {contacted,cw,...}
const semContactedNivel = {}, semOppNivel = {}, semCwNivel = {}, semActNivel = {};
const porPessoaSdr = {}, porPessoaCloser = {}, porPessoaOnb = {};
const rankCw = {}, rankOwner = {};
const fteBy = {};
const cicloAcc = { dias_contato_conectado: [], dias_conectado_opp: [], dias_opp_sql: [], dias_sql_won: [], dias_won_ativacao: [] };

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
  if (dCC != null && sdr) { const p = getP(porPessoaSdr, sdr); p._dCCsum = (p._dCCsum || 0) + dCC; p._dCCn = (p._dCCn || 0) + 1; }
  if (dOS != null && closer) { const p = getP(porPessoaCloser, closer); p._dOSsum = (p._dOSsum || 0) + dOS; p._dOSn = (p._dOSn || 0) + 1; }
  if (dSW != null && closer) { const p = getP(porPessoaCloser, closer); p._dSWsum = (p._dSWsum || 0) + dSW; p._dSWn = (p._dSWn || 0) + 1; }
  if (dWA != null && onb) { const p = getP(porPessoaOnb, onb); p._dWAsum = (p._dWAsum || 0) + dWA; p._dWAn = (p._dWAn || 0) + 1; }

  for (const [col, key] of STAGES) {
    const dateStr = dates[col];
    if (!dateStr || dateStr < CUTOFF) continue;
    const mk = dateStr.slice(0, 7), w = anoSemana(dateStr);

    const ck = mk + '|' + b + '|' + e;
    if (!funCell[ck]) funCell[ck] = { contacted: 0, connected: 0, opps: 0, sql: 0, cw: 0, activation: 0 };
    funCell[ck][key] += 1;
    if (!semanaFun[w]) semanaFun[w] = { contacted: 0, connected: 0, opps: 0, sql: 0, cw: 0, activation: 0 };
    semanaFun[w][key] += 1;

    if (key === 'contacted') {
      (semContactedNivel[w] = semContactedNivel[w] || {})[b] = (semContactedNivel[w][b] || 0) + 1;
      if (sdr) { const p = getP(porPessoaSdr, sdr); p.contacted = (p.contacted || 0) + 1; p.estrategia = e || p.estrategia; }
      if (e) fteBy[e].contacted += 1;
    }
    if (key === 'connected' && sdr) { const p = getP(porPessoaSdr, sdr); p.connected = (p.connected || 0) + 1; }
    if (key === 'opps') {
      (semOppNivel[w] = semOppNivel[w] || {})[b] = (semOppNivel[w][b] || 0) + 1;
      if (sdr) {
        const p = getP(porPessoaSdr, sdr);
        p.opps = (p.opps || 0) + 1;
        p.oppNivel = p.oppNivel || {}; p.oppNivel[b] = (p.oppNivel[b] || 0) + 1;
        p.semanal = p.semanal || {}; p.semanal[w] = (p.semanal[w] || 0) + 1;
      }
      if (closer) { const p = getP(porPessoaCloser, closer); p.opps = (p.opps || 0) + 1; }
      if (e) fteBy[e].opps += 1;
    }
    if (key === 'sql' && closer) { const p = getP(porPessoaCloser, closer); p.sql = (p.sql || 0) + 1; }
    if (key === 'cw') {
      (semCwNivel[w] = semCwNivel[w] || {})[b] = (semCwNivel[w][b] || 0) + 1;
      if (closer) {
        const p = getP(porPessoaCloser, closer);
        p.cw = (p.cw || 0) + 1;
        p.cwNivel = p.cwNivel || {}; p.cwNivel[b] = (p.cwNivel[b] || 0) + 1;
        p.semanal = p.semanal || {}; p.semanal[w] = (p.semanal[w] || 0) + 1;
        rankCw[closer] = rankCw[closer] || { email: closer, cw: 0, ativados: 0 }; rankCw[closer].cw += 1;
      }
      if (onb) { const p = getP(porPessoaOnb, onb); p.cwIn = (p.cwIn || 0) + 1; }
      if (owner) { rankOwner[owner] = rankOwner[owner] || { email: owner, cw: 0, ativados: 0 }; rankOwner[owner].cw += 1; }
    }
    if (key === 'activation') {
      (semActNivel[w] = semActNivel[w] || {})[b] = (semActNivel[w][b] || 0) + 1;
      if (onb) {
        const p = getP(porPessoaOnb, onb);
        p.activated = (p.activated || 0) + 1;
        p.actNivel = p.actNivel || {}; p.actNivel[b] = (p.actNivel[b] || 0) + 1;
        p.semanal = p.semanal || {}; p.semanal[w] = (p.semanal[w] || 0) + 1;
      }
      if (closer) { rankCw[closer] = rankCw[closer] || { email: closer, cw: 0, ativados: 0 }; rankCw[closer].ativados += 1; }
      if (owner) { rankOwner[owner] = rankOwner[owner] || { email: owner, cw: 0, ativados: 0 }; rankOwner[owner].ativados += 1; }
    }
  }
}

// montar actual.mensal
function buildMensal(cells) {
  // cells: key mes|nivel|estr -> partial metrics; retorna {mes:{total,porNivel,porEstrategia}}
  const out = {};
  for (const k in cells) {
    const [mk, b, e] = k.split('|');
    if (!out[mk]) out[mk] = { total: blankM(), porNivel: {}, porEstrategia: {} };
    const cell = cells[k];
    addM(out[mk].total, cell);
    if (!out[mk].porNivel[b]) out[mk].porNivel[b] = blankM();
    addM(out[mk].porNivel[b], cell);
    if (!out[mk].porEstrategia[e]) out[mk].porEstrategia[e] = blankM();
    addM(out[mk].porEstrategia[e], cell);
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
}

// semanal (trend) — cw agora vem do próprio unpivot (semanaFun), sempre completo
const semanas = [...new Set([...Object.keys(semanaFin), ...Object.keys(semanaFun)])].sort();
const actualSemanal = {};
for (const w of semanas) {
  actualSemanal[w] = {
    receita: Math.round((semanaFin[w] || {}).receita || 0),
    gmv: Math.round((semanaFin[w] || {}).gmv || 0),
    cw: (semanaFun[w] || {}).cw || 0,
    contacted: (semanaFun[w] || {}).contacted || 0,
    opps: (semanaFun[w] || {}).opps || 0
  };
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
  };
}
function enrichPessoa(p) {
  const d = diretorio[p.email.toLowerCase()];
  p.nome = d?.nome || null;
  p.foto = d?.foto || null;
  return p;
}

// ---------- PESSOAS (SDR / Closer / Onboarding) ----------
const sdrList = Object.values(porPessoaSdr).map(p => enrichPessoa({
  email: p.email, estrategia: p.estrategia || null,
  contacted: Math.round(p.contacted || 0), connected: Math.round(p.connected || 0), opps: Math.round(p.opps || 0),
  contactRate: p.contacted ? +(p.connected / p.contacted).toFixed(3) : null,
  diasContatoConectado: p._dCCn ? +(p._dCCsum / p._dCCn).toFixed(1) : null,
  oppNivel: NIVEIS.map(n => Math.round((p.oppNivel || {})[n] || 0)),
  metricaSemanal: 'opps', semanal: last4Weekly(p.semanal, semanas),
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
})).sort((a, b) => b.cw - a.cw);

const onbList = Object.values(porPessoaOnb).map(p => enrichPessoa({
  email: p.email,
  cwIn: Math.round(p.cwIn || 0), activated: Math.round(p.activated || 0),
  actRate: p.cwIn ? +(p.activated / p.cwIn).toFixed(3) : null,
  diasWonAtivacao: p._dWAn ? +(p._dWAsum / p._dWAn).toFixed(1) : null,
  actNivel: NIVEIS.map(n => Math.round((p.actNivel || {})[n] || 0)),
  metricaSemanal: 'activated', semanal: last4Weekly(p.semanal, semanas),
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
  meses, semanas, niveis: NIVEIS, estrategias: ESTRS,
  actual: { mensal: actualMensal, semanal: actualSemanal },
  budget: { mensal: budgetMensal },
  reforecast: { mensal: reforecastMensal },
  ciclo, ranking,
  porPessoa: { sdr: sdrList, closer: closerList, onboarding: onbList },
  semanalPorNivel,
  fte,
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
