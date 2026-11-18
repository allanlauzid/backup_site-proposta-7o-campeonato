/* arbitros.js — Árbitros do Contador KB (CONBRAKS 2026). Versão 3.0 (18/11/2026)
 *  - Baterias: o árbitro digita o nome e vê onde e quando atua (dia, hora, bateria, plataforma, atleta, prova, observações).
 *    Filtros por dia, hora e árbitro; "Todos os árbitros" mostra a escala completa. Sem senha.
 *    O que já passou fica cinza (2 h de folga para atrasos); a próxima bateria fica em destaque.
 *    A escala vem da planilha do Allan e está guardada dentro do contador (funciona sem internet);
 *    quando há rede, a lista do banco (contador_lista) traz as trocas feitas durante o evento.
 *  - Avaliação do sistema (SUS, anônima) continua aqui.
 */
(function () {
  'use strict';
  if (window.kbArb) return;
  const K_EU = 'kb_arb_eu_v1', FOLGA = 2 * 36e5;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const $ = (id) => document.getElementById(id);
  const D = () => (window.kbCad && kbCad.dados && kbCad.dados()) || { arbitros: [], flights: [] };
  const DIAS = [{ n: 1, d: '2026-11-20', rot: 'Dia 1', sub: 'sexta 20/11' }, { n: 2, d: '2026-11-21', rot: 'Dia 2', sub: 'sábado 21/11' }, { n: 3, d: '2026-11-22', rot: 'Dia 3', sub: 'domingo 22/11' }];
  const hm = (h) => (h || '').slice(0, 5);
  const diaN = (f) => f.dia_n || ({ '2026-11-20': 1, '2026-11-21': 2, '2026-11-22': 3 })[f.dia] || null;
  const diaDe = (n) => DIAS.find((d) => d.n === n);
  const ini = (f) => Date.parse(diaDe(diaN(f)).d + 'T' + hm(f.horario) + ':00-03:00');
  const fim = (f) => ini(f) + (f.duracao_min || 10) * 6e4;
  const hhmm = (t) => new Date(t).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Recife' });
  const baterias = () => D().flights.filter((f) => !f.mock && diaN(f)).slice().sort((a, b) => ini(a) - ini(b) || a.numero - b.numero);
  const reduz = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

  // ---------- estilos ----------
  const st = document.createElement('style');
  st.textContent = `
  .ka-ov{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.75);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:max(16px,env(safe-area-inset-top)) 12px 24px}
  .ka-box{position:relative;width:100%;max-width:760px;background:#141414;color:#f2f2f2;border:1px solid #333;border-radius:16px;padding:18px;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.6);animation:ka-entra .32s cubic-bezier(.22,1,.36,1) both}
  .ka-box.larga{max-width:1100px}
  @keyframes ka-entra{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
  .ka-box h2{margin:0 0 4px;font-size:1.25rem;color:#ffcc00;padding-right:44px} .ka-box h3{margin:16px 0 6px;font-size:1.02rem}
  .ka-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;border:1px solid #555;background:#222;color:#eee;font:400 24px/1 system-ui;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0 0 3px}
  .ka-sub{color:#b5b5b5;font-size:.88rem;margin:0 0 10px;max-width:75ch}
  .ka-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
  .ka-btn{appearance:none;border:0;border-radius:10px;padding:10px 14px;font:600 .95rem system-ui,sans-serif;cursor:pointer;background:#ffcc00;color:#000}
  .ka-btn.sec{background:#2a2a2a;color:#eee;border:1px solid #444}
  .ka-acoes{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin:8px 0 6px}
  .ka-acao{appearance:none;text-align:left;border:2px solid #ffcc00;border-radius:14px;background:#1d1a0c;color:#fff;padding:14px 16px;cursor:pointer;font:inherit;transition:transform .15s ease,background-color .2s ease}
  .ka-acao:hover{background:#2a240e;transform:translateY(-1px)} .ka-acao:focus-visible{outline:3px solid #fff;outline-offset:3px}
  .ka-acao b{display:block;font:800 1.25rem system-ui,sans-serif;color:#ffcc00} .ka-acao small{color:#cfcfcf}
  .ka-acao.sec{border-color:#555;background:#1d1d1d} .ka-acao.sec b{color:#fff}
  .ka-list{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:6px}
  .ka-item{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:10px;background:#1d1d1d;border:1px solid #2c2c2c;color:#f2f2f2;font:inherit;text-align:left;cursor:pointer}
  .ka-item:hover{border-color:#666}
  /* Baterias */
  .ka-nomebox{position:relative;max-width:520px}
  .ka-nomebox label{display:block;font:700 .95rem system-ui,sans-serif;margin:4px 0 6px}
  .ka-in{width:100%;box-sizing:border-box;background:#0d0d0d;color:#fff;border:2px solid #444;border-radius:10px;padding:11px 12px;font:16px system-ui,sans-serif}
  .ka-in:focus{border-color:#ffcc00;outline:none}
  .ka-sug{list-style:none;margin:6px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
  .ka-sug button{width:100%;text-align:left;appearance:none;border:1px solid #333;background:#1b1b1b;color:#fff;border-radius:8px;padding:9px 12px;font:inherit;cursor:pointer}
  .ka-sug button:hover,.ka-sug button:focus-visible{border-color:#ffcc00;outline:none}
  .ka-sug .nada{color:#ff9a9a;font-size:.9rem;padding:4px 2px}
  .ka-eu{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;padding:10px 12px;border-radius:10px;background:#1d1a0c;border:1px solid #6a5a10;animation:ka-entra .3s cubic-bezier(.22,1,.36,1) both}
  .ka-eu b{color:#ffcc00}
  .ka-fil{display:flex;flex-wrap:wrap;align-items:end;gap:10px 14px;margin:12px 0}
  .ka-fil label{display:flex;flex-direction:column;gap:4px;font-size:.78rem;color:#bbb;text-transform:uppercase;letter-spacing:.05em}
  .ka-fil select{background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:8px;padding:8px;font:15px system-ui;min-width:150px}
  .ka-dias{display:flex;gap:6px;flex-wrap:wrap}
  .ka-dia{appearance:none;border:2px solid #444;background:#1d1d1d;color:#eee;border-radius:10px;padding:6px 12px;cursor:pointer;font:600 .9rem system-ui;transition:filter .3s ease,opacity .3s ease}
  .ka-dia.on{background:#ffcc00;color:#000;border-color:#ffcc00}
  .ka-dia.passou:not(.on){filter:grayscale(1);opacity:.5}
  .ka-res{display:flex;flex-direction:column;gap:10px}
  .ka-dh{margin:10px 0 0;font:800 1rem system-ui;color:#ffcc00;transition:opacity .3s ease} .ka-dh.passou{color:#8a8a8a}
  .ka-bt{background:#1b1b1b;border:1px solid #2c2c2c;border-radius:12px;padding:10px 12px;transition:filter .3s ease,opacity .3s ease;animation:ka-entra .3s cubic-bezier(.22,1,.36,1) both}
  .ka-bt header{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 10px;margin-bottom:6px}
  .ka-bt header .t{color:#ffcc00;font-weight:800;font-variant-numeric:tabular-nums;font-size:1.05rem} .ka-bt header small{color:#a8a8a8}
  .ka-tag{margin-left:auto;font:800 .72rem system-ui;letter-spacing:.05em;text-transform:uppercase;padding:3px 8px;border-radius:6px;display:none}
  .ka-bt.passou{filter:grayscale(1);opacity:.5} .ka-bt.passou .ka-tag{display:inline-block;background:#3a3a3a;color:#ddd}
  .ka-bt.proxima,.ka-bt.agora{border:2px solid #ffcc00;box-shadow:0 0 0 3px rgba(255,204,0,.15)}
  .ka-bt.proxima .ka-tag{display:inline-block;background:#ffcc00;color:#000} .ka-bt.agora .ka-tag{display:inline-block;background:#1f8f4a;color:#fff}
  .ka-r{display:grid;grid-template-columns:42px 1fr minmax(0,.9fr);gap:10px;align-items:center;padding:8px 6px;border-top:1px solid #262626}
  .ka-r:first-of-type{border-top:0}
  .ka-r i.pl{font-style:normal;display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:8px;background:#ffcc00;color:#000;font:900 1.15rem system-ui}
  .ka-r .at b{display:block} .ka-r .at small{color:#a8a8a8}
  .ka-r .ar b{display:block;font-weight:700} .ka-r .ar small{display:block;color:#bdbdbd;font-size:.8rem}
  .ka-r.eu .ar b{color:#ffcc00}
  .ka-rsv{display:inline-block;font:800 .66rem system-ui;letter-spacing:.05em;text-transform:uppercase;background:#ffcc00;color:#000;padding:2px 6px;border-radius:5px;margin-bottom:2px}
  .ka-vazio{color:#bbb;padding:12px;border:1px dashed #444;border-radius:10px}
  @media (max-width:560px){.ka-r{grid-template-columns:40px 1fr}.ka-r .ar{grid-column:2}}
  @media (prefers-reduced-motion:reduce){.ka-box,.ka-bt,.ka-eu{animation:none}}
  `;
  document.head.appendChild(st);
  const ov = document.createElement('div'); ov.className = 'ka-ov'; ov.id = 'ka-ov'; document.body.appendChild(ov);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.style.display === 'flex') { e.preventDefault(); const v = $('ka-v'); if (v) v.click(); else fecha(); } });
  let relogio = 0;
  function mostra(h, larga) { clearInterval(relogio); ov.innerHTML = '<div class="ka-box' + (larga ? ' larga' : '') + '" role="dialog" aria-modal="true"><button class="ka-x" type="button" id="ka-xx" aria-label="Fechar" title="Fechar">×</button>' + h + '</div>'; ov.style.display = 'flex'; ov.scrollTop = 0; $('ka-xx').onclick = fecha; }
  function fecha() { clearInterval(relogio); ov.style.display = 'none'; ov.innerHTML = ''; }
  const arbs = () => D().arbitros.filter((a) => !a.mock).slice().sort((a, b) => norm(a.nome).localeCompare(norm(b.nome)));

  // ---------- tela inicial ----------
  function abrir() {
    const L = arbs();
    mostra('<h2>Árbitros</h2><p class="ka-sub">' + L.length + ' árbitros do campeonato.</p>' +
      '<div class="ka-acoes"><button type="button" class="ka-acao" id="ka-b"><b>Baterias</b><small>Digite seu nome e veja onde e quando você arbitra.</small></button>' +
      '<button type="button" class="ka-acao sec" id="ka-s"><b>Avaliação do sistema</b><small>Anônima: seu nome não é pedido.</small></button></div>' +
      '<h3>Lista</h3><div class="ka-list">' + (L.map((a) => '<button type="button" class="ka-item" data-id="' + a.id + '">' + esc(a.nome) + '</button>').join('') || '<p class="ka-sub">Nenhum árbitro na lista.</p>') + '</div>' +
      '<div class="ka-btns"><button class="ka-btn sec" id="ka-v">Voltar</button></div>');
    $('ka-b').onclick = () => telaBaterias();
    $('ka-s').onclick = () => { try { kbQuest.sus({ voltar: abrir }); } catch (e) { try { showToast('Avaliação indisponível', 'err'); } catch (er) {} } };
    $('ka-v').onclick = fecha;
    ov.querySelectorAll('.ka-item').forEach((b) => { b.onclick = () => { F.arb = b.dataset.id; telaBaterias(); }; });
  }

  // ---------- Baterias ----------
  const F = { dia: 'todos', hora: '', arb: null };
  function eu() { const id = lsGet(K_EU, null); return id && arbs().some((a) => a.id === id) ? id : null; }
  function telaBaterias() {
    const L = arbs(), nome = new Map(L.map((a) => [a.id, a.nome]));
    if (!F.arb) F.arb = eu() || null;
    mostra('<h2>Baterias</h2><p class="ka-sub">Onde e quando cada árbitro atua. O que já passou fica cinza; a próxima bateria fica em destaque.</p>' +
      '<div id="ka-nb"></div><div class="ka-fil" id="ka-fil"></div><div class="ka-res" id="ka-res" aria-live="polite"></div>' +
      '<div class="ka-btns"><button class="ka-btn sec" id="ka-v">Voltar</button></div>', true);
    $('ka-v').onclick = abrir;
    const desenhaNome = () => {
      const meu = eu();
      if (meu) {
        $('ka-nb').innerHTML = '<div class="ka-eu">Você é <b>' + esc(nome.get(meu)) + '</b><button type="button" class="ka-btn sec" id="ka-tn">Trocar nome</button></div>';
        $('ka-tn').onclick = () => { lsSet(K_EU, null); if (F.arb === meu) F.arb = null; desenhaNome(); desenhaFiltros(); desenhaRes(); const i = $('ka-nome'); if (i) i.focus(); };
        return;
      }
      $('ka-nb').innerHTML = '<div class="ka-nomebox"><label for="ka-nome">Digite seu nome</label><input class="ka-in" id="ka-nome" type="text" autocomplete="off" placeholder="Ex.: Renato" aria-describedby="ka-sug" maxlength="60"><ul class="ka-sug" id="ka-sug" role="listbox" aria-label="Árbitros encontrados"></ul></div>';
      const inp = $('ka-nome'), sug = $('ka-sug');
      const acha = () => { const t = norm(inp.value); return t ? L.filter((a) => t.split(' ').every((p) => norm(a.nome).indexOf(p) >= 0)) : []; };
      const lista = () => {
        const t = norm(inp.value), R = acha();
        sug.innerHTML = !t ? '' : (R.length ? R.slice(0, 6).map((a) => '<li><button type="button" role="option" data-id="' + a.id + '">' + esc(a.nome) + '</button></li>').join('') : '<li class="nada">Nome não encontrado na escala.</li>');
        sug.querySelectorAll('button').forEach((b) => { b.onclick = () => escolhe(b.dataset.id); });
      };
      const escolhe = (id) => { lsSet(K_EU, id); F.arb = id; desenhaNome(); desenhaFiltros(); desenhaRes(); };
      inp.addEventListener('input', lista);
      inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); const R = acha(); if (R.length) escolhe(R[0].id); } });
      setTimeout(() => { try { inp.focus(); } catch (e) {} }, 80);
    };
    const desenhaFiltros = () => {
      const fs = baterias().filter((f) => F.dia === 'todos' || diaN(f) === F.dia);
      const horas = [...new Set(fs.map((f) => hm(f.horario)))].sort();
      if (F.hora && horas.indexOf(F.hora) < 0) F.hora = '';
      const agora = Date.now();
      const diaPassou = (n) => { const B = baterias().filter((f) => diaN(f) === n); return B.length && B.every((f) => agora > fim(f) + FOLGA); };
      $('ka-fil').innerHTML = '<label>Dia<span class="ka-dias" role="group" aria-label="Dia">' + [['todos', 'Todos']].concat(DIAS.map((d) => [d.n, d.rot])).map(([k, r]) => '<button type="button" class="ka-dia' + (F.dia === k ? ' on' : '') + (k !== 'todos' && diaPassou(k) ? ' passou' : '') + '" data-d="' + k + '" aria-pressed="' + (F.dia === k) + '">' + r + '</button>').join('') + '</span></label>' +
        '<label for="ka-hora">Hora<select id="ka-hora"><option value="">Todas</option>' + horas.map((h) => '<option' + (h === F.hora ? ' selected' : '') + '>' + h + '</option>').join('') + '</select></label>' +
        '<label for="ka-arb">Árbitro<select id="ka-arb"><option value="">Todos os árbitros</option>' + L.map((a) => '<option value="' + a.id + '"' + (a.id === F.arb ? ' selected' : '') + '>' + esc(a.nome) + '</option>').join('') + '</select></label>';
      $('ka-fil').querySelectorAll('.ka-dia').forEach((b) => { b.onclick = () => { F.dia = b.dataset.d === 'todos' ? 'todos' : +b.dataset.d; desenhaFiltros(); desenhaRes(); }; });
      $('ka-hora').onchange = (e) => { F.hora = e.target.value; desenhaRes(); };
      $('ka-arb').onchange = (e) => { F.arb = e.target.value || null; desenhaRes(); };
    };
    const desenhaRes = () => {
      const fs = baterias().filter((f) => (F.dia === 'todos' || diaN(f) === F.dia) && (!F.hora || hm(f.horario) === F.hora));
      const meu = eu();
      const blocos = []; let diaAtual = null;
      fs.forEach((f) => {
        const vagas = (f.atletas || []).slice().sort((a, b) => a.plataforma - b.plataforma).filter((x) => !F.arb || x.arbitro_id === F.arb);
        if (!vagas.length) return;
        if (diaN(f) !== diaAtual) { diaAtual = diaN(f); const d = diaDe(diaAtual); blocos.push('<h3 class="ka-dh" data-dia="' + d.n + '">' + d.rot + ' · ' + d.sub + '</h3>'); }
        blocos.push('<section class="ka-bt" data-ini="' + ini(f) + '" data-fim="' + fim(f) + '"><header><span class="t">' + hhmm(ini(f)) + '–' + hhmm(fim(f)) + '</span><b>Bateria ' + f.numero + '</b><small>' + (f.duracao_min || 10) + ' min</small><span class="ka-tag"></span></header>' +
          vagas.map((x) => { const obs = x.arbitro_obs || [], rsv = obs.indexOf('Reserva') >= 0;
            return '<div class="ka-r' + (meu && x.arbitro_id === meu ? ' eu' : '') + '"><i class="pl" aria-label="Plataforma ' + x.plataforma + '">' + x.plataforma + '</i>' +
              '<div class="at"><b>' + esc(x.nome_programacao || x.nome || '—') + '</b><small>' + esc([x.prova, [x.categoria, x.categoria_peso].filter(Boolean).join(' · ')].filter(Boolean).join(' · ')) + '</small></div>' +
              '<div class="ar">' + (rsv ? '<span class="ka-rsv">Reserva</span>' : '') + '<b>' + esc(x.arbitro_id ? (nome.get(x.arbitro_id) || '—') : 'Sem árbitro na escala') + '</b>' + obs.filter((o) => o !== 'Reserva').map((o) => '<small>' + esc(o) + '</small>').join('') + '</div></div>'; }).join('') + '</section>');
      });
      $('ka-res').innerHTML = blocos.join('') || '<div class="ka-vazio">' + (F.arb ? 'Nenhuma bateria para ' + esc(nome.get(F.arb) || 'este árbitro') + ' com esses filtros.' : 'Nenhuma bateria com esses filtros.') + '</div>';
      marca();
    };
    const marca = () => {   // cinza (2 h depois do fim previsto) e próxima bateria
      const t = Date.now(); let prox = null;
      ov.querySelectorAll('.ka-bt[data-fim]').forEach((b) => { const passou = t > +b.dataset.fim + FOLGA; b.classList.toggle('passou', passou); b.classList.remove('proxima', 'agora'); b.querySelector('.ka-tag').textContent = passou ? 'Já passou' : ''; if (!prox && t < +b.dataset.fim) prox = b; });
      if (prox) { const i0 = +prox.dataset.ini, tag = prox.querySelector('.ka-tag');
        if (t >= i0) { prox.classList.add('agora'); tag.textContent = 'Agora'; }
        else { prox.classList.add('proxima'); const mn = Math.round((i0 - t) / 6e4); tag.textContent = 'Próxima' + (mn <= 180 ? ' · em ' + (mn < 60 ? mn + ' min' : Math.floor(mn / 60) + ' h ' + String(mn % 60).padStart(2, '0')) : ''); } }
      ov.querySelectorAll('.ka-dh').forEach((h) => { const n = +h.dataset.dia; const B = baterias().filter((f) => diaN(f) === n); h.classList.toggle('passou', B.length > 0 && B.every((f) => t > fim(f) + FOLGA)); });
    };
    desenhaNome(); desenhaFiltros(); desenhaRes();
    relogio = setInterval(() => { if ($('ka-res')) marca(); }, 30000);
    if (!reduz() && F.arb) { const p = ov.querySelector('.ka-bt.proxima, .ka-bt.agora'); if (p) setTimeout(() => { try { p.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch (e) {} }, 350); }
  }

  window.kbArb = { abrir, fechar: fecha, baterias: telaBaterias };
})();
