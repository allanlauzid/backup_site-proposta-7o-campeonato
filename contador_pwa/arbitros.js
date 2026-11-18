/* arbitros.js — Árbitros do Contador KB (CONBRAKS 2026). Versão 1.0 (18/11/2026)
 *  - v1.1 (18/11): sem PIN de árbitro. Todos veem a lista. PIN de consulta (o da organização) vê a disponibilidade e a alocação;
 *    PIN de edição preenche a disponibilidade de cada árbitro e faz a alocação. Os PINs ficam só no site, como hash.
 *  - Visão geral: bolinhas por bateria (quem pode) e balão com a contagem.
 *  - Escala (PIN de edição): a coordenação põe 1 árbitro por plataforma; o contador preenche o Árbitro sozinho.
 *  - Avaliação do sistema (SUS) fica aqui dentro, uma pergunta por tela.
 */
(function () {
  'use strict';
  if (window.kbArb) return;
  const VER_SHA = '4b16c9448cd7a7382dc6bc9171f7546998d6d474a55579c575e5c77994a1b7d0';     // SHA-256('kb-conbraks-org|' + PIN da organização): consulta
  const EDIT_SHA = 'cb02946a843e47e5efba524a66e9c52c69ac165c4c3096475418611c1df533ac';   // SHA-256('kb-conbraks-edit|' + PIN de edição): preencher e alocar
  const K_DISP = 'kb_arb_disp_v1', K_FILA = 'kb_arb_fila_v1', K_ESC = 'kb_arb_escala_fila_v1';
  const VALIDADE = 15 * 60 * 1000;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const toast = (m, k) => { try { showToast(m, k); } catch (e) {} };
  const disp = () => { try { return deviceId(); } catch (e) { return null; } };
  const $ = (id) => document.getElementById(id);
  const D = () => (window.kbCad && kbCad.dados && kbCad.dados()) || { arbitros: [], flights: [] };
  const rpc = (fn, corpo) => window.kbCad.rpc(fn, corpo);
  async function sha(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
  const DIAS = [{ n: 1, rot: 'Dia 1', sub: 'sexta 20/11' }, { n: 2, rot: 'Dia 2', sub: 'sábado 21/11' }, { n: 3, rot: 'Dia 3', sub: 'domingo 22/11' }];
  const hm = (h) => (h || '').slice(0, 5);
  const diaN = (f) => f.dia_n || ({ '2026-11-20': 1, '2026-11-21': 2, '2026-11-22': 3 })[f.dia] || null;
  const baterias = (n) => D().flights.filter((f) => diaN(f) === n).sort((a, b) => hm(a.horario).localeCompare(hm(b.horario)) || a.numero - b.numero);
  const cor = (i) => 'hsl(' + Math.round((i * 137.5) % 360) + ' 70% 60%)';

  // ---------- estilos ----------
  const st = document.createElement('style');
  st.textContent = `
  .ka-ov{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.75);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:max(16px,env(safe-area-inset-top)) 12px 24px}
  .ka-box{position:relative;width:100%;max-width:720px;background:#141414;color:#f2f2f2;border:1px solid #333;border-radius:16px;padding:18px;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.6)}
  .ka-box h2{margin:0 0 4px;font-size:1.25rem;color:#ffcc00;padding-right:44px} .ka-box h3{margin:14px 0 6px;font-size:1rem}
  .ka-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;border:1px solid #555;background:#222;color:#eee;font:400 24px/1 system-ui;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0 0 3px}
  .ka-sub{color:#aaa;font-size:.88rem;margin:0 0 10px}
  .ka-in{width:100%;box-sizing:border-box;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:8px;padding:9px 10px;font:15px system-ui,sans-serif}
  .ka-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .ka-btn{appearance:none;border:0;border-radius:10px;padding:10px 14px;font:600 .95rem system-ui,sans-serif;cursor:pointer;background:#ffcc00;color:#000}
  .ka-btn.sec{background:#2a2a2a;color:#eee;border:1px solid #444} .ka-btn:disabled{opacity:.45;cursor:default}
  .ka-top{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:6px 0 12px}
  .ka-top .ka-btn{padding:12px 8px}
  @media (max-width:520px){.ka-top{grid-template-columns:1fr}}
  .ka-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:6px}
  .ka-item{display:flex;align-items:center;gap:8px;padding:10px 12px;border-radius:10px;background:#1d1d1d;border:1px solid #2c2c2c;cursor:pointer;text-align:left;color:#f2f2f2;font:inherit}
  .ka-item:hover{border-color:#666} .ka-item small{display:block;color:#9a9a9a;font-size:.78rem}
  .ka-dot{width:12px;height:12px;border-radius:50%;flex:none;display:inline-block}
  .ka-pin{display:flex;gap:10px;justify-content:center;margin:14px 0} .ka-pin input{width:64px;height:64px;text-align:center;font:800 1.8rem system-ui;border-radius:12px}
  .ka-err{color:#ff8a8a} .ka-ok{color:#5fd88f} .ka-warn{color:#ffd24d}
  .ka-dias{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:6px 0 10px}
  .ka-dia{appearance:none;border:2px solid #444;background:#1d1d1d;color:#eee;border-radius:10px;padding:6px;cursor:pointer;font:inherit;line-height:1.15}
  .ka-dia strong{display:block} .ka-dia small{color:#aaa;font-size:.76rem} .ka-dia.on{background:#ffcc00;color:#000;border-color:#ffcc00} .ka-dia.on small{color:#333}
  .ka-bats{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
  .ka-bat{display:flex;gap:8px;align-items:center;padding:9px 10px;border-radius:10px;border:1px solid #3a3a3a;background:#1b1b1b;cursor:pointer;font-size:.92rem}
  .ka-bat input{width:20px;height:20px;margin:0;flex:none}
  .ka-bat:has(input:checked){border-color:#2fbf6b;background:#14301f}
  .ka-bat b{font-variant-numeric:tabular-nums}
  .ka-geral{display:flex;flex-direction:column;gap:6px}
  .ka-gl{display:grid;grid-template-columns:118px 1fr auto;gap:8px;align-items:center;padding:8px 10px;border-radius:10px;background:#1b1b1b;border:1px solid #2c2c2c;cursor:pointer}
  .ka-gl .q{display:flex;flex-wrap:wrap;gap:4px}
  .ka-bal{position:relative;min-width:30px;height:24px;border-radius:12px;background:#ffcc00;color:#000;font:800 .85rem/24px system-ui;text-align:center;padding:0 7px}
  .ka-bal::after{content:'';position:absolute;left:-5px;top:8px;border:5px solid transparent;border-right-color:#ffcc00;border-left:0}
  .ka-bal.zero{background:#5c1616;color:#ffb3b3} .ka-bal.zero::after{border-right-color:#5c1616}
  .ka-gl .nm{grid-column:1/-1;font-size:.82rem;color:#ccc;display:none} .ka-gl.op .nm{display:block}
  .ka-leg{display:flex;flex-wrap:wrap;gap:4px 12px;font-size:.8rem;color:#ccc;margin:6px 0 10px}
  .ka-esc{width:100%;border-collapse:collapse;font-size:.88rem} .ka-esc td,.ka-esc th{border-bottom:1px solid #2a2a2a;padding:6px;text-align:left;vertical-align:middle}
  .ka-esc select{width:100%;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:8px;padding:6px;font:14px system-ui}
  .ka-esc select.conf{border-color:#ff5a5a}
  .ka-esc small{color:#9a9a9a}
  .ka-nome{cursor:default}
  .ka-modo{display:inline-flex;border:1px solid #444;border-radius:10px;overflow:hidden;margin:4px 0 10px} .ka-modo button{appearance:none;border:0;background:#1d1d1d;color:#ddd;padding:8px 14px;font:600 .9rem system-ui;cursor:pointer} .ka-modo button.on{background:#ffcc00;color:#000}
  .ka-arb{background:#1b1b1b;border:1px solid #2c2c2c;border-radius:10px;padding:10px 12px}
  .ka-arbh{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px} .ka-arbh small{color:#999} .ka-arbh .ka-edt{margin-left:auto;padding:6px 10px;font-size:.85rem}
  .ka-pd{display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;font-size:.85rem;margin-top:3px} .ka-pd b{width:46px;color:#ffcc00}
  .ka-ch{background:#14301f;border:1px solid #2fbf6b;border-radius:6px;padding:1px 6px} .ka-sem{color:#777}
  [hidden].ka-dias{display:none}
  `;
  document.head.appendChild(st);
  const ov = document.createElement('div'); ov.className = 'ka-ov'; ov.id = 'ka-ov'; document.body.appendChild(ov);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.style.display === 'flex') { e.preventDefault(); const v = $('ka-v'); if (v) v.click(); else fecha(); } });
  function mostra(h) { ov.innerHTML = '<div class="ka-box" role="dialog" aria-modal="true"><button class="ka-x" type="button" id="ka-xx" aria-label="Fechar" title="Fechar">×</button>' + h + '</div>'; ov.style.display = 'flex'; ov.scrollTop = 0; $('ka-xx').onclick = fecha; const f = ov.querySelector('[autofocus]'); if (f) f.focus(); }
  function fecha() { ov.style.display = 'none'; ov.innerHTML = ''; }

  // ---------- disponibilidade e escala (banco + cópia neste aparelho) ----------
  let DISP = lsGet(K_DISP, { em: null, disp: [], escala: [] });
  async function atualiza() {
    if (!navigator.onLine) return false;
    try { const j = await rpc('arbitros_disponibilidade', {}); if (j && j.ok) { DISP = { em: j.gerado_em, disp: j.disponibilidade || [], escala: j.escala || [] }; lsSet(K_DISP, DISP); aplicaFilaLocal(); return true; } } catch (e) {}
    return false;
  }
  function aplicaFilaLocal() {   // o que foi marcado sem rede aparece como já marcado
    lsGet(K_FILA, []).forEach((x) => { DISP.disp = DISP.disp.filter((d) => d.arbitro_id !== x.arbitro_id).concat(x.flights.map((f) => ({ arbitro_id: x.arbitro_id, flight_id: f }))); });
  }
  const dispDe = (aid) => new Set(DISP.disp.filter((d) => d.arbitro_id === aid).map((d) => d.flight_id));
  const quemPode = (fid) => DISP.disp.filter((d) => d.flight_id === fid).map((d) => d.arbitro_id);
  async function enviaFila() {
    if (!navigator.onLine) return;
    const F = lsGet(K_FILA, []), resta = [];
    for (const x of F) { try { const j = await rpc('arbitro_disponibilidade_salvar', { arbitro_id: x.arbitro_id, flights: x.flights, dispositivo_id: x.dispositivo_id }); if (!j.ok) resta.push(x); } catch (e) { resta.push(x); } }
    lsSet(K_FILA, resta);
    const E = lsGet(K_ESC, []), restaE = [];
    for (const x of E) { try { const j = await rpc('escala_definir', { flight_id: x.flight_id, plataforma: x.plataforma, arbitro_id: x.arbitro_id }); if (!j.ok) restaE.push(x); } catch (e) { restaE.push(x); } }
    lsSet(K_ESC, restaE);
  }
  window.addEventListener('online', enviaFila); setInterval(enviaFila, 60000);

  // ---------- tela inicial: lista (todos) + Disponibilidade e Alocação (com PIN) ----------
  let nivel = null, nivelAte = 0;   // 'ver' | 'editar'
  const arbs = () => D().arbitros.slice().sort((a, b) => norm(a.nome).localeCompare(norm(b.nome)));
  const temAcesso = () => nivel && Date.now() < nivelAte;
  function acesso(depois) {
    if (temAcesso()) return depois();
    pedePin('Acesso da coordenação', 'Digite o PIN para ver a disponibilidade e a alocação.', async (v) => {
      if ((await sha('kb-conbraks-edit|' + v)) === EDIT_SHA) { nivel = 'editar'; nivelAte = Date.now() + VALIDADE; return true; }
      if ((await sha('kb-conbraks-org|' + v)) === VER_SHA) { nivel = 'ver'; nivelAte = Date.now() + VALIDADE; return true; }
      return false;
    }, abrir, depois, false);
  }
  function abrir() {
    const L = arbs();
    mostra('<h2>Árbitros</h2><p class="ka-sub">' + L.length + ' árbitros do campeonato.' + (temAcesso() ? ' <b class="ka-ok">Acesso: ' + (nivel === 'editar' ? 'edição' : 'consulta') + '</b>' : '') + '</p>' +
      '<div class="ka-top"><button class="ka-btn sec" id="ka-g">Disponibilidade</button><button class="ka-btn sec" id="ka-e">Alocação nas baterias</button><button class="ka-btn sec" id="ka-s">Avaliação do sistema</button></div>' +
      '<div class="ka-list" id="ka-l"></div>' +
      '<div class="ka-btns">' + (temAcesso() ? '<button class="ka-btn sec" id="ka-sair">Sair do acesso</button>' : '') + '<button class="ka-btn sec" id="ka-v">Voltar</button></div>');
    $('ka-l').innerHTML = L.map((a, i) => '<div class="ka-item ka-nome' + (a.mock ? ' kb-mock' : '') + '"><span class="ka-dot" style="background:' + cor(i) + '"></span><span>' + esc(a.nome) + '</span></div>').join('') || '<p class="ka-sub">Nenhum árbitro na lista.</p>';
    $('ka-g').onclick = () => acesso(geral);
    $('ka-e').onclick = () => acesso(escala);
    $('ka-s').onclick = () => { try { kbQuest.sus({ voltar: abrir }); } catch (e) { toast('Avaliação indisponível', 'err'); } };
    if ($('ka-sair')) $('ka-sair').onclick = () => { nivel = null; nivelAte = 0; abrir(); };
    $('ka-v').onclick = fecha;
    atualiza();
  }
  // PIN de 4 dígitos (genérico)
  function pedePin(titulo, texto, confere, volta, entra, jaOk) {
    if (jaOk) return entra();
    mostra('<h2>' + esc(titulo) + '</h2><p class="ka-sub">' + esc(texto) + '</p><div class="ka-pin">' + [0, 1, 2, 3].map((i) => '<input class="ka-in" id="ka-p' + i + '" inputmode="numeric" maxlength="1" autocomplete="off" type="password" aria-label="Dígito ' + (i + 1) + ' do PIN"' + (i ? '' : ' autofocus') + '>').join('') + '</div><div id="ka-pe" class="ka-err" role="alert" style="text-align:center;min-height:1.4em"></div><div class="ka-btns" style="justify-content:center"><button class="ka-btn sec" id="ka-v">Voltar</button></div>');
    const ins = [0, 1, 2, 3].map((i) => $('ka-p' + i));
    const testa = async () => { const v = ins.map((i) => i.value).join(''); if (v.length < 4) return;
      if (await confere(v)) entra(); else { $('ka-pe').textContent = 'PIN incorreto.'; ins.forEach((i) => { i.value = ''; }); ins[0].focus(); } };
    ins.forEach((inp, i) => {
      inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && i < 3) ins[i + 1].focus(); testa(); });
      inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && i > 0) ins[i - 1].focus(); });
    });
    $('ka-v').onclick = volta;
  }

  // ---------- disponibilidade de um árbitro ----------
  const hojeN = () => { const d = new Date(), k = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); return ({ '2026-11-20': 1, '2026-11-21': 2, '2026-11-22': 3 })[k] || null; };
  let diaSel = null;
  function disponibilidade(a) {
    const marc = dispDe(a.id);
    if (!diaSel) diaSel = hojeN() || (DIAS.find((d) => baterias(d.n).length) || DIAS[0]).n;
    const desenha = () => {
      const L = baterias(diaSel);
      $('ka-dd').innerHTML = DIAS.map((d) => { const n = baterias(d.n).filter((f) => marc.has(f.id)).length; return '<button type="button" class="ka-dia' + (d.n === diaSel ? ' on' : '') + '" data-d="' + d.n + '"><strong>' + d.rot + '</strong><small>' + d.sub + (n ? ' · ' + n + ' ✓' : '') + '</small></button>'; }).join('');
      $('ka-bb').innerHTML = L.map((f) => '<label class="ka-bat"><input type="checkbox" data-f="' + f.id + '"' + (marc.has(f.id) ? ' checked' : '') + '><span>Bateria <b>' + f.numero + '</b> · <b>' + hm(f.horario) + '</b><br><small>' + (f.atletas || []).length + ' plataformas</small></span></label>').join('') || '<p class="ka-sub">Sem baterias neste dia.</p>';
      $('ka-dd').querySelectorAll('.ka-dia').forEach((b) => { b.onclick = () => { diaSel = +b.dataset.d; desenha(); }; });
      $('ka-bb').querySelectorAll('input').forEach((c) => { c.onchange = () => { if (c.checked) marc.add(c.dataset.f); else marc.delete(c.dataset.f); desenha(); }; });
      $('ka-tot').textContent = marc.size + ' bateria(s) marcada(s) nos 3 dias';
    };
    mostra('<h2>' + esc(a.nome) + '</h2><p class="ka-sub">Marque as baterias em que este árbitro pode arbitrar. Dá para trocar depois.</p>' +
      '<div class="ka-dias" id="ka-dd"></div><div class="ka-btns" style="margin:0 0 8px"><button class="ka-btn sec" id="ka-td">Marcar o dia todo</button><button class="ka-btn sec" id="ka-nd">Limpar o dia</button></div>' +
      '<div class="ka-bats" id="ka-bb"></div><p class="ka-sub" id="ka-tot" style="margin-top:10px"></p><div id="ka-msg" role="alert"></div>' +
      '<div class="ka-btns"><button class="ka-btn" id="ka-sv">Salvar</button><button class="ka-btn sec" id="ka-v">Voltar</button></div>');
    $('ka-td').onclick = () => { baterias(diaSel).forEach((f) => marc.add(f.id)); desenha(); };
    $('ka-nd').onclick = () => { baterias(diaSel).forEach((f) => marc.delete(f.id)); desenha(); };
    $('ka-v').onclick = geral;
    $('ka-sv').onclick = async () => {
      const item = { arbitro_id: a.id, flights: [...marc], dispositivo_id: disp() };
      const F = lsGet(K_FILA, []).filter((x) => x.arbitro_id !== a.id); F.push(item); lsSet(K_FILA, F);
      DISP.disp = DISP.disp.filter((d) => d.arbitro_id !== a.id).concat(item.flights.map((f) => ({ arbitro_id: a.id, flight_id: f }))); lsSet(K_DISP, DISP);
      $('ka-sv').disabled = true; $('ka-msg').innerHTML = '<span class="ka-ok">Salvo no aparelho. Enviando…</span>';
      await enviaFila();
      const ok = !lsGet(K_FILA, []).some((x) => x.arbitro_id === a.id);
      $('ka-msg').innerHTML = ok ? '<span class="ka-ok">Disponibilidade registrada: ' + item.flights.length + ' bateria(s).</span>' : '<span class="ka-warn">Sem internet: fica guardada neste aparelho e é enviada quando houver rede.</span>';
      $('ka-sv').disabled = false;
    };
    desenha();
  }

  // ---------- disponibilidade: por bateria (bolinhas) ou por árbitro (horários de cada um) ----------
  let modoGeral = 'arbitro';
  function geral() {
    if (!temAcesso()) return acesso(geral);
    const L = arbs(), idx = new Map(L.map((a, i) => [a.id, i])), nome = new Map(L.map((a) => [a.id, a.nome]));
    if (!diaSel) diaSel = hojeN() || 1;
    const ed = nivel === 'editar';
    const desenha = () => {
      $('ka-modo').querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.m === modoGeral));
      $('ka-dd').hidden = modoGeral !== 'bateria';
      $('ka-dd').innerHTML = DIAS.map((d) => '<button type="button" class="ka-dia' + (d.n === diaSel ? ' on' : '') + '" data-d="' + d.n + '"><strong>' + d.rot + '</strong><small>' + d.sub + '</small></button>').join('');
      if (modoGeral === 'arbitro') {
        $('ka-gg').innerHTML = L.map((a, i) => { const m = dispDe(a.id);
          const porDia = DIAS.map((d) => { const bs = baterias(d.n).filter((f) => m.has(f.id)); return '<div class="ka-pd"><b>' + d.rot + '</b>' + (bs.length ? bs.map((f) => '<span class="ka-ch">B' + f.numero + ' · ' + hm(f.horario) + '</span>').join('') : '<span class="ka-sem">—</span>') + '</div>'; }).join('');
          return '<div class="ka-arb"><div class="ka-arbh"><span class="ka-dot" style="background:' + cor(i) + '"></span><strong>' + esc(a.nome) + '</strong><small>' + m.size + ' bateria(s)</small>' + (ed ? '<button type="button" class="ka-btn sec ka-edt" data-id="' + a.id + '">Preencher horários</button>' : '') + '</div>' + porDia + '</div>'; }).join('');
        $('ka-gg').querySelectorAll('.ka-edt').forEach((b) => { b.onclick = () => disponibilidade(L.find((a) => a.id === b.dataset.id)); });
      } else {
        $('ka-gg').innerHTML = baterias(diaSel).map((f) => { const q = quemPode(f.id).filter((x) => idx.has(x)), pl = (f.atletas || []).length;
          return '<div class="ka-gl" data-f="' + f.id + '" role="button" tabindex="0"><span><b>Bateria ' + f.numero + '</b><br><small>' + hm(f.horario) + ' · ' + pl + ' plat.</small></span><span class="q">' +
            q.map((x) => '<span class="ka-dot" title="' + esc(nome.get(x)) + '" style="background:' + cor(idx.get(x)) + '"></span>').join('') + '</span>' +
            '<span class="ka-bal' + (q.length < pl ? ' zero' : '') + '" title="' + q.length + ' árbitro(s) disponível(is) para ' + pl + ' plataforma(s)">' + q.length + '</span>' +
            '<div class="nm">' + (q.length ? 'Podem: ' + q.map((x) => esc(nome.get(x))).join(', ') : 'Ninguém marcou esta bateria.') + '</div></div>'; }).join('');
        $('ka-gg').querySelectorAll('.ka-gl').forEach((g) => { g.onclick = () => g.classList.toggle('op'); g.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); g.classList.toggle('op'); } }; });
      }
      $('ka-dd').querySelectorAll('.ka-dia').forEach((b) => { b.onclick = () => { diaSel = +b.dataset.d; desenha(); }; });
    };
    mostra('<h2>Disponibilidade</h2><p class="ka-sub">' + (ed ? 'Toque em "Preencher horários" para marcar as baterias de cada árbitro.' : 'Só consulta.') + (DISP.em ? ' Dados de ' + new Date(DISP.em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '.' : '') + '</p>' +
      '<div class="ka-modo" id="ka-modo"><button type="button" data-m="arbitro">Por árbitro</button><button type="button" data-m="bateria">Por bateria</button></div>' +
      '<div class="ka-dias" id="ka-dd"></div><div class="ka-geral" id="ka-gg"></div><div class="ka-btns"><button class="ka-btn sec" id="ka-r">Atualizar</button><button class="ka-btn sec" id="ka-v">Voltar</button></div>');
    $('ka-modo').querySelectorAll('button').forEach((b) => { b.onclick = () => { modoGeral = b.dataset.m; desenha(); }; });
    $('ka-v').onclick = abrir; $('ka-r').onclick = async () => { await atualiza(); desenha(); };
    desenha(); atualiza().then((ok) => { if (ok && $('ka-gg')) desenha(); });
  }

  // ---------- escala (PIN de edição): 1 árbitro por plataforma ----------
  function escala() {
    if (!temAcesso()) return acesso(escala);
    const L = arbs(), nome = new Map(L.map((a) => [a.id, a.nome])), ed = nivel === 'editar';
    if (!diaSel) diaSel = hojeN() || 1;
    const atual = (f, p) => { const e = DISP.escala.find((x) => x.flight_id === f.id && x.plataforma === p); if (e) return e.arbitro_id; const y = (f.atletas || []).find((x) => x.plataforma === p); return y ? y.arbitro_id : null; };
    const desenha = () => {
      $('ka-dd').innerHTML = DIAS.map((d) => '<button type="button" class="ka-dia' + (d.n === diaSel ? ' on' : '') + '" data-d="' + d.n + '"><strong>' + d.rot + '</strong><small>' + d.sub + '</small></button>').join('');
      $('ka-et').innerHTML = baterias(diaSel).map((f) => { const pode = new Set(quemPode(f.id));
        return '<tr><th colspan="3">Bateria ' + f.numero + ' · ' + hm(f.horario) + ' <small>(' + pode.size + ' disponível(is))</small></th></tr>' + (f.atletas || []).map((x) => { const sel = atual(f, x.plataforma);
          const ops = '<option value="">— sem árbitro —</option>' + L.filter((a) => pode.has(a.id)).map((a) => '<option value="' + a.id + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.nome) + '</option>').join('') +
            '<optgroup label="Não marcaram esta bateria">' + L.filter((a) => !pode.has(a.id)).map((a) => '<option value="' + a.id + '"' + (a.id === sel ? ' selected' : '') + '>' + esc(a.nome) + ' (não marcou)</option>').join('') + '</optgroup>';
          if (!ed) return '<tr><td style="width:44px">P' + x.plataforma + '</td><td><small>' + esc(x.nome || x.nome_programacao || '') + '</small></td><td style="width:52%"><b>' + esc(sel ? (nome.get(sel) || '?') : '—') + '</b></td></tr>';
          return '<tr><td style="width:44px">P' + x.plataforma + '</td><td><small>' + esc(x.nome || x.nome_programacao || '') + '</small></td><td style="width:52%"><select data-f="' + f.id + '" data-p="' + x.plataforma + '" aria-label="Árbitro da plataforma ' + x.plataforma + ', bateria ' + f.numero + '">' + ops + '</select></td></tr>'; }).join(''); }).join('');
      $('ka-dd').querySelectorAll('.ka-dia').forEach((b) => { b.onclick = () => { diaSel = +b.dataset.d; desenha(); }; });
      marcaConflitos();
      $('ka-et').querySelectorAll('select').forEach((s) => { s.onchange = () => define(s.dataset.f, +s.dataset.p, s.value || null, s); });
    };
    const marcaConflitos = () => {   // o mesmo árbitro em duas plataformas da mesma bateria
      const grupos = {}; $('ka-et').querySelectorAll('select').forEach((s) => { (grupos[s.dataset.f] = grupos[s.dataset.f] || []).push(s); });
      Object.values(grupos).forEach((g) => { g.forEach((s) => s.classList.toggle('conf', !!s.value && g.filter((o) => o.value === s.value).length > 1)); });
    };
    const define = async (fid, p, aid, s) => {
      const outros = [...$('ka-et').querySelectorAll('select[data-f="' + fid + '"]')].filter((o) => o !== s && o.value && o.value === aid);
      if (outros.length) { toast(nome.get(aid) + ' já está em outra plataforma desta bateria: 1 árbitro por plataforma', 'err'); s.value = atual(D().flights.find((f) => f.id === fid), p) || ''; marcaConflitos(); return; }
      DISP.escala = DISP.escala.filter((x) => !(x.flight_id === fid && x.plataforma === p)).concat(aid ? [{ flight_id: fid, plataforma: p, arbitro_id: aid }] : [{ flight_id: fid, plataforma: p, arbitro_id: null }]);
      lsSet(K_DISP, DISP);
      const f = D().flights.find((x) => x.id === fid), y = f && (f.atletas || []).find((x) => x.plataforma === p); if (y) y.arbitro_id = aid;   // o contador deste aparelho já usa
      const E = lsGet(K_ESC, []).filter((x) => !(x.flight_id === fid && x.plataforma === p)); E.push({ flight_id: fid, plataforma: p, arbitro_id: aid }); lsSet(K_ESC, E);
      await enviaFila();
      const pend = lsGet(K_ESC, []).some((x) => x.flight_id === fid && x.plataforma === p);
      $('ka-msg').innerHTML = pend ? '<span class="ka-warn">Sem internet: a escala fica guardada neste aparelho e é enviada quando houver rede.</span>' : '<span class="ka-ok">Escala salva: plataforma ' + p + ' · ' + esc(aid ? nome.get(aid) : 'sem árbitro') + '.</span>';
      try { kbCad.baixa(false); } catch (e) {}
      marcaConflitos();
    };
    mostra('<h2>Alocação nas baterias</h2><p class="ka-sub">' + (ed ? '1 árbitro por plataforma. Primeiro aparecem os que marcaram a bateria. O contador preenche o Árbitro sozinho quando a plataforma é escolhida.' : 'Só consulta.') + '</p>' +
      '<div class="ka-dias" id="ka-dd"></div><div id="ka-msg" role="alert" style="min-height:1.4em"></div><table class="ka-esc"><tbody id="ka-et"></tbody></table>' +
      '<div class="ka-btns"><button class="ka-btn sec" id="ka-v">Voltar</button></div>');
    $('ka-v').onclick = abrir;
    desenha(); atualiza().then((ok) => { if (ok && $('ka-et')) desenha(); });
  }

  aplicaFilaLocal(); setTimeout(enviaFila, 3000);
  window.kbArb = { abrir, fechar: fecha, atualiza };
})();
