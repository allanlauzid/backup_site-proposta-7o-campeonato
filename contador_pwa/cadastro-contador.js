/* cadastro-contador.js — Lista de atletas, inscrições, árbitros e flights no Contador (CONBRAKS 2026)
 *  - Campos com lista que filtra ao digitar (Atleta, Prova, Árbitro e filtros do histórico), no lugar dos <datalist>.
 *  - Lista embutida no HTML (#kb-atletas) + cópia baixada do banco (contador_lista); usa a mais nova e mostra a versão.
 *  - v2 (17/11): programação do PDF na tela inicial — Dia 1/2/3, bateria e horário (a sugerida no topo) e plataforma;
 *    ao escolher a plataforma, preenche atleta, prova, categoria, idade (2026 − ano de nascimento) e árbitro da escala.
 *  - Nome, movimento ou árbitro digitado fora da lista: a contagem leva o texto ao banco; o nome fica só na lista deste aparelho.
 *  - Sem inclusão com PIN no banco, sem "plataforma fixa" e sem a lista antiga de códigos de prova.
 *  - O resultado passa a levar atleta_id, inscricao_id, flight_id e origem.
 *  - Itens fictícios (origem 'mock') aparecem com contorno pontilhado laranja.
 * Não altera a contagem. Usa do contador: NUVEM, showToast, deviceId, novoUUID, histLoad, beginCounter, buildProva, corpoProva, envia, onFiltro.
 */
(function () {
  'use strict';
  if (window.kbCad) return;
  const K_CACHE = 'kb_lista_v1', K_VINC = 'kb_vinculos_v1', K_LOCAL = 'kb_nomes_locais_v1';
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
  .kp{display:flex;flex-direction:column;align-items:center;gap:6px;margin:0 0 8px;cursor:default;width:min(460px,92vw)}
  .kp[hidden]{display:none}
  .kp-dias{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;width:100%}
  .kp-dia{appearance:none;border:2px solid rgba(255,204,0,.45);background:rgba(0,0,0,.45);color:#fff;border-radius:8px;padding:6px 4px;cursor:pointer;font:inherit;line-height:1.1}
  .kp-dia strong{display:block;font-size:1rem;letter-spacing:.5px}.kp-dia small{display:block;font-size:.72rem;color:rgba(255,255,255,.7)}
  .kp-dia.on{background:#ffcc00;color:#000;border-color:#ffcc00}.kp-dia.on small{color:#333}
  .kp-lab{font-size:.75rem;color:rgba(255,255,255,.75);text-transform:uppercase;letter-spacing:1px;font-weight:700;margin-top:2px}
  .kp-bat{width:100%;padding:8px 10px;font:600 1rem system-ui,sans-serif;border-radius:6px;border:2px solid rgba(255,204,0,.5);background:rgba(0,0,0,.55);color:#fff}
  .kp-bat option{background:#0b1a3d;color:#fff}
  .kp-plats{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
  .kp-plat{appearance:none;width:46px;height:42px;border-radius:8px;border:2px solid rgba(255,204,0,.5);background:rgba(0,0,0,.45);color:#fff;font:800 1.15rem system-ui;cursor:pointer;position:relative}
  .kp-plat.on{background:#ffcc00;color:#000;border-color:#ffcc00}.kp-plat.feito::after{content:'✓';position:absolute;top:-6px;right:-6px;background:#1f8f4a;color:#fff;border-radius:50%;width:16px;height:16px;font:700 11px/16px system-ui}
  .kp-info{width:100%;color:#fff;text-align:left}
  .kp-info:empty{display:none}
  /* plataformas no centro; o Avançar num espaço próprio à direita */
  .kp-linha{display:grid;grid-template-columns:1fr auto 1fr;align-items:center;column-gap:16px;width:100%}
  .kp-linha .kp-plats{grid-column:2} .kp-linha .kp-avancar{grid-column:3;justify-self:start}
  @media (max-width:520px){.kp-linha{grid-template-columns:1fr;row-gap:10px}.kp-linha .kp-plats,.kp-linha .kp-avancar{grid-column:1;justify-self:center}}
  .kp-vazio{color:rgba(255,255,255,.5);font-size:.85rem;padding:12px 0}
  .kp-avancar{appearance:none;display:inline-flex;align-items:center;gap:6px;height:42px;padding:0 22px 0 16px;border:0;background:#ffcc00;color:#001538;font:900 1rem system-ui,sans-serif;text-transform:uppercase;letter-spacing:.05em;cursor:pointer;
    clip-path:polygon(0 0,calc(100% - 18px) 0,100% 50%,calc(100% - 18px) 100%,0 100%);border-radius:6px 0 0 6px;transition:background-color .35s ease,color .35s ease,opacity .35s ease}
  .kp-avancar svg{width:20px;height:20px}
  .kp-avancar:hover:not(:disabled){background:#ffd633}
  .kp-avancar:disabled{background:#9aa1ad;color:#1f2633;opacity:.32;cursor:not-allowed}
  .kp-avancar.kp-liga{animation:kp-liga .7s cubic-bezier(.22,1,.36,1)}
  @keyframes kp-liga{0%{transform:translateX(-6px) scale(.94);filter:brightness(.7)}45%{transform:translateX(5px) scale(1.06);filter:brightness(1.25)}70%{transform:translateX(-2px)}100%{transform:none;filter:none}}
  .kp-sensor{appearance:none;display:inline-flex;align-items:center;justify-content:center;width:64px;height:64px;margin:0 0 10px;padding:0;border:2px solid rgba(255,79,115,.7);border-radius:16px;background:rgba(0,12,40,.85);cursor:pointer;transition:transform .2s ease,background-color .2s ease}
  .kp-sensor svg{width:48px;height:48px;display:block} .kp-sensor:hover{background:#3a0d1a;transform:translateY(-2px)} .kp-sensor:focus-visible{outline:3px solid #ffcc00;outline-offset:3px}
  .kpc-box{background:rgba(0,12,40,.82);border:3px solid #ffcc00;border-radius:12px;padding:10px 14px}
  .kpc-top{font:700 .8rem system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#ffcc00}
  .kpc-nome{font:800 1.7rem/1.05 system-ui,sans-serif;color:#fff;margin:4px 0 2px;overflow-wrap:anywhere}
  .kpc-prova{font:700 1.05rem system-ui,sans-serif;color:#fff}
  .kpc-lin{display:flex;flex-wrap:wrap;gap:4px 18px;margin-top:4px;font:600 1.15rem system-ui,sans-serif;color:#fff}
  .kpc-lin b{display:block;font:700 .72rem system-ui,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:#ffcc00}
  .kp-lado{display:none}
  @media (min-width:900px){
    .kp-lado{display:flex;flex-direction:column;align-items:flex-start;position:absolute;left:3vw;bottom:calc(var(--status-total, 40px) + 5vh);width:min(26vw,420px);z-index:6;cursor:default}
    .kp-lado[hidden]{display:none}
    .kp-lado .kpc-box{width:100%;box-sizing:border-box;padding:22px 24px;border-radius:14px;box-shadow:0 18px 40px rgba(0,0,0,.45)}
    .kp-lado .kpc-nome{font-size:clamp(2.1rem,2.9vw,3.3rem)} .kp-lado .kpc-prova{font-size:1.35rem;margin-top:6px} .kp-lado .kpc-lin{font-size:1.6rem;gap:8px 28px;margin-top:14px} .kp-lado .kpc-lin b{font-size:.85rem}
    .kp-lado .kp-sensor{width:76px;height:76px;border-radius:18px} .kp-lado .kp-sensor svg{width:58px;height:58px}
    .kp-info{display:none}
  }
  .kp-entra .kpc-box{animation:kp-quadro .5s cubic-bezier(.22,1,.36,1) both}
  .kp-entra .kp-sensor{animation:kp-pop .55s .18s cubic-bezier(.34,1.56,.64,1) both}
  .kp-entra .kpc-nome{animation:kp-sobe .45s .1s cubic-bezier(.22,1,.36,1) both}
  @keyframes kp-quadro{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
  @media (min-width:900px){ @keyframes kp-quadro{from{opacity:0;transform:translateX(-26px)}to{opacity:1;transform:none}} }
  @keyframes kp-pop{0%{opacity:0;transform:scale(.4) rotate(-12deg)}100%{opacity:1;transform:none}}
  @keyframes kp-sobe{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
  .kp-plat{transition:background-color .2s ease,color .2s ease,transform .15s ease} .kp-plat:active{transform:scale(.94)}
  .kp-plats.entra .kp-plat{animation:kp-sobe .35s cubic-bezier(.22,1,.36,1) both} .kp-plats.entra .kp-plat:nth-child(2){animation-delay:.04s} .kp-plats.entra .kp-plat:nth-child(3){animation-delay:.08s} .kp-plats.entra .kp-plat:nth-child(4){animation-delay:.12s} .kp-plats.entra .kp-plat:nth-child(5){animation-delay:.16s} .kp-plats.entra .kp-plat:nth-child(6){animation-delay:.2s}
  @media (prefers-reduced-motion:reduce){.kp-entra .kpc-box,.kp-entra .kp-sensor,.kp-entra .kpc-nome,.kp-avancar.kp-liga,.kp-plats.entra .kp-plat{animation:none}}
  .kp.kp-falta .kp-plats{animation:kp-shake .45s ease} .kp.kp-falta .kp-lab{color:#ff8a8a}
  @keyframes kp-shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-8px)}50%{transform:translateX(8px)}75%{transform:translateX(-4px)}}
  `;
  document.head.appendChild(st);

  // ---------- dados ----------
  function embutida() { try { const el = $('kb-atletas'); return el ? JSON.parse(el.textContent) : null; } catch (e) { return null; } }
  const vazia = { versao: null, equipes: [], tipos_prova: [], atletas: [], inscricoes: [], arbitros: [], flights: [], premiacoes: [] };
  let BASE = vazia, ORIGEM = 'nenhuma';
  function escolheBase() {
    const e = embutida(), c = lsGet(K_CACHE, null);
    const te = e && e.versao ? Date.parse(e.versao) : 0, tc = c && c.versao ? Date.parse(c.versao) : 0;
    if (tc > te) { BASE = c; ORIGEM = 'baixada'; } else if (e) { BASE = e; ORIGEM = 'embutida'; } else if (c) { BASE = c; ORIGEM = 'baixada'; } else { BASE = vazia; ORIGEM = 'nenhuma'; }
    indexa();
  }
  let D = null;   // dados mesclados + índices
  function indexa() {
    const at = (BASE.atletas || []).slice(), ar = (BASE.arbitros || []).slice(), eqs = (BASE.equipes || []).slice(), ins = (BASE.inscricoes || []).slice();
    const eqPorId = new Map(eqs.map((e) => [e.id, e]));
    at.sort((a, b) => norm(a.nome).localeCompare(norm(b.nome)));
    ar.sort((a, b) => norm(a.nome).localeCompare(norm(b.nome)));
    D = { atletas: at, arbitros: ar, equipes: eqs, inscricoes: ins, tipos: BASE.tipos_prova || [], flights: BASE.flights || [], premiacoes: BASE.premiacoes || [], eqPorId,
      atPorId: new Map(at.map((a) => [a.id, a])), insPorId: new Map(ins.map((i) => [i.id, i])) };
    rotuloVersao();
    try { if (typeof montaProgramacao === 'function' && $('athlete-start')) montaProgramacao(); } catch (e) {}
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
      (atMock || flMock ? MOCK_TAG : '');
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
        (q && !todos.some((x) => norm(x.label) === q) ? '<div class="kc-novo">Nome fora da lista: “' + esc(input.value.trim()) + '” fica só neste aparelho</div>' : '');
      ul.querySelectorAll('.kc-opt').forEach((b) => { b.onmousedown = (e) => e.preventDefault(); b.onclick = (e) => { e.stopPropagation(); escolhe(+b.dataset.i); }; });
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
        else if (aberto && sel >= 0 && q) { e.preventDefault(); e.stopPropagation(); escolhe(sel); }
      }
    });
    return { abre, fecha };
  }

  // ---------- seleção atual (para ligar o resultado ao cadastro) ----------
  const SEL = { atleta_id: null, inscricao_id: null, flight_id: null, plataforma: null, origem: 'manual', idade: null };
  const atletaPorNome = (nome) => { const n = norm(nome); const l = D.atletas.filter((a) => norm(a.nome) === n); return l.length === 1 ? l[0] : null; };
  function insDe(aid) { return D.inscricoes.filter((i) => i.atleta_id === aid); }
  // nomes digitados fora da lista: ficam só neste aparelho (a contagem leva o nome digitado ao banco)
  const LOC = () => lsGet(K_LOCAL, { atletas: [], movimentos: [], arbitros: [] });
  function guardaLocal(tipo, nome) {
    nome = String(nome || '').replace(/\s+/g, ' ').trim(); if (nome.length < 2) return;
    const L = LOC(); L[tipo] = L[tipo] || [];
    if (!L[tipo].some((x) => norm(x) === norm(nome))) { L[tipo].push(nome); if (L[tipo].length > 300) L[tipo].shift(); lsSet(K_LOCAL, L); }
  }
  // provas da programação (como estão no PDF, com "10 min" no lugar de 10')
  const provasDoAtleta = (aid) => [...new Set(D.flights.flatMap((f) => (f.atletas || []).filter((x) => x.atleta_id === aid).map((x) => x.prova)).filter(Boolean))];
  const todasProvas = () => [...new Set(D.flights.flatMap((f) => (f.atletas || []).map((x) => x.prova)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));

  const itensAtleta = () => {
    const r = D.atletas.map((a) => ({ label: a.nome, sub: [eqNome(a), a.uf].filter(Boolean).join(' · ') + (provasDoAtleta(a.id).length ? ' · ' + provasDoAtleta(a.id).join(', ') : ''), busca: eqNome(a) + ' ' + (a.apelido || ''), obj: a, mock: a.mock }));
    const vistos = new Set(r.map((x) => norm(x.label)));
    LOC().atletas.forEach((n) => { if (!vistos.has(norm(n))) { vistos.add(norm(n)); r.push({ label: n, sub: 'digitado neste aparelho' }); } });
    return r;
  };
  function itensProva(campoAtleta) {
    const a = atletaPorNome((campoAtleta && campoAtleta.value) || '') || (SEL.atleta_id && D.atPorId.get(SEL.atleta_id));
    const r = [], vistos = new Set();
    const add = (label, sub) => { if (label && !vistos.has(norm(label))) { vistos.add(norm(label)); r.push({ label, sub }); } };
    if (a) provasDoAtleta(a.id).forEach((p) => add(p, 'prova deste atleta'));
    todasProvas().forEach((p) => add(p, ''));
    LOC().movimentos.forEach((p) => add(p, 'digitado neste aparelho'));
    return r;
  }
  function itensArbitro() {
    const r = D.arbitros.map((a) => ({ label: a.nome, sub: '', obj: a, mock: a.mock })), vistos = new Set(r.map((x) => norm(x.label)));
    LOC().arbitros.forEach((n) => { if (!vistos.has(norm(n))) { vistos.add(norm(n)); r.push({ label: n, sub: 'digitado neste aparelho' }); } });
    return r;
  }
  function escolheAtleta(x, input, movInput) {
    if (!x.obj) { SEL.atleta_id = null; return; }
    SEL.atleta_id = x.obj.id; SEL.inscricao_id = null; SEL.flight_id = null; SEL.origem = 'manual';
    const l = provasDoAtleta(x.obj.id);
    if (movInput && l.length === 1) { movInput.value = l[0]; movInput.dispatchEvent(new Event('input', { bubbles: true })); }
  }
  // nome trocado à mão: a bateria e a plataforma continuam valendo; só o vínculo com o cadastro muda
  function atletaDigitou(input) { const a = atletaPorNome(input.value); if (!a || a.id !== SEL.atleta_id) { SEL.atleta_id = a ? a.id : null; SEL.inscricao_id = null; if (!SEL.flight_id) SEL.origem = 'manual'; } try { cartao(); } catch (e) {} }

  // ---------- programação: dia, bateria e plataforma ----------
  const DIAS = [{ n: 1, dia: '2026-11-20', rot: 'Dia 1', sub: 'sex 20/11' }, { n: 2, dia: '2026-11-21', rot: 'Dia 2', sub: 'sáb 21/11' }, { n: 3, dia: '2026-11-22', rot: 'Dia 3', sub: 'dom 22/11' }];
  const hojeISO = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const hm = (h) => (h || '').slice(0, 5);
  const minutos = (f) => { const [h, m] = hm(f.horario || '00:00').split(':').map(Number); return h * 60 + m; };
  const diaN = (f) => f.dia_n || (DIAS.find((d) => d.dia === f.dia) || {}).n || null;
  const baterias = (n) => D.flights.filter((f) => diaN(f) === n).sort((a, b) => minutos(a) - minutos(b) || a.numero - b.numero);
  function concluido(f, plat) { try { return histLoad().some((p) => p.flight_id === f.id && (plat == null || p.pista === plat)); } catch (e) { return false; } }
  // bateria sugerida: a que está acontecendo (início ≤ agora < início + duração + 5 min) ou a próxima; fora do dia, a 1ª
  function sugerida(n) {
    const l = baterias(n); if (!l.length) return null;
    const dd = DIAS.find((d) => d.n === n); if (!dd || dd.dia !== hojeISO()) return l[0];
    const agora = new Date().getHours() * 60 + new Date().getMinutes();
    return l.find((f) => agora < minutos(f) + (f.duracao_min || 10) + 5) || l[l.length - 1];
  }
  const P = { dia: null, flight: null, plat: null };
  let progEl = null;
  // 18/11 (v21): só dia, bateria e plataforma na tela inicial, nada pré-selecionado; seta "Avançar" ao lado das plataformas
  function montaProgramacao() {
    document.body.classList.toggle('kb-prog', !!D.flights.length);
    if (!D.flights.length) { if (progEl) progEl.hidden = true; return; }
    const campo = $('athlete-start'); const alvo = campo && campo.closest('.athlete-field'); if (!alvo) return;
    if (!progEl) { progEl = document.createElement('div'); progEl.className = 'kp'; progEl.id = 'kp'; alvo.parentNode.insertBefore(progEl, alvo); progEl.addEventListener('click', (e) => e.stopPropagation()); }
    progEl.hidden = false;
    if (P.flight) P.flight = D.flights.find((f) => f.id === P.flight.id) || null;   // a lista pode ter sido baixada de novo (escala nova)
    if (P.flight && diaN(P.flight) !== P.dia) { P.flight = null; P.plat = null; }
    const l = P.dia ? baterias(P.dia) : [], sug = P.dia ? sugerida(P.dia) : null;
    const ord = sug ? [sug].concat(l.filter((f) => f !== sug)) : l;
    const rot = (f) => 'Bateria ' + f.numero + ' · ' + hm(f.horario) + (concluido(f) ? ' ✓' : '');
    const hoje = DIAS.find((d) => d.dia === hojeISO());
    const novaBat = !!P.flight && P.flight.id !== ultimaBat; ultimaBat = P.flight ? P.flight.id : null;   // as plataformas só entram animadas quando a bateria muda
    progEl.innerHTML =
      '<div class="kp-dias" role="radiogroup" aria-label="Dia">' + DIAS.map((d) => '<button type="button" role="radio" class="kp-dia' + (d.n === P.dia ? ' on' : '') + '" aria-checked="' + (d.n === P.dia) + '" data-d="' + d.n + '"><strong>' + d.rot + '</strong><small>' + d.sub + (hoje && hoje.n === d.n ? ' · hoje' : '') + '</small></button>').join('') + '</div>' +
      '<label class="kp-lab" for="kp-bat">Bateria e horário</label><select id="kp-bat" class="kp-bat"' + (P.dia ? '' : ' disabled') + '>' +
        '<option value="">' + (P.dia ? 'Escolha a bateria' : 'Escolha o dia primeiro') + '</option>' +
        ord.map((f, i) => '<option value="' + f.id + '"' + (P.flight && f.id === P.flight.id ? ' selected' : '') + '>' + (i === 0 && f === sug ? '★ ' : '') + esc(rot(f)) + (i === 0 && f === sug ? (hoje && hoje.n === P.dia ? ' (agora)' : ' (primeira)') : '') + '</option>').join('') + '</select>' +
      '<div class="kp-lab">Plataforma</div><div class="kp-linha"><div class="kp-plats' + (novaBat ? ' entra' : '') + '" role="radiogroup" aria-label="Plataforma">' +
        (P.flight ? (P.flight.atletas || []).map((x) => '<button type="button" role="radio" class="kp-plat' + (P.plat === x.plataforma ? ' on' : '') + (concluido(P.flight, x.plataforma) ? ' feito' : '') + '" aria-checked="' + (P.plat === x.plataforma) + '" data-p="' + x.plataforma + '" title="' + esc(x.nome || '') + '">' + x.plataforma + '</button>').join('') : '<span class="kp-vazio">escolha a bateria</span>') + '</div>' +
        '<button type="button" class="kp-avancar" id="kp-avancar" disabled aria-label="Avançar para a contagem"><span>Avançar</span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h13M12 5l7 7-7 7"/></svg></button></div>' +
      '<div class="kp-info" id="kp-info" aria-live="polite"></div>';
    progEl.querySelectorAll('.kp-dia').forEach((b) => { b.onclick = () => { P.dia = +b.dataset.d; P.flight = null; P.plat = null; limpaAtleta(); montaProgramacao(); }; });
    $('kp-bat').onchange = (e) => { P.flight = D.flights.find((f) => f.id === e.target.value) || null; P.plat = null; limpaAtleta(); montaProgramacao(); };
    progEl.querySelectorAll('.kp-plat').forEach((b) => { b.onclick = () => preenche(+b.dataset.p); /* tocar de novo recarrega a programação (ex.: escala nova) */ });
    $('kp-avancar').onclick = (e) => { e.stopPropagation(); if (!e.currentTarget.disabled) startCounter(); };
    infoProg();
  }
  let ultimaBat = null;
  function limpaAtleta() {   // trocar dia ou bateria apaga o atleta escolhido antes
    ['athlete-start', 'mov-start', 'arb-start', 'cat-start', 'idade-start'].forEach((id) => { const e = $(id); if (e) e.value = ''; });
    const ps = $('pista-start'); if (ps) ps.value = '';
    SEL.atleta_id = null; SEL.inscricao_id = null; SEL.flight_id = null; SEL.idade = null;
  }
  // quadro grande à esquerda (computador) / abaixo das plataformas (celular), com o botão do sensor acima
  let cardEl = null, ultimoCartao = '', avLiberado = false;
  const BOTAO_SENSOR = '<button type="button" class="kp-sensor" data-sensor title="Configurar o sensor cardíaco" aria-label="Configurar o sensor cardíaco"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 43.5 7.6 27.6C2.4 22.6 2.6 14.2 8 9.6c4.6-3.9 11.6-3.2 15.4 1.6L24 12l.6-.8c3.8-4.8 10.8-5.5 15.4-1.6 5.4 4.6 5.6 13 .4 18L24 43.5z" fill="#ff4f73" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/><path d="M18.6 18.2 29.4 27.6 24 32.4V12.2l5.4 4.8-10.8 9.4" fill="none" stroke="#fff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg></button>';
  function cartao() {
    const scr = $('sponsors-screen');
    if (!cardEl && scr) { cardEl = document.createElement('aside'); cardEl.className = 'kp-lado'; cardEl.id = 'kp-card'; cardEl.setAttribute('aria-live', 'polite'); scr.appendChild(cardEl); cardEl.addEventListener('click', (e) => e.stopPropagation()); }
    const x = P.flight && P.plat && (P.flight.atletas || []).find((y) => y.plataforma === P.plat);
    const v = (id) => (($(id) || {}).value || '').trim();
    const box = x ? '<div class="kpc-box"><div class="kpc-top">Bateria ' + P.flight.numero + ' · ' + esc(hm(P.flight.horario)) + ' · Plataforma ' + P.plat + '</div>' +
        '<div class="kpc-nome">' + esc(v('athlete-start') || '—') + '</div>' +
        '<div class="kpc-prova">' + esc(v('mov-start')) + '</div>' +
        '<div class="kpc-lin"><span><b>Categoria</b>' + esc(v('cat-start') || '—') + (x.categoria_peso ? ' · ' + esc(x.categoria_peso) : '') + '</span><span><b>Idade</b>' + (v('idade-start') ? esc(v('idade-start')) + ' anos' : '—') + '</span></div></div>' : '';
    const chave = x ? P.flight.id + '|' + P.plat + '|' + v('athlete-start') : '';
    const novo = chave !== ultimoCartao; ultimoCartao = chave;   // anima só quando o atleta muda (não a cada redesenho)
    if (cardEl) { cardEl.innerHTML = x ? BOTAO_SENSOR + box : ''; cardEl.hidden = !x; cardEl.classList.toggle('kp-entra', !!x && novo); }
    const el = $('kp-info'); if (el) { el.innerHTML = x ? BOTAO_SENSOR + box : ''; el.classList.toggle('cheio', !!x); el.classList.toggle('kp-entra', !!x && novo); }
    if (novo && x) [cardEl, el].forEach((c) => { if (c) { c.classList.remove('kp-entra'); void c.offsetWidth; c.classList.add('kp-entra'); } });
    document.querySelectorAll('[data-sensor]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); try { kbH1Abrir(); } catch (er) {} }; });
    if (x && progEl) progEl.classList.remove('kp-falta');
    const go = $('btn-go'); if (go && D.flights.length) { go.disabled = !x; }
    const av = $('kp-avancar'); if (av) { av.disabled = !x; av.title = x ? 'Avançar para a contagem' : 'Escolha o dia, a bateria e a plataforma';
      if (x && !avLiberado) { av.classList.remove('kp-liga'); void av.offsetWidth; av.classList.add('kp-liga'); } else if (x) av.classList.add('kp-ligado');
      avLiberado = !!x; }
  }
  const infoProg = cartao;
  function preenche(plat) {
    const f = P.flight, x = f && (f.atletas || []).find((y) => y.plataforma === plat); if (!x) return;
    P.plat = plat;
    const at = $('athlete-start'), mv = $('mov-start'), ps = $('pista-start'), ar = $('arb-start');
    const arb = x.arbitro_id && D.arbitros.find((a) => a.id === x.arbitro_id);
    if (at) { at.value = x.nome || x.nome_programacao || ''; at.dispatchEvent(new Event('input', { bubbles: true })); at.classList.remove('invalid'); const er = $('athlete-err'); if (er) er.hidden = true; }
    if (mv) { mv.value = x.prova || ''; mv.dispatchEvent(new Event('input', { bubbles: true })); }
    if (ps) { ps.value = String(plat); ps.dispatchEvent(new Event('change', { bubbles: true })); }
    if (ar) { ar.value = arb ? arb.nome : ''; ar.dispatchEvent(new Event('input', { bubbles: true })); }
    const ct = $('cat-start'), ia = $('idade-start');
    if (ct) ct.value = x.categoria || ''; if (ia) ia.value = x.idade != null ? String(x.idade) : '';
    SEL.atleta_id = x.atleta_id || null; SEL.inscricao_id = x.inscricao_id || null; SEL.flight_id = f.id; SEL.plataforma = plat; SEL.origem = 'programacao'; SEL.idade = x.idade != null ? x.idade : null;
    try { if (typeof atualizaResumoForm === 'function') atualizaResumoForm(); } catch (e) {}
    montaProgramacao();
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
          if (!ins && insDe(a.id).length === 1) ins = insDe(a.id)[0];
          const V = lsGet(K_VINC, {}); V[pid] = Object.assign(V[pid] || {}, { atleta_id: a.id, inscricao_id: ins ? ins.id : null, flight_id: SEL.flight_id, origem: SEL.flight_id ? 'programacao' : 'manual', mock: !!a.mock });
          const ks = Object.keys(V); if (ks.length > 300) ks.slice(0, ks.length - 300).forEach((k) => delete V[k]);
          lsSet(K_VINC, V);
        }
        if (pid) { const V = lsGet(K_VINC, {}); const ct = ($('cat-start') || {}).value || '', ia = parseInt(($('idade-start') || {}).value, 10);
          V[pid] = Object.assign(V[pid] || {}, { categoria: ct.trim() || null, idade: Number.isFinite(ia) ? ia : null, bateria: P.flight ? P.flight.numero : null, dia_n: P.flight ? diaN(P.flight) : null }); lsSet(K_VINC, V); }
        // nomes digitados fora da lista: só neste aparelho
        if (nome && !atletaPorNome(nome)) guardaLocal('atletas', nome);
        const mv = (typeof movimento !== 'undefined') ? movimento : '', ab = (typeof arbitro !== 'undefined') ? arbitro : '';
        if (mv && !todasProvas().some((p) => norm(p) === norm(mv))) guardaLocal('movimentos', mv);
        if (ab && !D.arbitros.some((x) => norm(x.nome) === norm(ab))) guardaLocal('arbitros', ab);
      } catch (e) {}
      return r;
    };
    const origReset = window.concluirReset;
    if (typeof origReset === 'function') window.concluirReset = function () { const r = origReset.apply(this, arguments); try { P.dia = null; P.plat = null; P.flight = null; SEL.atleta_id = null; SEL.flight_id = null; SEL.idade = null; montaProgramacao(); } catch (e) {} return r; };
    const origBuild = window.buildProva;
    if (typeof origBuild === 'function') window.buildProva = function (extra) {
      const p = origBuild.apply(this, arguments);
      try { const v = lsGet(K_VINC, {})[p.id]; if (v) { if (v.atleta_id) { p.atleta_id = v.atleta_id; p.inscricao_id = v.inscricao_id; p.flight_id = v.flight_id; p.origem = v.origem; } if (v.categoria) p.categoria = v.categoria; if (v.idade != null) p.idade = v.idade; if (v.bateria) { p.bateria = v.bateria; p.dia_n = v.dia_n; } } } catch (e) {}
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
    const cfgAtleta = (mvIn) => ({ itens: itensAtleta, vazio: 'Nenhum atleta com esse nome ou equipe.', escolhe: (x, i) => escolheAtleta(x, i, mvIn), digitou: atletaDigitou });
    const cfgProva = (atIn) => ({ itens: () => itensProva(atIn), vazio: 'Nenhuma prova com esse nome.' });
    const cfgArb = { itens: itensArbitro, vazio: 'Nenhum árbitro com esse nome.' };
    combo(at, cfgAtleta(mv)); combo(mv, cfgProva(at)); combo(ar, cfgArb);
    combo(atS, cfgAtleta(mvS)); combo(mvS, cfgProva(atS)); combo(arS, { itens: itensArbitro, vazio: 'Nenhum árbitro com esse nome.' });
    const filtro = () => { try { onFiltro(); } catch (e) {} };
    combo($('hf-mov'), { itens: () => itensProva(null), escolhe: filtro });
    combo($('hf-arb'), { itens: itensArbitro, escolhe: filtro });
    combo($('xl-mov'), { itens: () => itensProva(null) });
    ['cat-start', 'idade-start', 'mov-start', 'athlete-start'].forEach((id) => { const e = $(id); if (e) e.addEventListener('input', cartao); });
    // Continuar (toque na tela, Espaço/Enter ou botão) só depois de dia, bateria e plataforma
    const origStart = window.startCounter;
    if (typeof origStart === 'function') window.startCounter = function (ev) {
      try { if (!(ev && typeof extraOpen !== 'undefined' && extraOpen) && D.flights.length && !P.plat) {
        if (progEl) { progEl.classList.remove('kp-falta'); void progEl.offsetWidth; progEl.classList.add('kp-falta'); }
        try { showToast('Escolha o dia, a bateria e a plataforma para continuar', 'err'); } catch (e) {}
        return; } } catch (e) {}
      return origStart.apply(this, arguments);
    };
    montaProgramacao();
    setInterval(() => { try { if (!P.plat && document.activeElement !== $('kp-bat')) montaProgramacao(); } catch (e) {} }, 60000);   // a bateria sugerida acompanha o relógio
  }

  // ---------- início ----------
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {}); } catch (e) {}
  escolheBase(); ligaCampos(); ligaResultado();
  baixa(false); setInterval(() => baixa(false), 5 * 60000);
  window.addEventListener('online', () => { baixa(false); });
  window.kbCad = { baixa, sel: SEL, dados: () => D, origem: () => ORIGEM, combo, rpc, programacao: () => P, guardaLocal, itensAtleta, itensArbitro, atletaPorNome, montaProgramacao };
})();
