/* cadastro-contador.js — Lista de atletas, inscrições, árbitros e flights no Contador (CONBRAKS 2026)
 *  - Campos com lista que filtra ao digitar (Atleta, Prova, Árbitro e filtros do histórico), no lugar dos <datalist>.
 *  - Lista embutida no HTML (#kb-atletas) + cópia baixada do banco (contador_lista); usa a mais nova e mostra a versão.
 *  - Prova mostra só as inscrições do atleta escolhido (preenche sozinha se houver uma só).
 *  - Inclusão com Enter → confirmação (nomes parecidos) → PIN → nome do juiz → salva no aparelho e entra na fila.
 *  - Flights: hoje / não concluídos / esta plataforma, "Ver todos" e sugestão com confirmação antes de preencher.
 *  - O resultado passa a levar atleta_id, inscricao_id, flight_id e origem.
 *  - Itens fictícios (origem 'mock') aparecem com contorno pontilhado laranja.
 * Não altera a contagem. Usa do contador: NUVEM, showToast, deviceId, novoUUID, histLoad, beginCounter, buildProva, corpoProva, envia, onFiltro.
 */
(function () {
  'use strict';
  if (window.kbCad) return;
  const PIN_SHA = '4b16c9448cd7a7382dc6bc9171f7546998d6d474a55579c575e5c77994a1b7d0';                 // SHA-256 de 'kb-conbraks-org|' + PIN (o PIN não fica no código)
  const K_CACHE = 'kb_lista_v1', K_INC = 'kb_inclusoes_v1', K_VINC = 'kb_vinculos_v1', K_PLAT = 'kb_plataforma_v1', K_JUIZ = 'kb_juiz_v1';
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const $ = (id) => document.getElementById(id);
  const toast = (m, k) => { try { showToast(m, k); } catch (e) {} };
  const nuvem = () => { try { return NUVEM; } catch (e) { return null; } };
  const disp = () => { try { return deviceId(); } catch (e) { return null; } };
  const uuid = () => { try { return novoUUID(); } catch (e) { return crypto.randomUUID(); } };
  const MOCK_TAG = '<span class="kb-mock-tag" title="Dado fictício (mock)">MOCK</span>';
  let pinMem = null, pinAte = 0;

  // ---------- estilos ----------
  const st = document.createElement('style');
  st.textContent = `
  .kb-mock{outline:2px dashed #ff8c00!important;outline-offset:2px}
  .kb-mock-tag{display:inline-block;font:700 .62rem/1 system-ui,sans-serif;letter-spacing:.06em;color:#ff8c00;border:1px dashed #ff8c00;border-radius:5px;padding:2px 5px;margin-left:6px;vertical-align:2px}
  .kc-wrap{position:relative}
  .kc-list{position:absolute;left:0;right:0;top:100%;z-index:350;margin-top:4px;max-height:min(52vh,340px);overflow:auto;background:#0b1a3d;border:1px solid #3b5ea8;border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.5);padding:4px;display:none;text-align:left}
  .kc-list.open{display:block}
  .kc-opt{display:block;width:100%;text-align:left;background:none;border:0;color:#fff;font:15px/1.3 system-ui,sans-serif;padding:9px 10px;border-radius:8px;cursor:pointer}
  .kc-opt small{display:block;color:#9fb3d9;font-size:.78rem;margin-top:2px}
  .kc-opt[aria-selected=true],.kc-opt:hover{background:#1c3a7a}
  .kc-vazio{color:#9fb3d9;font:14px system-ui;padding:10px}
  .kc-novo{color:#ffcc00;font:600 14px system-ui;padding:10px;border-top:1px solid #2a4a8a;margin-top:4px}
  .kc-ver{font:12px/1.3 system-ui,sans-serif;color:#9fb3d9;margin-top:6px;text-align:left;display:flex;flex-wrap:wrap;gap:6px 10px;align-items:center}
  .kc-ver button{background:none;border:1px solid #3b5ea8;color:#ffcc00;border-radius:8px;padding:4px 8px;font:600 12px system-ui;cursor:pointer}
  .kc-ov{position:fixed;inset:0;z-index:420;background:rgba(0,0,0,.72);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:max(16px,env(safe-area-inset-top)) 12px 24px}
  .kc-box{width:100%;max-width:560px;background:#0b1a3d;color:#fff;border:1px solid #3b5ea8;border-radius:16px;padding:18px;font:15px/1.5 system-ui,sans-serif;text-align:left}
  .kc-box h2{margin:0 0 6px;color:#ffcc00;font-size:1.2rem}
  .kc-sub{color:#9fb3d9;font-size:.9rem;margin:0 0 10px}
  .kc-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  .kc-btn{appearance:none;border:0;border-radius:10px;padding:11px 14px;font:700 .95rem system-ui;cursor:pointer;background:#ffcc00;color:#000}
  .kc-btn.sec{background:transparent;color:#fff;border:1px solid #3b5ea8}
  .kc-in{width:100%;box-sizing:border-box;background:#06122c;color:#fff;border:1px solid #3b5ea8;border-radius:8px;padding:10px;font:16px system-ui}
  .kc-pin{display:flex;gap:10px;justify-content:center;margin:12px 0}.kc-pin input{width:60px;height:60px;text-align:center;font:800 1.7rem system-ui}
  .kc-item{display:flex;justify-content:space-between;gap:10px;width:100%;text-align:left;background:#06122c;border:1px solid #2a4a8a;color:#fff;border-radius:10px;padding:10px 12px;margin-top:6px;cursor:pointer;font:inherit}
  .kc-item small{color:#9fb3d9;display:block}
  .kc-kv{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;font-size:.95rem}.kc-kv span{color:#9fb3d9}
  .kc-err{color:#ff8a8a;min-height:1.3em;text-align:center}
  .kc-tag{display:inline-block;font:700 .7rem/1 system-ui;padding:3px 6px;border-radius:6px;background:#1c3a7a;color:#cfe0ff;margin-left:6px}
  .kc-tag.atr{background:#5c1616;color:#ffb3b3}
  `;
  document.head.appendChild(st);

  // ---------- dados ----------
  function embutida() { try { const el = $('kb-atletas'); return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; } }
  const vazia = { versao: null, equipes: [], tipos_prova: [], atletas: [], inscricoes: [], arbitros: [], flights: [] };
  let BASE = vazia, ORIGEM = 'nenhuma';
  function escolheBase() {
    const e = embutida(), c = lsGet(K_CACHE, null);
    const te = e && e.versao ? Date.parse(e.versao) : 0, tc = c && c.versao ? Date.parse(c.versao) : 0;
    if (tc > te) { BASE = c; ORIGEM = 'baixada'; } else if (e) { BASE = e; ORIGEM = 'embutida'; } else if (c) { BASE = c; ORIGEM = 'baixada'; } else { BASE = vazia; ORIGEM = 'nenhuma'; }
    indexa();
  }
  let D = null;   // dados mesclados + índices
  function indexa() {
    const inc = lsGet(K_INC, []);
    const at = BASE.atletas.slice(), ar = BASE.arbitros.slice(), eqs = BASE.equipes.slice(), ins = BASE.inscricoes.slice();
    inc.forEach((x) => {
      const d = x.dados;
      if (x.tipo === 'atleta' && !at.some((a) => a.id === d.id)) at.push({ id: d.id, nome: d.nome, sexo: d.sexo, equipe_id: d.equipe_id, uf: d.uf, local: !x.enviado });
      if (x.tipo === 'arbitro' && !ar.some((a) => a.id === d.id || norm(a.nome) === norm(d.nome))) ar.push({ id: d.id, nome: d.nome, local: !x.enviado });
      if (x.tipo === 'equipe' && !eqs.some((a) => a.id === d.id)) eqs.push({ id: d.id, nome: d.nome, local: !x.enviado });
      if (x.tipo === 'inscricao' && !ins.some((a) => a.id === d.id)) ins.push({ id: d.id, atleta_id: d.atleta_id, prova: d.prova, carga_kg: d.carga_kg, categorias: d.categorias || [], local: !x.enviado });
    });
    const eqPorId = new Map(eqs.map((e) => [e.id, e]));
    at.sort((a, b) => norm(a.nome).localeCompare(norm(b.nome)));
    D = { atletas: at, arbitros: ar, equipes: eqs, inscricoes: ins, tipos: BASE.tipos_prova || [], flights: BASE.flights || [], eqPorId,
      atPorId: new Map(at.map((a) => [a.id, a])), insPorId: new Map(ins.map((i) => [i.id, i])), pendentes: inc.filter((x) => !x.enviado).length };
    rotuloVersao();
  }
  const eqNome = (a) => (a && a.equipe_id && D.eqPorId.get(a.equipe_id) ? D.eqPorId.get(a.equipe_id).nome : '');
  const tipoNome = (cod) => { const t = D.tipos.find((x) => x.codigo === cod); return t ? t.nome : cod; };
  const catTxt = (i) => (i.categorias || []).map((c) => (typeof c === 'string' ? c : c.nome)).join(' + ');
  const insRotulo = (i) => i.prova + (i.carga_kg ? ' · ' + String(i.carga_kg).replace(/\.0+$/, '') + 'kg' : '');      // vai no campo (curto)
  const insLongo = (i) => tipoNome(i.prova) + (i.carga_kg ? ' · ' + String(i.carga_kg).replace(/\.0+$/, '') + 'kg' : '') + (catTxt(i) ? ' · ' + catTxt(i) : '');

  // ---------- baixar do banco ----------
  async function rpc(fn, corpo) {
    const n = nuvem(); if (!n) throw new Error('sem configuração');
    const r = await fetch(n.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: n.key, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || 'erro ' + r.status);
    return j;
  }
  let avisouRelogio = false;
  async function baixa(manual) {
    if (!navigator.onLine) { if (manual) toast('Sem internet: usando a lista guardada no aparelho'); return false; }
    try {
      const t0 = Date.now(), j = await rpc('contador_lista', {}), t1 = Date.now();
      if (j.servidor_agora) {
        const dif = Date.parse(j.servidor_agora) - (t0 + t1) / 2;
        if (Math.abs(dif) > 120000 && !avisouRelogio) { avisouRelogio = true; toast('O relógio deste aparelho está ' + Math.round(Math.abs(dif) / 60000) + ' min ' + (dif > 0 ? 'atrasado' : 'adiantado') + '. Acerte a hora para os horários dos flights ficarem certos.', 'err'); }
      }
      const atual = BASE.versao ? Date.parse(BASE.versao) : 0;
      if (j.versao && Date.parse(j.versao) >= atual) { lsSet(K_CACHE, j); escolheBase(); }
      if (manual) toast('Lista de atletas atualizada');
      return true;
    } catch (e) { if (manual) toast('Não foi possível baixar a lista: ' + e.message, 'err'); return false; }
  }

  // ---------- rótulo da versão (abaixo do formulário) ----------
  let verEl = null;
  function rotuloVersao() {
    if (!verEl) {
      const alvo = $('intro-form-inner'); if (!alvo) return;
      verEl = document.createElement('div'); verEl.className = 'kc-ver'; verEl.id = 'kc-ver'; alvo.appendChild(verEl);
    }
    const v = BASE.versao ? new Date(BASE.versao) : null;
    const atMock = (BASE.atletas || []).some((a) => a.mock), flMock = (BASE.flights || []).some((f) => f.mock);
    verEl.classList.toggle('kb-mock', atMock);
    verEl.innerHTML = '<span>Lista de atletas · ' + (v ? 'versão ' + v.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + v.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' (' + ORIGEM + ')' : 'sem lista') + ' · ' + D.atletas.length + ' atletas</span>' +
      (atMock ? MOCK_TAG : '') +
      (D.pendentes ? '<button type="button" id="kc-pend">' + D.pendentes + ' inclusão(ões) a enviar</button>' : '') +
      ((BASE.flights || []).length ? '<button type="button" id="kc-fl"' + (flMock ? ' class="kb-mock" title="Flights fictícios (mock)"' : '') + '>Flights' + (flMock ? ' (mock)' : '') + '</button>' : '');
    const p = $('kc-pend'); if (p) p.onclick = (e) => { e.stopPropagation(); enviaPendentes(true); };
    const f = $('kc-fl'); if (f) f.onclick = (e) => { e.stopPropagation(); flightsHoje(); };
  }

  // ---------- lista que filtra ao digitar ----------
  function combo(input, cfg) {
    if (!input || input.dataset.kc) return;
    input.dataset.kc = '1'; input.removeAttribute('list');
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-autocomplete', 'list'); input.setAttribute('aria-expanded', 'false');
    const wrap = document.createElement('span'); wrap.className = 'kc-wrap'; wrap.style.display = getComputedStyle(input).display === 'block' ? 'block' : 'block';
    input.parentNode.insertBefore(wrap, input); wrap.appendChild(input);
    const ul = document.createElement('div'); ul.className = 'kc-list'; ul.setAttribute('role', 'listbox'); ul.id = input.id + '-kc'; wrap.appendChild(ul);
    input.setAttribute('aria-controls', ul.id);
    let itens = [], sel = -1, aberto = false;
    const desenha = () => {
      const q = norm(input.value);
      const todos = cfg.itens();
      itens = (cfg.filtraSempre === false && q && todos.some((x) => norm(x.label) === q) ? todos : todos.filter((x) => !q || norm(x.label + ' ' + (x.busca || x.sub || '')).includes(q))).slice(0, 80);
      sel = itens.length ? 0 : -1;
      ul.innerHTML = (itens.length ? itens.map((x, i) => '<button type="button" class="kc-opt' + (x.mock ? ' kb-mock' : '') + '" role="option" id="' + ul.id + '-' + i + '" aria-selected="' + (i === sel) + '" data-i="' + i + '">' + esc(x.label) + (x.mock ? MOCK_TAG : '') + (x.local ? '<span class="kc-tag">a enviar</span>' : '') + (x.sub ? '<small>' + esc(x.sub) + '</small>' : '') + '</button>').join('')
        : '<div class="kc-vazio">' + esc(cfg.vazio || 'Nada encontrado.') + '</div>') +
        (cfg.novo && q && !todos.some((x) => norm(x.label) === q) ? '<div class="kc-novo">Enter: incluir “' + esc(input.value.trim()) + '” como novo ' + cfg.novoNome + '</div>' : '');
      ul.querySelectorAll('.kc-opt').forEach((b) => { b.onmousedown = (e) => e.preventDefault(); b.onclick = () => escolhe(+b.dataset.i); });
      input.setAttribute('aria-activedescendant', sel >= 0 ? ul.id + '-' + sel : '');
    };
    const abre = () => { aberto = true; desenha(); ul.classList.add('open'); input.setAttribute('aria-expanded', 'true'); };
    const fecha = () => { aberto = false; ul.classList.remove('open'); input.setAttribute('aria-expanded', 'false'); };
    const marca = () => { ul.querySelectorAll('.kc-opt').forEach((b, i) => b.setAttribute('aria-selected', String(i === sel))); const b = ul.querySelector('[aria-selected=true]'); if (b) b.scrollIntoView({ block: 'nearest' }); input.setAttribute('aria-activedescendant', sel >= 0 ? ul.id + '-' + sel : ''); };
    function escolhe(i) {
      const x = itens[i]; if (!x) return;
      input.value = x.valor != null ? x.valor : x.label;
      input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true }));
      fecha(); if (cfg.escolhe) cfg.escolhe(x, input);
    }
    input.addEventListener('focus', abre);
    input.addEventListener('click', (e) => { e.stopPropagation(); if (!aberto) abre(); });
    input.addEventListener('input', (e) => { if (e.isTrusted || aberto) { if (!aberto) abre(); else desenha(); } if (e.isTrusted && cfg.digitou) cfg.digitou(input); });
    input.addEventListener('blur', () => setTimeout(fecha, 120));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); if (!aberto) abre(); else if (sel < itens.length - 1) { sel++; marca(); } }
      else if (e.key === 'ArrowUp') { e.preventDefault(); if (sel > 0) { sel--; marca(); } }
      else if (e.key === 'Escape') { if (aberto) { e.preventDefault(); e.stopPropagation(); fecha(); } }
      else if (e.key === 'Enter') {
        const q = norm(input.value), exato = itens.findIndex((x) => norm(x.label) === q);
        if (aberto && exato >= 0) { e.preventDefault(); e.stopPropagation(); escolhe(exato); }
        else if (cfg.novo && q) { e.preventDefault(); e.stopPropagation(); fecha(); cfg.novo(input.value.trim(), input); }
        else if (aberto && sel >= 0 && q) { e.preventDefault(); e.stopPropagation(); escolhe(sel); }
      }
    });
    return { abre, fecha };
  }

  // ---------- seleção atual (para ligar o resultado ao cadastro) ----------
  const SEL = { atleta_id: null, inscricao_id: null, flight_id: null, origem: 'manual' };
  const atletaPorNome = (nome) => { const n = norm(nome); const l = D.atletas.filter((a) => norm(a.nome) === n); return l.length === 1 ? l[0] : null; };
  function insDe(aid) { return D.inscricoes.filter((i) => i.atleta_id === aid); }

  const itensAtleta = () => D.atletas.map((a) => ({ label: a.nome, sub: [eqNome(a), a.uf].filter(Boolean).join(' · ') + ((insDe(a.id).length) ? ' · ' + insDe(a.id).map((i) => i.prova).join(', ') : ''), busca: eqNome(a) + ' ' + (a.apelido || ''), obj: a, mock: a.mock, local: a.local }));
  function itensProva(campoAtleta) {
    const a = atletaPorNome((campoAtleta && campoAtleta.value) || '') || (SEL.atleta_id && D.atPorId.get(SEL.atleta_id));
    if (a) return insDe(a.id).map((i) => ({ label: insRotulo(i), sub: insLongo(i), obj: i, mock: i.mock, local: i.local }));
    const vistos = new Set(), r = [];
    D.tipos.forEach((t) => { vistos.add(norm(t.codigo)); r.push({ label: t.codigo, sub: t.nome, obj: null }); });
    try { histLoad().forEach((p) => { if (p.movimento && !vistos.has(norm(p.movimento))) { vistos.add(norm(p.movimento)); r.push({ label: p.movimento, sub: 'usado neste aparelho', obj: null }); } }); } catch (e) {}
    return r;
  }
  function itensArbitro() {
    const r = D.arbitros.map((a) => ({ label: a.nome, sub: a.funcao || '', obj: a, mock: a.mock, local: a.local })), vistos = new Set(r.map((x) => norm(x.label)));
    try { histLoad().forEach((p) => { if (p.arbitro && !vistos.has(norm(p.arbitro))) { vistos.add(norm(p.arbitro)); r.push({ label: p.arbitro, sub: 'usado neste aparelho' }); } }); } catch (e) {}
    return r;
  }
  function escolheAtleta(x, input, movInput) {
    SEL.atleta_id = x.obj.id; SEL.inscricao_id = null; SEL.flight_id = null; SEL.origem = 'manual';
    const l = insDe(x.obj.id);
    if (movInput) {
      if (l.length === 1) { movInput.value = insRotulo(l[0]); SEL.inscricao_id = l[0].id; movInput.dispatchEvent(new Event('input', { bubbles: true })); }
      else if (l.length > 1) { movInput.value = ''; movInput.dispatchEvent(new Event('input', { bubbles: true })); try { if (typeof setExtra === 'function' && input.id === 'athlete-start') setExtra(true); } catch (e) {} }
    }
  }
  function atletaDigitou(input) { const a = atletaPorNome(input.value); if (!a || a.id !== SEL.atleta_id) { SEL.atleta_id = a ? a.id : null; SEL.inscricao_id = null; SEL.flight_id = null; SEL.origem = 'manual'; } }

  // ---------- janelas ----------
  const ov = document.createElement('div'); ov.className = 'kc-ov'; document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov) fechaJ(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.style.display === 'flex') { e.stopPropagation(); fechaJ(); } }, true);
  function janela(h) { ov.innerHTML = '<div class="kc-box" role="dialog" aria-modal="true" onclick="event.stopPropagation()">' + h + '</div>'; ov.style.display = 'flex'; ov.scrollTop = 0; const f = ov.querySelector('[autofocus]'); if (f) f.focus(); }
  function fechaJ() { ov.style.display = 'none'; ov.innerHTML = ''; }
  async function sha(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
  function pedePin(titulo, texto) {
    return new Promise((ok) => {
      if (pinMem && Date.now() < pinAte) return ok(pinMem);
      janela('<h2>' + esc(titulo) + '</h2><p class="kc-sub">' + esc(texto || 'Digite o PIN de inclusão.') + '</p><div class="kc-pin">' + [0, 1, 2, 3].map((i) => '<input class="kc-in" id="kc-p' + i + '" type="password" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="Dígito ' + (i + 1) + ' do PIN"' + (i ? '' : ' autofocus') + '>').join('') + '</div><div class="kc-err" id="kc-pe" role="alert"></div><div class="kc-btns" style="justify-content:center"><button class="kc-btn sec" id="kc-pc" type="button">Cancelar</button></div>');
      const ins = [0, 1, 2, 3].map((i) => $('kc-p' + i));
      const confere = async () => {
        const v = ins.map((i) => i.value).join(''); if (v.length < 4) return;
        if ((await sha('kb-conbraks-org|' + v)) === PIN_SHA) { pinMem = v; pinAte = Date.now() + 15 * 60000; ok(v); }
        else { $('kc-pe').textContent = 'PIN incorreto.'; ins.forEach((i) => { i.value = ''; }); ins[0].focus(); }
      };
      ins.forEach((inp, i) => {
        inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && i < 3) ins[i + 1].focus(); confere(); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && i > 0) ins[i - 1].focus(); });
      });
      $('kc-pc').onclick = () => { fechaJ(); ok(null); };
    });
  }
  function pedeJuiz() {
    return new Promise((ok) => {
      const atual = (($('arb-start') || {}).value || '').trim() || lsGet(K_JUIZ, '');
      janela('<h2>Quem está incluindo?</h2><p class="kc-sub">Seu nome fica registrado como quem cadastrou.</p><input class="kc-in" id="kc-jz" value="' + esc(atual) + '" placeholder="Nome do juiz" autocomplete="off" autofocus><div class="kc-err" id="kc-je"></div><div class="kc-btns"><button class="kc-btn" id="kc-jok" type="button">Confirmar</button><button class="kc-btn sec" id="kc-jc" type="button">Cancelar</button></div>');
      const vai = () => { const v = $('kc-jz').value.trim(); if (v.length < 2) { $('kc-je').textContent = 'Informe seu nome.'; return; } lsSet(K_JUIZ, v); fechaJ(); ok(v); };
      $('kc-jok').onclick = vai; $('kc-jz').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); vai(); } };
      $('kc-jc').onclick = () => { fechaJ(); ok(null); };
    });
  }
  function parecidos(nome, lista) {
    const n = norm(nome), toks = n.split(' ').filter((t) => t.length > 2);
    return lista.map((x) => { const m = norm(x.nome); const pts = toks.filter((t) => m.includes(t)).length + (m.startsWith(n.slice(0, 4)) ? 1 : 0); return { x, pts }; })
      .filter((o) => o.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 5).map((o) => o.x);
  }
  // ---------- inclusão ----------
  async function incluir(tipo, nome, input, extra) {
    const lista = tipo === 'atleta' ? D.atletas : tipo === 'arbitro' ? D.arbitros : D.equipes;
    const pa = parecidos(nome, lista), nomeTipo = { atleta: 'atleta', arbitro: 'árbitro', equipe: 'equipe' }[tipo];
    const escolha = await new Promise((ok) => {
      janela('<h2>Incluir “' + esc(nome) + '” como novo ' + nomeTipo + '?</h2>' + (pa.length ? '<p class="kc-sub">Já existem nomes parecidos. Se for um deles, toque nele:</p>' + pa.map((x, i) => '<button class="kc-item' + (x.mock ? ' kb-mock' : '') + '" type="button" data-i="' + i + '"><span>' + esc(x.nome) + (x.mock ? MOCK_TAG : '') + '<small>' + esc([eqNome(x), x.uf].filter(Boolean).join(' · ')) + '</small></span><span>usar ›</span></button>').join('') : '<p class="kc-sub">Nenhum nome parecido na lista.</p>') +
        (tipo === 'atleta' ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px"><label style="font-size:.85rem;color:#9fb3d9">Sexo<select class="kc-in" id="kc-sx"><option value="">—</option><option>Masculino</option><option>Feminino</option></select></label><label style="font-size:.85rem;color:#9fb3d9">UF<input class="kc-in" id="kc-uf" maxlength="2" style="text-transform:uppercase"></label></div>' : '') +
        '<div class="kc-btns"><button class="kc-btn" id="kc-sim" type="button">Sim, incluir</button><button class="kc-btn sec" id="kc-nao" type="button">Cancelar</button></div>');
      ov.querySelectorAll('.kc-item').forEach((b) => { b.onclick = () => { fechaJ(); ok({ usar: pa[+b.dataset.i] }); }; });
      $('kc-sim').onclick = () => ok({ novo: true, sexo: ($('kc-sx') || {}).value, uf: (($('kc-uf') || {}).value || '').toUpperCase() });
      $('kc-nao').onclick = () => { fechaJ(); ok(null); };
    });
    if (!escolha) return null;
    if (escolha.usar) { input.value = escolha.usar.nome; input.dispatchEvent(new Event('input', { bubbles: true })); if (tipo === 'atleta') escolheAtleta({ obj: escolha.usar }, input, extra && extra.mov); return escolha.usar; }
    const pin = await pedePin('Incluir ' + nomeTipo, 'Digite o PIN de inclusão para incluir “' + nome + '”.'); if (!pin) return null;
    const juiz = await pedeJuiz(); if (!juiz) return null;
    const dados = { id: uuid(), nome };
    if (tipo === 'atleta') { if (escolha.sexo) dados.sexo = escolha.sexo; if (/^[A-Z]{2}$/.test(escolha.uf)) dados.uf = escolha.uf; }
    const F = lsGet(K_INC, []); F.push({ tipo, dados, cadastrado_por: juiz, dispositivo_id: disp(), criado: Date.now(), enviado: false }); lsSet(K_INC, F);
    indexa();
    input.value = nome; input.dispatchEvent(new Event('input', { bubbles: true }));
    if (tipo === 'atleta') { SEL.atleta_id = dados.id; SEL.inscricao_id = null; }
    toast('“' + nome + '” incluído neste aparelho' + (navigator.onLine ? '' : ' (será enviado quando houver internet)'));
    enviaPendentes(false);
    return dados;
  }
  // nova modalidade para o atleta escolhido (listas, não texto livre)
  async function novaInscricao(texto, movInput) {
    const a = SEL.atleta_id && D.atPorId.get(SEL.atleta_id);
    if (!a) { return; }   // sem atleta escolhido: o texto do movimento fica livre, como antes
    const cats = [...new Set(D.inscricoes.flatMap((i) => (i.categorias || []).map((c) => (typeof c === 'string' ? c : c.nome))))].sort();
    const ok = await new Promise((res) => {
      janela('<h2>Nova modalidade para ' + esc(a.nome) + '</h2><p class="kc-sub">Escolha nas listas. A inscrição fica marcada para a organização conferir.</p>' +
        '<label style="font-size:.85rem;color:#9fb3d9">Prova<select class="kc-in" id="kc-pv">' + D.tipos.map((t) => '<option value="' + esc(t.codigo) + '">' + esc(t.nome) + '</option>').join('') + '</select></label>' +
        '<label style="font-size:.85rem;color:#9fb3d9;display:block;margin-top:8px">Carga<select class="kc-in" id="kc-cg">' + [8, 12, 16, 20, 24, 28, 32].map((k) => '<option value="' + k + '"' + (k === 24 ? ' selected' : '') + '>' + k + ' kg</option>').join('') + '</select></label>' +
        '<label style="font-size:.85rem;color:#9fb3d9;display:block;margin-top:8px">Categoria<select class="kc-in" id="kc-ct">' + cats.map((c) => '<option>' + esc(c) + '</option>').join('') + '</select></label>' +
        '<div class="kc-btns"><button class="kc-btn" id="kc-sim" type="button">Incluir modalidade</button><button class="kc-btn sec" id="kc-nao" type="button">Cancelar</button></div>');
      $('kc-sim').onclick = () => res({ prova: $('kc-pv').value, carga_kg: +$('kc-cg').value, categorias: [{ nome: $('kc-ct').value, adicional: false }] });
      $('kc-nao').onclick = () => { fechaJ(); res(null); };
    });
    if (!ok) return;
    const pin = await pedePin('Incluir modalidade'); if (!pin) return;
    const juiz = await pedeJuiz(); if (!juiz) return;
    const dados = Object.assign({ id: uuid(), atleta_id: a.id }, ok);
    const F = lsGet(K_INC, []); F.push({ tipo: 'inscricao', dados, cadastrado_por: juiz, dispositivo_id: disp(), criado: Date.now(), enviado: false }); lsSet(K_INC, F);
    indexa(); SEL.inscricao_id = dados.id;
    movInput.value = insRotulo(dados); movInput.dispatchEvent(new Event('input', { bubbles: true }));
    toast('Modalidade incluída neste aparelho'); enviaPendentes(false);
  }
  let enviando = false;
  async function enviaPendentes(manual) {
    if (enviando) return;
    const F = lsGet(K_INC, []); if (!F.some((x) => !x.enviado)) return;
    if (!navigator.onLine) { if (manual) toast('Sem internet: as inclusões ficam guardadas no aparelho'); return; }
    if (!(pinMem && Date.now() < pinAte)) { if (!manual) return; const p = await pedePin('Enviar inclusões', 'Digite o PIN para enviar as inclusões pendentes.'); fechaJ(); if (!p) return; }
    enviando = true; let ok = 0, erro = null;
    try {
      const ordem = { equipe: 0, atleta: 1, arbitro: 2, inscricao: 3 };
      for (const x of F.filter((y) => !y.enviado).sort((a, b) => ordem[a.tipo] - ordem[b.tipo])) {
        try {
          const j = await rpc('contador_incluir', { pin: pinMem, tipo: x.tipo, dados: x.dados, cadastrado_por: x.cadastrado_por, dispositivo_id: x.dispositivo_id });
          if (j.ok) { x.enviado = true; x.enviado_em = Date.now(); ok++; }
          else if (j.erro === 'pin' || j.erro === 'bloqueado') { pinMem = null; erro = 'PIN recusado pelo banco'; break; }
          else { x.erro = j.erro; erro = 'O banco recusou uma inclusão (' + j.erro + ')'; }
        } catch (e) { erro = 'Falha ao enviar: ' + e.message; break; }
      }
    } finally { lsSet(K_INC, F); enviando = false; indexa(); }
    if (ok) { toast(ok + ' inclusão(ões) enviada(s) ao banco'); baixa(false); }
    if (erro && manual) toast(erro, 'err');
  }

  // ---------- flights ----------
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const plataformaAtual = () => { const v = (($('pista-start') || {}).value || '') || lsGet(K_PLAT, ''); return v ? +v : null; };
  function concluido(f, plat) {
    if (f.status === 'concluido') return true;
    try { return histLoad().some((p) => p.flight_id === f.id && (plat == null || p.pista === plat)); } catch (e) { return false; }
  }
  const hm = (h) => (h || '').slice(0, 5);
  const minutos = (f) => { const [h, m] = (f.horario || '00:00').split(':').map(Number); return h * 60 + m; };
  function linhaFlight(f, plat) {
    const fa = (f.atletas || []).find((x) => x.plataforma === plat) || null;
    const a = fa && D.atPorId.get(fa.atleta_id), i = fa && D.insPorId.get(fa.inscricao_id);
    const agora = new Date(), atrasado = f.dia === hojeISO() && minutos(f) + (f.duracao_min || 10) < agora.getHours() * 60 + agora.getMinutes();
    return { f, fa, a, i, atrasado };
  }
  function flightsHoje() {
    const plat = plataformaAtual();
    if (!plat) { janela('<h2>Flights</h2><p class="kc-sub">Escolha a plataforma deste aparelho primeiro.</p>' + seletorPlat() + '<div class="kc-btns"><button class="kc-btn sec" id="kc-x" type="button">Fechar</button></div>'); ligaPlat(flightsHoje); $('kc-x').onclick = fechaJ; return; }
    const hoje = D.flights.filter((f) => f.dia === hojeISO() && !concluido(f, plat) && (f.atletas || []).some((x) => x.plataforma === plat)).sort((a, b) => minutos(a) - minutos(b)).map((f) => linhaFlight(f, plat));
    const agoraMin = new Date().getHours() * 60 + new Date().getMinutes();
    const atuais = hoje.filter((l) => minutos(l.f) <= agoraMin), prox = hoje.filter((l) => minutos(l.f) > agoraMin).slice(0, 3);
    const lista = atuais.concat(prox);
    janela('<h2>Flights de hoje · Plataforma ' + plat + '</h2><p class="kc-sub">Só os que ainda não têm resultado neste aparelho. Atrasados ou em andamento primeiro.</p>' +
      (lista.length ? lista.map((l, k) => itemFlight(l, k)).join('') : '<p class="kc-sub">Nenhum flight pendente hoje para esta plataforma.</p>') +
      '<div class="kc-btns"><button class="kc-btn sec" id="kc-todos" type="button">Ver todos os flights</button><button class="kc-btn sec" id="kc-x" type="button">Fechar</button></div>');
    ov.querySelectorAll('.kc-item[data-k]').forEach((b) => { b.onclick = () => confirmaFlight(lista[+b.dataset.k], plat); });
    $('kc-todos').onclick = () => todosFlights(plat); $('kc-x').onclick = fechaJ;
  }
  function itemFlight(l, k) {
    return '<button class="kc-item' + (l.f.mock ? ' kb-mock' : '') + '" type="button" data-k="' + k + '"><span><strong>' + esc(l.f.nome || 'Flight ' + l.f.numero) + '</strong> · ' + esc(hm(l.f.horario)) + (l.atrasado ? '<span class="kc-tag atr">atrasado</span>' : '') + (l.f.mock ? MOCK_TAG : '') +
      '<small>' + esc(l.a ? l.a.nome : 'sem atleta nesta plataforma') + (l.i ? ' · ' + esc(insLongo(l.i)) : '') + '</small></span><span>›</span></button>';
  }
  function todosFlights(plat) {
    const dias = [...new Set(D.flights.map((f) => f.dia))].sort();
    janela('<h2>Todos os flights</h2><p class="kc-sub">Plataforma ' + plat + '. Concluídos aparecem marcados.</p>' + dias.map((d) => '<h3 style="margin:14px 0 4px;font-size:1rem">' + esc(new Date(d + 'T12:00').toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' })) + '</h3>' +
      D.flights.filter((f) => f.dia === d).sort((a, b) => minutos(a) - minutos(b)).map((f) => { const l = linhaFlight(f, plat); const k = D.flights.indexOf(f); return itemFlight(l, k).replace('data-k="' + k + '"', 'data-t="' + k + '"').replace('</strong>', '</strong>' + (concluido(f, plat) ? '<span class="kc-tag">concluído</span>' : '')); }).join('')).join('') +
      '<div class="kc-btns"><button class="kc-btn sec" id="kc-v" type="button">Voltar</button></div>');
    ov.querySelectorAll('.kc-item[data-t]').forEach((b) => { b.onclick = () => confirmaFlight(linhaFlight(D.flights[+b.dataset.t], plat), plat); });
    $('kc-v').onclick = flightsHoje;
  }
  function confirmaFlight(l, plat) {
    const a = l.a, i = l.i, arb = l.fa && D.arbitros.find((x) => x.id === l.fa.arbitro_id);
    const kv = [['Flight', (l.f.nome || 'Flight ' + l.f.numero)], ['Dia', new Date(l.f.dia + 'T12:00').toLocaleDateString('pt-BR')], ['Horário previsto', hm(l.f.horario)], ['Plataforma', plat],
      ['Atleta', a ? a.nome : '—'], ['Equipe', eqNome(a)], ['UF', a && a.uf], ['Sexo', a && a.sexo], ['Prova', i ? tipoNome(i.prova) : '—'], ['Categoria(s)', i ? catTxt(i) : ''], ['Carga', i && i.carga_kg ? i.carga_kg + ' kg' : ''],
      ['Classe de peso', a ? ([a.classe_10, a.classe_12_30].filter(Boolean).join(' / ')) : ''], ['Árbitro', arb ? arb.nome : '']].filter((x) => x[1]);
    janela('<h2>É este?</h2><p class="kc-sub">Confira antes de preencher. Nada foi preenchido ainda.</p><div class="kc-kv' + (l.f.mock ? ' kb-mock' : '') + '">' + kv.map((x) => '<span>' + esc(x[0]) + '</span><strong>' + esc(x[1]) + '</strong>').join('') + '</div>' + (l.f.mock ? '<p style="color:#ff8c00;font-size:.85rem;margin-top:8px">Flight fictício (mock), só para teste.</p>' : '') +
      '<div class="kc-btns"><button class="kc-btn" id="kc-sim" type="button"' + (a ? '' : ' disabled') + '>Sim, é este</button><button class="kc-btn sec" id="kc-outro" type="button">Escolher outro flight</button><button class="kc-btn sec" id="kc-man" type="button">Preencher manualmente</button></div>');
    $('kc-sim').onclick = () => {
      fechaJ();
      const at = $('athlete-start'), mv = $('mov-start'), ps = $('pista-start'), ar = $('arb-start');
      at.value = a.nome; at.dispatchEvent(new Event('input', { bubbles: true }));
      if (mv && i) { mv.value = insRotulo(i); mv.dispatchEvent(new Event('input', { bubbles: true })); }
      if (ps) { ps.value = String(plat); ps.dispatchEvent(new Event('change', { bubbles: true })); }
      if (ar && arb) { ar.value = arb.nome; ar.dispatchEvent(new Event('input', { bubbles: true })); }
      SEL.atleta_id = a.id; SEL.inscricao_id = i ? i.id : null; SEL.flight_id = l.f.id; SEL.origem = 'flight confirmado';
      toast('Preenchido pelo ' + (l.f.nome || 'flight ' + l.f.numero));
    };
    $('kc-outro').onclick = flightsHoje;
    $('kc-man').onclick = () => { fechaJ(); SEL.flight_id = null; SEL.origem = 'manual'; const at = $('athlete-start'); if (at) at.focus(); };
  }
  function seletorPlat() { return '<div style="display:flex;gap:6px;flex-wrap:wrap">' + [1, 2, 3, 4, 5, 6].map((n) => '<button class="kc-btn sec" type="button" data-p="' + n + '">' + n + '</button>').join('') + '</div>'; }
  function ligaPlat(depois) { ov.querySelectorAll('[data-p]').forEach((b) => { b.onclick = () => { const ps = $('pista-start'); if (ps) { ps.value = b.dataset.p; ps.dispatchEvent(new Event('change', { bubbles: true })); } depois(); }; }); }

  // plataforma fixa por aparelho + sugestão ao escolher a plataforma
  function ligaPlataforma() {
    const ps = $('pista-start'); if (!ps || ps.dataset.kc) return; ps.dataset.kc = '1';
    const fixa = lsGet(K_PLAT, ''); if (fixa && !ps.value) ps.value = fixa;
    const lab = ps.closest('label') || ps.parentNode;
    const box = document.createElement('label'); box.style.cssText = 'display:flex;gap:6px;align-items:center;font-size:12px;color:#9fb3d9;margin-top:4px';
    box.innerHTML = '<input type="checkbox" id="kc-fixa"' + (fixa ? ' checked' : '') + '> Este aparelho é sempre esta plataforma';
    lab.insertAdjacentElement('afterend', box);
    $('kc-fixa').onchange = (e) => { if (e.target.checked) { if (!ps.value) { e.target.checked = false; toast('Escolha a plataforma primeiro'); return; } lsSet(K_PLAT, ps.value); } else lsSet(K_PLAT, ''); };
    ps.addEventListener('change', (e) => {
      if (lsGet(K_PLAT, '') && $('kc-fixa').checked && ps.value) lsSet(K_PLAT, ps.value);
      if (!e.isTrusted || !ps.value) return;
      const plat = +ps.value, temHoje = D.flights.some((f) => f.dia === hojeISO() && !concluido(f, plat) && (f.atletas || []).some((x) => x.plataforma === plat));
      if (temHoje && !$('athlete-start').value.trim()) flightsHoje();
    });
  }

  // ---------- ligar o resultado ao cadastro ----------
  function ligaResultado() {
    const origBegin = window.beginCounter;
    if (typeof origBegin === 'function') window.beginCounter = function () {
      const r = origBegin.apply(this, arguments);
      try {
        const pid = (typeof provaId !== 'undefined') ? provaId : null, nome = (typeof athlete !== 'undefined') ? athlete : '';
        const a = (SEL.atleta_id && D.atPorId.get(SEL.atleta_id)) || atletaPorNome(nome);
        if (pid && a && norm(a.nome) === norm(nome)) {
          let ins = SEL.inscricao_id ? D.insPorId.get(SEL.inscricao_id) : null;
          if (!ins) { const mv = norm((typeof movimento !== 'undefined') ? movimento : ''); ins = insDe(a.id).find((i) => norm(insRotulo(i)) === mv) || (insDe(a.id).length === 1 ? insDe(a.id)[0] : null); }
          const V = lsGet(K_VINC, {}); V[pid] = { atleta_id: a.id, inscricao_id: ins ? ins.id : null, flight_id: SEL.flight_id, origem: SEL.flight_id ? 'flight confirmado' : 'manual', mock: !!a.mock };
          const ks = Object.keys(V); if (ks.length > 300) ks.slice(0, ks.length - 300).forEach((k) => delete V[k]);
          lsSet(K_VINC, V);
        }
      } catch (e) {}
      return r;
    };
    const origBuild = window.buildProva;
    if (typeof origBuild === 'function') window.buildProva = function (extra) {
      const p = origBuild.apply(this, arguments);
      try { const v = lsGet(K_VINC, {})[p.id]; if (v) { p.atleta_id = v.atleta_id; p.inscricao_id = v.inscricao_id; p.flight_id = v.flight_id; p.origem = v.origem; } } catch (e) {}
      return p;
    };
    const origCorpo = window.corpoProva;
    if (typeof origCorpo === 'function') window.corpoProva = function (p) {
      const b = origCorpo.apply(this, arguments);
      if (p && p.atleta_id) { b.atleta_id = p.atleta_id; if (p.inscricao_id) b.inscricao_id = p.inscricao_id; if (p.flight_id) b.flight_id = p.flight_id; if (p.origem) b.origem = p.origem; }
      return b;
    };
    const origEnvia = window.envia;   // se o banco ainda não tem as colunas novas, reenvia sem elas
    if (typeof origEnvia === 'function') window.envia = async function (tabela, p) {
      let r = await origEnvia.apply(this, arguments);
      if (r && r.fatal && p && p.atleta_id) { const q = Object.assign({}, p); delete q.atleta_id; delete q.inscricao_id; delete q.flight_id; delete q.origem; r = await origEnvia.call(this, tabela, q); }
      return r;
    };
  }

  // ---------- ligar os campos ----------
  function ligaCampos() {
    const at = $('athlete-start'), mv = $('mov-start'), ar = $('arb-start');
    const atS = $('athlete-summary'), mvS = $('mov-summary'), arS = $('arb-summary');
    const cfgAtleta = (mvIn) => ({ itens: itensAtleta, vazio: 'Nenhum atleta com esse nome ou equipe.', novoNome: 'atleta', novo: (t, i) => incluir('atleta', t, i, { mov: mvIn }), escolhe: (x, i) => escolheAtleta(x, i, mvIn), digitou: atletaDigitou });
    const cfgProva = (atIn) => ({ itens: () => itensProva(atIn), vazio: 'Escolha o atleta para ver as inscrições dele.', novoNome: 'modalidade', novo: (t, i) => { if (SEL.atleta_id && D.atPorId.get(SEL.atleta_id)) novaInscricao(t, i); }, escolhe: (x) => { if (x.obj) SEL.inscricao_id = x.obj.id; } });
    const cfgArb = { itens: itensArbitro, vazio: 'Nenhum árbitro com esse nome.', novoNome: 'árbitro', novo: (t, i) => incluir('arbitro', t, i) };
    combo(at, cfgAtleta(mv)); combo(mv, cfgProva(at)); combo(ar, cfgArb);
    combo(atS, cfgAtleta(mvS)); combo(mvS, cfgProva(atS)); combo(arS, { itens: itensArbitro, vazio: 'Nenhum árbitro com esse nome.' });
    const filtro = () => { try { onFiltro(); } catch (e) {} };
    combo($('hf-mov'), { itens: () => itensProva(null), escolhe: filtro });
    combo($('hf-arb'), { itens: itensArbitro, escolhe: filtro });
    combo($('xl-mov'), { itens: () => itensProva(null) });
    ligaPlataforma();
  }

  // ---------- início ----------
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
  escolheBase(); ligaCampos(); ligaResultado();
  baixa(false); setInterval(() => baixa(false), 5 * 60000);
  window.addEventListener('online', () => { baixa(false); enviaPendentes(false); });
  window.kbCad = { baixa, flightsHoje, enviaPendentes, sel: SEL, dados: () => D, origem: () => ORIGEM };
})();
