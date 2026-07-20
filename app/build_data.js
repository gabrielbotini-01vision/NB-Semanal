const fs = require('fs');
const path = require('path');
const DIR = path.join(__dirname, '..', 'Dados') + path.sep;
const outDir = __dirname + path.sep;

// ---------- checagem de arquivos obrigatórios ----------
const REQUIRED = {
  '01_receita_semana_nivel_estrategia.csv': '01_receita_semana_nivel_estrategia.sql',
  '02_safra_contacted.csv': '02_safra_contacted.sql',
  '03_safra_opportunity.csv': '03_safra_opportunity.sql',
  '04_safra_closed_won.csv': '04_safra_closed_won.sql',
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

function readCsv(name) {
  const raw = fs.readFileSync(DIR + name, 'utf8').replace(/^﻿/, '').trim();
  const lines = raw.split(/\r?\n/);
  const head = lines[0].split(';');
  return lines.slice(1).map(l => {
    const c = l.split(';'); const o = {};
    head.forEach((h, i) => o[h.trim()] = c[i]);
    return o;
  });
}
// 05_produtividade.csv é opcional: se faltar, o funil mensal/semanal completo
// (Contatado/Conectado/Opp/SQL/CW/Ativação por mês+nível+estratégia) fica vazio
// em vez de derrubar o build — o app já sinaliza "dado parcial" nesse caso.
function readCsvOptional(name) {
  try { return readCsv(name); }
  catch (e) {
    if (e.code === 'ENOENT') {
      console.warn('[aviso] ' + name + ' não encontrado em Dados/ — funil mensal/semanal completo ficará vazio até reexportar via Querys/05_produtividade.sql.');
      return [];
    }
    throw e;
  }
}

const mesKey = d => d ? d.slice(0, 7) : null;            // '2025-01-01' -> '2025-01'
const mesBr  = d => { const [dd, mm, yy] = d.split('/'); return yy + '-' + mm; }; // '01/02/2026'->'2026-02'
const bucket = n => { n = (n || '').replace('N', ''); const x = +n;
  if (x === 2 || x === 3) return 'N2-N3'; if (x === 4 || x === 5) return 'N4-N5'; if (x >= 6) return 'N6+'; return 'Sem nivel'; };
const estr = s => ({ OUTBOUND: 'Outbound', INBOUND: 'Inbound', HUNTING: 'Hunting' }[(s || '').toUpperCase()] || s);
const money = s => parseInt(String(s).replace(/[^\d]/g, ''), 10) || 0;  // 'R$ 1.234.567' -> 1234567
const num = s => { const v = parseFloat(s); return isFinite(v) ? v : 0; };

const NIVEIS = ['N2-N3', 'N4-N5', 'N6+'];
const ESTRS = ['Outbound', 'Inbound', 'Hunting'];
const METRICS = ['contacted', 'connected', 'opps', 'sql', 'cw', 'activation', 'sap', 'gmv', 'receita'];
function blankM() { const o = {}; METRICS.forEach(m => o[m] = 0); return o; }
function addM(a, b) { METRICS.forEach(m => a[m] += b[m] || 0); return a; }

// ---------- ACTUAL: 01 (receita/gmv/sap) ----------
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

// ---------- ACTUAL: 02/03/04 (safras — usadas no funil mensal só como fallback,
//            fonte oficial do funil mensal continua sendo 05 quando disponível) ----------
const f02 = readCsv('02_safra_contacted.csv');
const f03 = readCsv('03_safra_opportunity.csv');
const f04 = readCsv('04_safra_closed_won.csv');

// ---------- ACTUAL: 05 (funil por etapa, opcional) ----------
const f05 = readCsvOptional('05_produtividade.csv');
const etapaMap = { 'Contatado': 'contacted', 'Conectado': 'connected', 'Opp': 'opps', 'SQL': 'sql', 'CW': 'cw', 'Ativado 10k': 'activation' };
const funCell = {}; // mes|nivelbucket|estr -> {contacted,...}
const semanaFun = {}; // ano_semana -> {contacted,cw,...}
for (const r of f05) {
  const key = etapaMap[r.etapa]; if (!key) continue;
  const mk = mesKey(r.mes), b = bucket(r.nivel), e = estr(r.estrategia), q = +r.qtd || 0;
  const k = mk + '|' + b + '|' + e;
  if (!funCell[k]) funCell[k] = { contacted: 0, connected: 0, opps: 0, sql: 0, cw: 0, activation: 0 };
  funCell[k][key] += q;
  const w = r.ano_semana;
  if (!semanaFun[w]) semanaFun[w] = { contacted: 0, connected: 0, opps: 0, sql: 0, cw: 0, activation: 0 };
  semanaFun[w][key] += q;
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

// semanal CW do 04 (completo até 2026-W28) — trend robusto mesmo com 01/05 truncados
const semanaCW = {};
for (const r of f04) { const w = r.ano_semana; semanaCW[w] = (semanaCW[w] || 0) + (+r.ganhos || 0); }

// semanal (trend)
const semanas = [...new Set([...Object.keys(semanaFin), ...Object.keys(semanaFun), ...Object.keys(semanaCW)])].sort();
const actualSemanal = {};
for (const w of semanas) {
  actualSemanal[w] = {
    receita: Math.round((semanaFin[w] || {}).receita || 0),
    gmv: Math.round((semanaFin[w] || {}).gmv || 0),
    cw: semanaCW[w] || 0,
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

// ---------- CICLO (de 02, médias ponderadas por denominador) ----------
const wsum = {}, wden = {};
const CIC = [['dias_contato_conectado', 'conectados'], ['dias_conectado_opp', 'oportunidades'],
  ['dias_opp_sql', 'sqls'], ['dias_sql_won', 'ganhos'], ['dias_won_ativacao', 'ativados_10k']];
for (const r of f02) {
  for (const [dcol, wcol] of CIC) {
    const d = parseFloat(r[dcol]); const w = +r[wcol] || 0;
    if (isFinite(d) && w > 0) { wsum[dcol] = (wsum[dcol] || 0) + d * w; wden[dcol] = (wden[dcol] || 0) + w; }
  }
}
const ciclo = {};
for (const [dcol] of CIC) ciclo[dcol] = wden[dcol] ? +(wsum[dcol] / wden[dcol]).toFixed(1) : null;

// ---------- RANKING (de 04 safra CW: por closer/owner) ----------
function rank(col) {
  const m = {};
  for (const r of f04) {
    const p = r[col]; if (!p) continue;
    if (!m[p]) m[p] = { email: p, cw: 0, ativados: 0 };
    m[p].cw += +r.ganhos || 0; m[p].ativados += +r.ativados_10k || 0;
  }
  return Object.values(m).sort((a, b) => b.cw - a.cw).slice(0, 12);
}
const ranking = { closers: rank('closer_email'), owners: rank('owner_email'), sdrs: null };

// ---------- PESSOAS (SDR / Closer / Onboarding) ----------
// Cada papel usa a safra onde a sua métrica principal é uma CONTAGEM DIRETA na própria
// semana da safra (não uma conversão futura em atraso) — evita duplicar contagem entre
// arquivos. SDR: contatados (02). Closer: oportunidades (03) + ganhos (04). Onboarding: ganhos/ativados (04).
function getP(map, email) {
  if (!map[email]) map[email] = { email };
  return map[email];
}
const porPessoaSdr = {};
for (const r of f02) {
  const email = r.sdr_email; if (!email) continue;
  const p = getP(porPessoaSdr, email);
  const contatados = num(r.contatados), conectados = num(r.conectados);
  p.contacted = (p.contacted || 0) + contatados;
  p.connected = (p.connected || 0) + conectados;
  const d = parseFloat(r.dias_contato_conectado);
  if (isFinite(d) && conectados > 0) { p._dCCsum = (p._dCCsum || 0) + d * conectados; p._dCCden = (p._dCCden || 0) + conectados; }
  p.estrategia = estr(r.estrategia) || p.estrategia;
}
for (const r of f03) {
  const email = r.sdr_email; if (!email) continue;
  const p = getP(porPessoaSdr, email);
  const opps = num(r.oportunidades);
  p.opps = (p.opps || 0) + opps;
  const b = bucket(r.nivel);
  p.oppNivel = p.oppNivel || {}; p.oppNivel[b] = (p.oppNivel[b] || 0) + opps;
  // métrica principal do 1:1 (Opps/semana) — tally direto da própria safra 03
  const w = r.ano_semana;
  p.semanal = p.semanal || {}; p.semanal[w] = (p.semanal[w] || 0) + opps;
}
function last4Weekly(semanalObj, allWeeks) {
  const ws = allWeeks.filter(w => semanalObj && semanalObj[w] != null).sort().slice(-4);
  return ws.map(w => ({ semana: w, valor: Math.round(semanalObj[w]) }));
}
const sdrList = Object.values(porPessoaSdr).map(p => ({
  email: p.email, estrategia: p.estrategia || null,
  contacted: Math.round(p.contacted || 0), connected: Math.round(p.connected || 0), opps: Math.round(p.opps || 0),
  contactRate: p.contacted ? +(p.connected / p.contacted).toFixed(3) : null,
  diasContatoConectado: p._dCCden ? +(p._dCCsum / p._dCCden).toFixed(1) : null,
  oppNivel: NIVEIS.map(n => Math.round((p.oppNivel || {})[n] || 0)),
  metricaSemanal: 'opps', semanal: last4Weekly(p.semanal, semanas),
})).sort((a, b) => b.opps - a.opps);

const porPessoaCloser = {};
for (const r of f03) {
  const email = r.closer_email; if (!email) continue;
  const p = getP(porPessoaCloser, email);
  const opps = num(r.oportunidades), sqls = num(r.sqls);
  p.opps = (p.opps || 0) + opps; p.sql = (p.sql || 0) + sqls;
  const d = parseFloat(r.dias_opp_sql);
  if (isFinite(d) && sqls > 0) { p._dOSsum = (p._dOSsum || 0) + d * sqls; p._dOSden = (p._dOSden || 0) + sqls; }
}
for (const r of f04) {
  const email = r.closer_email; if (!email) continue;
  const p = getP(porPessoaCloser, email);
  const cw = num(r.ganhos);
  p.cw = (p.cw || 0) + cw;
  const b = bucket(r.nivel);
  p.cwNivel = p.cwNivel || {}; p.cwNivel[b] = (p.cwNivel[b] || 0) + cw;
  const d = parseFloat(r.dias_sql_won);
  if (isFinite(d) && cw > 0) { p._dSWsum = (p._dSWsum || 0) + d * cw; p._dSWden = (p._dSWden || 0) + cw; }
  // métrica principal do 1:1 (CW/semana) — tally direto da própria safra 04
  const w = r.ano_semana;
  p.semanal = p.semanal || {}; p.semanal[w] = (p.semanal[w] || 0) + cw;
}
const closerList = Object.values(porPessoaCloser).map(p => ({
  email: p.email,
  opps: Math.round(p.opps || 0), sql: Math.round(p.sql || 0), cw: Math.round(p.cw || 0),
  sqlRate: p.opps ? +(p.sql / p.opps).toFixed(3) : null,
  winRate: p.sql ? +(p.cw / p.sql).toFixed(3) : null,
  diasOppSql: p._dOSden ? +(p._dOSsum / p._dOSden).toFixed(1) : null,
  diasSqlWon: p._dSWden ? +(p._dSWsum / p._dSWden).toFixed(1) : null,
  cwNivel: NIVEIS.map(n => Math.round((p.cwNivel || {})[n] || 0)),
  metricaSemanal: 'cw', semanal: last4Weekly(p.semanal, semanas),
})).sort((a, b) => b.cw - a.cw);

const porPessoaOnb = {};
for (const r of f04) {
  const email = r.onboarding_email; if (!email) continue;
  const p = getP(porPessoaOnb, email);
  const cw = num(r.ganhos), act = num(r.ativados_10k);
  p.cwIn = (p.cwIn || 0) + cw; p.activated = (p.activated || 0) + act;
  const b = bucket(r.nivel);
  p.actNivel = p.actNivel || {}; p.actNivel[b] = (p.actNivel[b] || 0) + act;
  const d = parseFloat(r.dias_won_ativacao);
  if (isFinite(d) && act > 0) { p._dWAsum = (p._dWAsum || 0) + d * act; p._dWAden = (p._dWAden || 0) + act; }
  // métrica principal do 1:1 (Ativações/semana) — tally direto da própria safra 04
  const w = r.ano_semana;
  p.semanal = p.semanal || {}; p.semanal[w] = (p.semanal[w] || 0) + act;
}
const onbList = Object.values(porPessoaOnb).map(p => ({
  email: p.email,
  cwIn: Math.round(p.cwIn || 0), activated: Math.round(p.activated || 0),
  actRate: p.cwIn ? +(p.activated / p.cwIn).toFixed(3) : null,
  diasWonAtivacao: p._dWAden ? +(p._dWAsum / p._dWAden).toFixed(1) : null,
  actNivel: NIVEIS.map(n => Math.round((p.actNivel || {})[n] || 0)),
  metricaSemanal: 'activated', semanal: last4Weekly(p.semanal, semanas),
})).sort((a, b) => b.activated - a.activated);

// ---------- SÉRIES SEMANAIS POR NÍVEL (tendência 4 semanas, sem duplicar contagem) ----------
// contacted: tally direto da própria safra 02. opps: tally direto da 03. cw/activation: tally direto da 04.
const semContactedNivel = {}, semOppNivel = {}, semCwNivel = {}, semActNivel = {};
for (const r of f02) {
  const w = r.ano_semana; const b = bucket(r.nivel);
  (semContactedNivel[w] = semContactedNivel[w] || {})[b] = (semContactedNivel[w][b] || 0) + num(r.contatados);
}
for (const r of f03) {
  const w = r.ano_semana; const b = bucket(r.nivel);
  (semOppNivel[w] = semOppNivel[w] || {})[b] = (semOppNivel[w][b] || 0) + num(r.oportunidades);
}
for (const r of f04) {
  const w = r.ano_semana; const b = bucket(r.nivel);
  (semCwNivel[w] = semCwNivel[w] || {})[b] = (semCwNivel[w][b] || 0) + num(r.ganhos);
  (semActNivel[w] = semActNivel[w] || {})[b] = (semActNivel[w][b] || 0) + num(r.ativados_10k);
}
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
const fteBy = {};
for (const r of f02) {
  const e = estr(r.estrategia); if (!e) continue;
  const f = fteBy[e] || (fteBy[e] = { sdrs: new Set(), contacted: 0, opps: 0 });
  if (r.sdr_email) f.sdrs.add(r.sdr_email);
  f.contacted += num(r.contatados);
}
for (const r of f03) {
  const e = estr(r.estrategia); if (!e) continue;
  const f = fteBy[e] || (fteBy[e] = { sdrs: new Set(), contacted: 0, opps: 0 });
  f.opps += num(r.oportunidades);
}
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
  funilCompleto: f05.length > 0,
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
console.log('OK app_data.js — meses:', meses.length, '| semanas:', semanas.length, '| funil completo (05):', DATA.funilCompleto);
console.log('ultimo mes actual:', Object.keys(actualMensal).sort().pop());
console.log('mes fechado:', mesFechado.mes, '(anterior:', mesFechado.mesAnterior + ')');
console.log('pessoas — sdr:', sdrList.length, '| closer:', closerList.length, '| onboarding:', onbList.length);
console.log('exemplo 2026-06 total:', JSON.stringify(actualMensal['2026-06']?.total));
console.log('budget 2026-06 total:', JSON.stringify(budgetMensal['2026-06']?.total));
console.log('ciclo:', JSON.stringify(ciclo));
console.log('top closer:', JSON.stringify(ranking.closers[0]));
