/* =============================================================================
 * Comentários do New Business Cockpit · painel lateral estilo Google Slides.
 * Store: Supabase (Postgres + Realtime + Auth magic link). App continua estático.
 * A publishable key é PÚBLICA por design — a trava real é o RLS (@hotmart.com).
 * Auth persistida em sessionStorage (NÃO localStorage) — respeita a política appsec.
 * O contexto {semana, aba} é lido direto do DOM, então o index.html não precisa
 * publicar nada nem o render() ser tocado (menos conflito com outras branches).
 * ========================================================================== */
(function () {
  'use strict';
  const CFG = {
    url: 'https://ntzkkheosjzneluhadud.supabase.co',
    key: 'sb_publishable_Jf7CMPxHNbjZKtqOADdhPA_ui1zVggL',
    dominio: '@hotmart.com',
  };

  let sb = null, session = null, meEmail = null, meNome = null;
  let ctx = { semana: '', aba: '' };
  let threads = [];               // [{root, all:[...]}]
  let byAnchor = {};              // titulo -> [thread,...]
  let activeAnchor = '';          // filtro/âncora selecionada
  let channel = null, tickT = null;

  function waitSupabase(fn, tries) {
    tries = tries || 0;
    if (window.supabase && window.supabase.createClient) return fn();
    if (tries > 200) return console.warn('[cmt] supabase-js não carregou');
    setTimeout(() => waitSupabase(fn, tries + 1), 50);
  }
  document.addEventListener('DOMContentLoaded', () => waitSupabase(init));
  if (document.readyState !== 'loading') waitSupabase(init);

  function init() {
    if (sb) return;
    try {
      sb = window.supabase.createClient(CFG.url, CFG.key, {
        auth: { storage: window.sessionStorage, storageKey: 'nb-cmt-auth', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
    } catch (e) { return console.warn('[cmt] init falhou', e); }
    buildShell();
    sb.auth.getSession().then(({ data }) => setSession(data && data.session));
    sb.auth.onAuthStateChange((_e, s) => setSession(s));
    // re-scan a cada re-render / troca de filtro
    const target = document.querySelector('.content') || document.body;
    new MutationObserver(scheduleTick).observe(target, { childList: true, subtree: true });
    document.addEventListener('change', scheduleTick, true);
    document.addEventListener('click', (e) => { if (e.target.closest('.side-nav .tab, .subtab, select.sel')) scheduleTick(); }, true);
    scheduleTick();
  }

  // ---------- contexto (lido do DOM) ----------
  function val(id) { const e = document.getElementById(id); return e ? e.value : ''; }
  function getContext() {
    const tab = document.querySelector('.side-nav .tab.on');
    const meeting = tab ? tab.dataset.k : 'wsales';
    if (meeting === 'mensal') return { semana: val('selMesMensal'), aba: 'mensal' };
    if (meeting === 'wsales') return { semana: val('selSemana'), aba: 'wsales' };
    if (meeting === 'warea') { const st = document.querySelector('.subtab.on'); return { semana: val('selSemanaArea'), aba: 'warea:' + (st ? st.dataset.k : 'sdr') }; }
    return { semana: '', aba: 'oneone' };
  }
  function scheduleTick() { clearTimeout(tickT); tickT = setTimeout(tick, 160); }
  function tick() {
    const c = getContext();
    if (c.aba !== ctx.aba || c.semana !== ctx.semana) { ctx = c; activeAnchor = ''; refresh(); }
    else renderPins();
  }

  // ---------- dados ----------
  function nomeFromEmail(email) {
    try {
      const D = window.DATA || {};
      for (const g of ['sdr', 'closer', 'onboarding']) {
        const arr = (D.porPessoa || {})[g] || [];
        const p = arr.find(x => x.email && x.email.toLowerCase() === email.toLowerCase());
        if (p && p.nome) return p.nome;
      }
    } catch (e) {}
    return (email.split('@')[0] || '').replace(/[._]/g, ' ');
  }
  async function refresh() {
    threads = []; byAnchor = {};
    if (session) {
      const { data, error } = await sb.from('comentarios').select('*')
        .eq('aba', ctx.aba).eq('semana', ctx.semana).order('criado_em', { ascending: true });
      if (error) console.warn('[cmt] fetch', error.message);
      else {
        const rows = data || [];
        const roots = rows.filter(r => r.id === r.thread_id);
        const grp = {}; rows.forEach(r => (grp[r.thread_id] = grp[r.thread_id] || []).push(r));
        threads = roots.map(root => ({ root, all: (grp[root.thread_id] || []) }));
        threads.forEach(t => { const a = t.root.ancora || 'Geral'; (byAnchor[a] = byAnchor[a] || []).push(t); });
      }
    }
    renderPanel(); renderPins(); renderFabCount();
  }
  function subscribeRealtime() {
    if (channel) { sb.removeChannel(channel); channel = null; }
    channel = sb.channel('cmt-' + Date.now())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'comentarios' }, () => refresh())
      .subscribe();
  }

  // ---------- UI shell ----------
  function buildShell() {
    const fab = document.createElement('button');
    fab.className = 'nb-fab'; fab.id = 'nbFab';
    fab.innerHTML = '💬 Comentários <span class="n" id="nbFabN" style="display:none">0</span>';
    fab.onclick = () => document.body.classList.toggle('nb-open');
    const panel = document.createElement('aside');
    panel.className = 'nb-panel';
    panel.innerHTML =
      '<div class="nb-head"><div><h3>Comentários</h3><div class="sub" id="nbCtx"></div></div>' +
      '<button class="nb-x" id="nbClose">×</button></div>' +
      '<div class="nb-auth" id="nbAuth"></div>' +
      '<div class="nb-new" id="nbNew" style="display:none"></div>' +
      '<div class="nb-body" id="nbBody"></div>';
    document.body.appendChild(fab); document.body.appendChild(panel);
    document.getElementById('nbClose').onclick = () => document.body.classList.remove('nb-open');
    renderAuth();
  }
  function renderFabCount() {
    const n = threads.length, el = document.getElementById('nbFabN');
    if (el) { el.style.display = n ? 'inline-block' : 'none'; el.textContent = n; }
  }
  function renderAuth() {
    const el = document.getElementById('nbAuth'); if (!el) return;
    if (session) {
      el.innerHTML = '<div class="you"><span class="nb-avatar">' + inits(meNome) + '</span>' +
        '<span>Você: <b>' + esc(meNome) + '</b></span>' +
        '<button class="nb-mini" id="nbOut" style="margin-left:auto">sair</button></div>';
      document.getElementById('nbOut').onclick = () => sb.auth.signOut();
    } else {
      el.innerHTML = 'Entre com seu e-mail <b>@hotmart.com</b> para ver e comentar:' +
        '<input id="nbEmail" type="email" placeholder="voce@hotmart.com" autocomplete="email">' +
        '<button class="nb-btn" id="nbIn">Enviar link de acesso</button>' +
        '<div id="nbAuthMsg" style="margin-top:6px"></div>';
      document.getElementById('nbIn').onclick = signIn;
    }
    const nn = document.getElementById('nbNew'); if (nn) nn.style.display = session ? 'block' : 'none';
  }
  async function signIn() {
    const email = (document.getElementById('nbEmail').value || '').trim().toLowerCase();
    const msg = document.getElementById('nbAuthMsg');
    if (!email.endsWith(CFG.dominio)) { msg.innerHTML = '<span style="color:var(--danger,#F04438)">Use um e-mail ' + CFG.dominio + '</span>'; return; }
    document.getElementById('nbIn').disabled = true;
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } });
    msg.innerHTML = error ? '<span style="color:var(--danger,#F04438)">' + esc(error.message) + '</span>'
      : '✅ Link enviado — abra o e-mail e clique pra entrar.';
    document.getElementById('nbIn').disabled = false;
  }
  function setSession(s) {
    session = s || null;
    meEmail = session && session.user ? session.user.email : null;
    meNome = meEmail ? nomeFromEmail(meEmail) : null;
    if (session) subscribeRealtime();
    renderAuth(); refresh();
  }

  // ---------- composição ----------
  function sectionTitles() {
    return [...document.querySelectorAll('.content .sec .sec-head h2')].map(h => h.textContent.trim()).filter(Boolean);
  }
  function renderNew() {
    const el = document.getElementById('nbNew'); if (!el || !session) return;
    const titles = sectionTitles(); const opts = ['Geral', ...titles];
    el.innerHTML = '<select id="nbAnchorSel">' + opts.map(t => '<option' + (t === activeAnchor ? ' selected' : '') + '>' + esc(t) + '</option>').join('') + '</select>' +
      '<textarea id="nbNewTxt" placeholder="Novo comentário nesta semana…"></textarea>' +
      '<button class="nb-btn" id="nbPost">Comentar</button>';
    document.getElementById('nbPost').onclick = postRoot;
  }
  async function postRoot() {
    const txt = (document.getElementById('nbNewTxt').value || '').trim();
    const anchor = document.getElementById('nbAnchorSel').value;
    if (!txt) return;
    const { error } = await sb.from('comentarios').insert({
      semana: ctx.semana, aba: ctx.aba, ancora: anchor,
      autor_email: meEmail, autor_nome: meNome, texto: txt,
    });
    if (error) return alert('Erro ao comentar: ' + error.message);
    document.getElementById('nbNewTxt').value = '';
    refresh();
  }
  async function postReply(root, txt) {
    if (!txt.trim()) return;
    const { error } = await sb.from('comentarios').insert({
      thread_id: root.thread_id, parent_id: root.id,
      semana: ctx.semana, aba: ctx.aba, ancora: root.ancora,
      autor_email: meEmail, autor_nome: meNome, texto: txt.trim(),
    });
    if (error) return alert('Erro ao responder: ' + error.message);
    refresh();
  }
  async function toggleResolve(root) {
    const { error } = await sb.from('comentarios').update({ resolvido: !root.resolvido }).eq('id', root.id);
    if (error) alert('Erro: ' + error.message); else refresh();
  }
  async function del(id) {
    if (!confirm('Apagar este comentário?')) return;
    const { error } = await sb.from('comentarios').delete().eq('id', id);
    if (error) alert('Erro: ' + error.message); else refresh();
  }

  // ---------- painel ----------
  function renderPanel() {
    const ctxEl = document.getElementById('nbCtx');
    if (ctxEl) ctxEl.textContent = abaLabel(ctx.aba) + (ctx.semana ? ' · ' + ctx.semana : '');
    renderNew();
    const body = document.getElementById('nbBody'); if (!body) return;
    if (!session) { body.innerHTML = '<div class="nb-empty">🔒 Entre com seu e-mail @hotmart.com acima para ver e escrever comentários.</div>'; return; }
    const list = activeAnchor ? (byAnchor[activeAnchor] || []) : threads;
    if (!list.length) { body.innerHTML = '<div class="nb-empty">Nenhum comentário' + (activeAnchor ? ' em "' + esc(activeAnchor) + '"' : ' nesta semana/aba') + ' ainda.<br>Use o balão numa seção ou o campo acima.</div>'; return; }
    body.innerHTML = list.slice().sort((a, b) => (a.root.criado_em < b.root.criado_em ? 1 : -1)).map(threadHTML).join('');
    body.querySelectorAll('[data-anchor]').forEach(a => a.onclick = () => scrollToAnchor(a.dataset.anchor));
    body.querySelectorAll('[data-reply]').forEach(t => t.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); const root = findRoot(t.dataset.reply); if (root) postReply(root, t.value); }
    });
    body.querySelectorAll('[data-replybtn]').forEach(b => b.onclick = () => {
      const root = findRoot(b.dataset.replybtn); if (!root) return;
      const ta = body.querySelector('textarea[data-reply="' + b.dataset.replybtn + '"]');
      if (ta) postReply(root, ta.value);
    });
    body.querySelectorAll('[data-res]').forEach(b => b.onclick = () => { const r = findRoot(b.dataset.res); if (r) toggleResolve(r); });
    body.querySelectorAll('[data-del]').forEach(b => b.onclick = () => del(b.dataset.del));
  }
  function findRoot(threadId) { const t = threads.find(x => x.root.thread_id === threadId); return t ? t.root : null; }
  function threadHTML(t) {
    const cs = t.all.slice().sort((a, b) => (a.criado_em < b.criado_em ? -1 : 1));
    const comments = cs.map(c => {
      const mine = c.autor_email === meEmail;
      return '<div class="nb-c"><div class="meta"><span class="nb-avatar">' + inits(c.autor_nome) + '</span>' +
        '<b>' + esc(c.autor_nome || c.autor_email) + '</b><span>' + fmtTime(c.criado_em) + '</span>' +
        (mine ? '<button class="nb-mini" data-del="' + c.id + '" style="margin-left:auto">apagar</button>' : '') +
        '</div><div class="txt">' + esc(c.texto) + '</div></div>';
    }).join('');
    const canRes = t.root.autor_email === meEmail;
    return '<div class="nb-thread' + (t.root.resolvido ? ' res' : '') + '">' +
      '<span class="nb-anchor" data-anchor="' + esc(t.root.ancora || 'Geral') + '">📍 ' + esc(t.root.ancora || 'Geral') + (t.root.resolvido ? ' · resolvido' : '') + '</span>' +
      comments +
      '<textarea class="nb-reply" data-reply="' + t.root.thread_id + '" placeholder="Responder… (Enter envia)"></textarea>' +
      '<div class="nb-row"><button class="nb-btn ghost" data-replybtn="' + t.root.thread_id + '">Responder</button>' +
      (canRes ? '<button class="nb-mini" data-res="' + t.root.thread_id + '">' + (t.root.resolvido ? 'reabrir' : 'resolver') + '</button>' : '') + '</div>' +
      '</div>';
  }

  // ---------- pins nas seções ----------
  function renderPins() {
    document.querySelectorAll('.content .sec').forEach(sec => {
      const h2 = sec.querySelector('.sec-head h2'); if (!h2) return;
      const title = h2.textContent.trim();
      if (getComputedStyle(sec).position === 'static') sec.style.position = 'relative';
      let pin = sec.querySelector(':scope > .nb-pin');
      if (!pin) {
        pin = document.createElement('button'); pin.className = 'nb-pin';
        pin.innerHTML = '💬<span class="n"></span>'; sec.appendChild(pin);
        pin.addEventListener('click', (e) => { e.stopPropagation(); openAnchor(pin.dataset.anchor); });
      }
      pin.dataset.anchor = title;
      const n = (byAnchor[title] || []).length;
      pin.querySelector('.n').textContent = n || '';
      pin.classList.toggle('has', n > 0);
    });
  }
  function openAnchor(title) {
    activeAnchor = title; document.body.classList.add('nb-open');
    renderPanel();
    const sel = document.getElementById('nbAnchorSel'); if (sel) sel.value = title;
    const txt = document.getElementById('nbNewTxt'); if (txt) txt.focus();
  }
  function scrollToAnchor(title) {
    const sec = [...document.querySelectorAll('.content .sec')].find(s => { const h = s.querySelector('.sec-head h2'); return h && h.textContent.trim() === title; });
    if (sec) { sec.scrollIntoView({ behavior: 'smooth', block: 'center' }); sec.classList.add('nb-hl'); setTimeout(() => sec.classList.remove('nb-hl'), 1600); }
  }

  // ---------- utils ----------
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
  function inits(name) { const p = (name || '?').trim().split(/\s+/); return ((p[0] && p[0][0] || '') + (p[1] && p[1][0] || '')).toUpperCase() || '?'; }
  function abaLabel(a) { return ({ mensal: 'Mensal Sales', wsales: 'Semanal Sales', oneone: '1:1 Gestor', 'warea:sdr': 'Área · SDR', 'warea:closers': 'Área · Closers', 'warea:onboarding': 'Área · Onboarding' })[a] || a; }
  function fmtTime(iso) { try { const d = new Date(iso); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
})();
