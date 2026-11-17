/* h1.js — Sensor cardíaco (Cycplus H1 ou similar) no Contador KB (CONBRAKS)
 * Carregado só quando o item "Sensor cardíaco" do menu é usado (ou quando há sessão pendente).
 * Não altera a contagem: lê o estado do contador (active, finished, provaId, logs...) a cada segundo.
 * Qualquer erro aqui desliga o sensor sem afetar o contador.
 * Depende de: metricas.js (KBMetricas).
 */
(function () {
  'use strict';
  if (window.kbH1) return;

  // ---------- chaves de armazenamento ----------
  const K_SESS = 'kb_h1_sessoes_v1', K_ATUAL = 'kb_h1_atual_v1', K_PERF = 'kb_h1_perfis_v1', K_FILA = 'kb_h1_fila_v1';
  const MAX_SESS = 60;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) {} };

  // ---------- acesso seguro ao estado do contador ----------
  const C = {
    ativo: () => { try { return typeof active !== 'undefined' && !!active; } catch (e) { return false; } },
    finalizado: () => { try { return typeof finished !== 'undefined' && !!finished; } catch (e) { return false; } },
    provaId: () => { try { return typeof provaId !== 'undefined' ? provaId : null; } catch (e) { return null; } },
    inicio: () => { try { return startTime ? startTime.getTime() : null; } catch (e) { return null; } },
    fim: () => { try { return endTime ? endTime.getTime() : null; } catch (e) { return null; } },
    atleta: () => { try { return athlete || ''; } catch (e) { return ''; } },
    movimento: () => { try { return movimento || ''; } catch (e) { return ''; } },
    pista: () => { try { return pista; } catch (e) { return null; } },
    arbitro: () => { try { return arbitro || ''; } catch (e) { return ''; } },
    score: () => { try { return score || 0; } catch (e) { return 0; } },
    salvo: () => { try { return typeof saved !== 'undefined' && !!saved; } catch (e) { return false; } },
    ultimaContagem: () => {   // última contagem que ficou no placar ou no count (correção tira a última válida)
      try { const v = [], nc = []; (logs || []).forEach((l) => { if (l.type === 'VALID') v.push(l.ts); else if (l.type === 'CORRECTION_MINUS') v.pop(); else if (l.type === 'NO_COUNT') nc.push(l.ts); });
        const a = v.length ? v[v.length - 1] : null, b = nc.length ? nc[nc.length - 1] : null; return a === null ? b : (b === null ? a : Math.max(a, b)); } catch (e) { return null; }
    },
    primeiraContagem: () => { try { const l = (logs || []).find((x) => x.type === 'VALID'); return l ? l.ts : null; } catch (e) { return null; } },   // placar 0→1
    reps: () => {   // repete o log: VALID soma, CORRECTION_MINUS tira a última
      try { const r = []; (logs || []).forEach((l) => { if (l.type === 'VALID') r.push(l.ts); else if (l.type === 'CORRECTION_MINUS') r.pop(); }); return r; } catch (e) { return []; }
    },
    dispositivo: () => { try { return typeof deviceId === 'function' ? deviceId() : null; } catch (e) { return null; } },
    toast: (m, k) => { try { if (typeof showToast === 'function') showToast(m, k); } catch (e) {} }
  };
  const uuid = () => { try { if (typeof novoUUID === 'function') return novoUUID(); } catch (e) {} return 'h1-' + Date.now() + '-' + Math.random().toString(16).slice(2); };
  const normNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');

  // ---------- estado ----------
  const S = {
    dev: null, char: null, sim: null, nome: '', bateria: null,
    conectado: false, reconectando: false, falhasReconexao: 0, manualOff: false,
    ultimo: null,                  // { t, b, ok }
    buffer: [],                    // amostras recentes [[t,b]] (para teste e repouso)
    sessao: null,                  // sessão em gravação
    wake: null, rr: false, contatoSuportado: false
  };

  // ---------- estilos ----------
  const css = `
  #h1-ind{position:fixed;top:calc(5px + env(safe-area-inset-top,0px));left:calc(32px + env(safe-area-inset-left,0px));z-index:310;display:none;align-items:center;gap:3px;height:20px;padding:0 6px 0 4px;border-radius:10px;background:rgba(0,0,0,.45);color:#fff;font:600 12px/1 system-ui,sans-serif;letter-spacing:.2px;user-select:none;-webkit-user-select:none;touch-action:none}
  #h1-ind svg{width:11px;height:13px;flex:none}
  #h1-ind[data-s=ok] svg{color:#2fbf6b} #h1-ind[data-s=warn] svg{color:#ffcc00} #h1-ind[data-s=bad] svg{color:#ff4a4a}
  #h1-ind[data-s=bad] .h1-bpm{opacity:.6}
  #h1-leg{position:fixed;top:calc(30px + env(safe-area-inset-top,0px));left:calc(8px + env(safe-area-inset-left,0px));z-index:320;max-width:280px;background:#1b1b1b;color:#eee;border:1px solid #444;border-radius:10px;padding:10px 12px;font:13px/1.45 system-ui,sans-serif;display:none}
  #h1-leg b{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:-1px}
  .h1-ov{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.72);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:max(16px,env(safe-area-inset-top)) 12px 24px}
  .h1-box{width:100%;max-width:560px;background:#141414;color:#f2f2f2;border:1px solid #333;border-radius:16px;padding:18px 18px 16px;font:15px/1.5 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5)}
  .h1-box h2{margin:0 0 4px;font-size:1.25rem;color:#ffcc00} .h1-box h3{margin:16px 0 6px;font-size:1.02rem}
  .h1-sub{color:#aaa;font-size:.88rem;margin:0 0 12px}
  .h1-steps{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:10px}
  .h1-steps li{position:relative;padding:8px 10px 8px 44px;border-radius:10px;background:#1d1d1d;color:#888;min-height:32px}
  .h1-steps li::before{content:attr(data-n);position:absolute;left:8px;top:7px;width:26px;height:26px;border-radius:50%;background:#333;color:#aaa;font-weight:700;display:flex;align-items:center;justify-content:center}
  .h1-steps li.cur{color:#fff;background:#232323;outline:1px solid #ffcc0055} .h1-steps li.cur::before{background:#ffcc00;color:#000}
  .h1-steps li.done{color:#bbb} .h1-steps li.done::before{content:'✓';background:#2fbf6b;color:#000}
  .h1-steps li.fail::before{content:'!';background:#ff4a4a;color:#000}
  .h1-st{margin-top:6px;font-size:.92rem} .h1-err{color:#ff8080} .h1-ok{color:#5fd88f} .h1-warn{color:#ffd24d}
  .h1-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
  .h1-btn{appearance:none;border:0;border-radius:10px;padding:10px 14px;font:600 .95rem system-ui,sans-serif;cursor:pointer;background:#ffcc00;color:#000}
  .h1-btn.sec{background:#2a2a2a;color:#eee;border:1px solid #444} .h1-btn.dan{background:#3a1515;color:#ffb3b3;border:1px solid #6a2a2a}
  .h1-btn:disabled{opacity:.45;cursor:default}
  .h1-box{position:relative} .h1-canto{position:absolute;top:12px;right:12px;display:flex;gap:6px;align-items:center;appearance:none;border:1px solid #555;background:#222;color:#eee;border-radius:999px;padding:5px 10px;font:600 .8rem system-ui,sans-serif;cursor:pointer} .h1-canto svg{width:14px;height:14px}
  .h1-q{background:#1d1d1d;border:1px solid #333;border-radius:10px;padding:8px 12px;margin:8px 0;font-size:.9rem}
  .h1-big{font:800 3rem/1 system-ui,sans-serif;margin:6px 0;color:#fff} .h1-big small{font-size:1rem;color:#aaa;font-weight:600}
  .h1-chk{display:flex;gap:8px;align-items:flex-start;margin-top:8px}
  .h1-chk input{width:20px;height:20px;margin-top:2px}
  .h1-in{width:100%;box-sizing:border-box;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:8px;padding:8px 10px;font:15px system-ui,sans-serif}
  .h1-grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px} .h1-grid2 label{font-size:.82rem;color:#bbb}
  .h1-list{display:flex;flex-direction:column;gap:6px} .h1-item{display:flex;justify-content:space-between;gap:8px;padding:10px;border-radius:10px;background:#1d1d1d;cursor:pointer;border:1px solid #2c2c2c}
  .h1-item:hover{border-color:#555} .h1-item small{color:#999}
  .h1-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-top:8px}
  .h1-card{background:#1d1d1d;border:1px solid #2c2c2c;border-radius:12px;padding:10px;position:relative}
  .h1-card .t{font-size:.8rem;color:#bbb;padding-right:22px} .h1-card .v{font:800 1.45rem/1.15 system-ui,sans-serif;margin-top:4px} .h1-card .u{font-size:.8rem;color:#999;font-weight:600}
  .h1-card .i{position:absolute;top:8px;right:8px;width:20px;height:20px;border-radius:50%;border:1px solid #555;background:none;color:#ccc;font:700 12px system-ui;cursor:pointer;padding:0}
  .rf-ess{display:inline-block;font:700 .6rem/1 system-ui,sans-serif;letter-spacing:.04em;color:#ffcc00;border:1px solid #6b5a00;border-radius:5px;padding:2px 5px;margin:6px 0 0 6px}
  .h1-card .m{font-size:.8rem;color:#aaa;margin-top:4px}
  .h1-card .n{display:none;font-size:.78rem;color:#ccc;margin-top:6px;border-top:1px solid #333;padding-top:6px} .h1-card.op .n{display:block}
  .h1-sel{display:inline-block;font:700 .66rem/1 system-ui;padding:3px 6px;border-radius:6px;margin-top:6px;letter-spacing:.3px}
  .lv-A{background:#14432a;color:#7fe0a6} .lv-B{background:#143049;color:#8cc8ff} .lv-C{background:#4a3010;color:#ffc477} .lv-D{background:#24323f;color:#b9cbdc} .lv-E,.lv-X{background:#2c2c2c;color:#aaa} .lv-R{background:#22303a;color:#a9c4d6}
  .h1-card.lvE,.h1-card.lvX{opacity:.75} .h1-card.wide,.h1-card.op{grid-column:1/-1}
  .h1-zon{width:100%;border-collapse:collapse;font-size:.82rem;margin-top:6px} .h1-zon td{padding:2px 0} .h1-zon .bar{height:8px;border-radius:4px;background:#ffcc00}
  .h1-tab{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:6px} .h1-tab th,.h1-tab td{border-bottom:1px solid #2a2a2a;padding:4px 6px;text-align:right} .h1-tab th:first-child,.h1-tab td:first-child{text-align:left}
  .h1-aviso{font-size:.8rem;color:#999;margin-top:14px;border-top:1px solid #2a2a2a;padding-top:10px}
  .h1-chart{width:100%;height:160px;background:#0e0e0e;border-radius:10px;margin-top:8px}
  .kb-mock{outline:2px dashed #ff8c00!important;outline-offset:2px}.kb-mock-tag{display:inline-block;font:700 .62rem/1 system-ui,sans-serif;letter-spacing:.06em;color:#ff8c00;border:1px dashed #ff8c00;border-radius:5px;padding:2px 5px;margin-left:6px;vertical-align:2px}
  .kb-sf{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;margin-left:5px;border:1px dotted #b47cff;border-radius:50%;color:#b47cff;font:700 8px/1 system-ui,sans-serif;vertical-align:1px;cursor:help}
  .h1-tgl{display:flex;align-items:center;gap:8px;font-size:.88rem;color:#ccc;margin-top:10px}
  .h1-fig{background:#0e0e0e;border:1px solid #2a2a2a;border-radius:12px;padding:8px;margin:10px 0}
  .h1-fig svg{display:block;width:100%;height:auto}
  .h1-ori{margin:6px 0 0;padding-left:20px;font-size:.9rem} .h1-ori li{margin:5px 0}
  .h1-timer{font:800 3.6rem/1 system-ui,sans-serif;text-align:center;margin:12px 0 2px;color:#ffcc00;font-variant-numeric:tabular-nums}
  .h1-timer.run{color:#fff} .h1-tmb{text-align:center;color:#bbb;font-size:.92rem}
  .h1-mom{display:flex;flex-direction:column;gap:4px}
  .h1-mais{margin-top:10px} .h1-mais summary{cursor:pointer;color:#8cc8ff}
  `;
  const st = document.createElement('style'); st.id = 'h1-css'; st.textContent = css; document.head.appendChild(st);

  // ---------- indicador no topo ----------
  const BT_SVG = '<svg viewBox="0 0 12 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 4.5l8 7-4 3.5V1l4 3.5-8 7"/></svg>';
  const ind = document.createElement('div'); ind.id = 'h1-ind'; ind.setAttribute('role', 'img'); ind.innerHTML = BT_SVG + '<span class="h1-bpm">--</span>';
  const leg = document.createElement('div'); leg.id = 'h1-leg';
  leg.innerHTML = '<div style="font-weight:700;margin-bottom:4px">Sensor cardíaco</div><div><b style="background:#2fbf6b"></b>Recebendo a FC</div><div><b style="background:#ffcc00"></b>Sinal suspeito ou reconectando</div><div><b style="background:#ff4a4a"></b>Conexão perdida</div><div style="margin-top:6px;color:#aaa;font-size:12px" id="h1-leg-info"></div>';
  document.body.appendChild(ind); document.body.appendChild(leg);
  let legT = null;
  ind.addEventListener('pointerdown', (e) => { e.stopPropagation(); clearTimeout(legT); legT = setTimeout(() => { atualizaLegenda(); leg.style.display = 'block'; }, 450); });
  ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => ind.addEventListener(t, () => clearTimeout(legT)));
  ind.addEventListener('click', (e) => { e.stopPropagation(); if (leg.style.display === 'block') leg.style.display = 'none'; });
  document.addEventListener('pointerdown', (e) => { if (e.target !== ind && !ind.contains(e.target)) leg.style.display = 'none'; });
  function atualizaLegenda() {
    const b = S.bateria !== null ? ' · bateria ' + S.bateria + '%' : '';
    document.getElementById('h1-leg-info').textContent = (S.nome || 'sensor') + b + (S.sessao ? ' · gravando' : '');
  }

  function estado() {
    if (!S.conectado && !S.reconectando) return 'off';
    if (S.reconectando && S.falhasReconexao >= 3) return 'bad';
    if (S.reconectando) return 'warn';
    const u = S.ultimo;
    if (!u || Date.now() - u.t > 3500) return 'warn';
    return u.ok ? 'ok' : 'warn';
  }
  function renderInd() {
    const s = estado();
    if (s === 'off') { ind.style.display = 'none'; return; }
    ind.style.display = 'inline-flex'; ind.dataset.s = s; ind.classList.toggle('kb-mock', !!S.sim); ind.title = S.sim ? 'Simulador (dado fictício)' : '';
    const recente = S.ultimo && Date.now() - S.ultimo.t < 3500 && Number.isFinite(S.ultimo.b);
    ind.querySelector('.h1-bpm').textContent = (s === 'bad' || !recente) ? '--' : String(S.ultimo.b);
    ind.setAttribute('aria-label', 'Sensor cardíaco: ' + ({ ok: 'recebendo', warn: 'sinal suspeito ou reconectando', bad: 'conexão perdida' })[s] + (recente ? ', ' + S.ultimo.b + ' batimentos por minuto' : ''));
  }

  // ---------- validação em tempo real (mesma regra do relatório) ----------
  let runVal = null, runIni = 0;
  function recebe(b, t) {
    t = t || Date.now();
    const prev = S.ultimo;
    let ok = Number.isFinite(b) && b >= 30 && b <= 230;
    if (ok && prev && Number.isFinite(prev.b) && t - prev.t <= 1500 && Math.abs(b - prev.b) > 30) ok = false;
    if (b !== runVal) { runVal = b; runIni = t; } else if (t - runIni > 10000) ok = false;
    S.ultimo = { t, b, ok };
    S.buffer.push([t, b]); if (S.buffer.length > 900) S.buffer.splice(0, S.buffer.length - 900);
    if (S.sessao) gravaAmostra(t, b);
    renderInd();
    if (window.__h1Ouvinte) try { window.__h1Ouvinte(t, b, ok); } catch (e) {}
  }

  // ---------- Bluetooth ----------
  function parseHR(dv) {
    const flags = dv.getUint8(0);
    const b = (flags & 1) ? dv.getUint16(1, true) : dv.getUint8(1);
    const suporta = !!(flags & 4), contato = !!(flags & 2);
    S.contatoSuportado = suporta; if (flags & 16) S.rr = true;
    return (suporta && !contato) ? NaN : b;
  }
  async function conectaGatt() {
    const server = await S.dev.gatt.connect();
    const svc = await server.getPrimaryService('heart_rate');
    const ch = await svc.getCharacteristic('heart_rate_measurement');
    ch.addEventListener('characteristicvaluechanged', (ev) => { try { recebe(parseHR(ev.target.value)); } catch (e) {} });
    await ch.startNotifications();
    S.char = ch;
    try { const bs = await server.getPrimaryService('battery_service'); const bc = await bs.getCharacteristic('battery_level'); const v = await bc.readValue(); S.bateria = v.getUint8(0); } catch (e) { /* bateria opcional */ }
  }
  async function procurar() {
    S.dev = await navigator.bluetooth.requestDevice({ filters: [{ services: ['heart_rate'] }], optionalServices: ['battery_service'] });
    S.nome = S.dev.name || 'Sensor';
    S.dev.addEventListener('gattserverdisconnected', aoDesconectar);
    await conectaGatt();
    aoConectar();
  }
  function aoConectar() { S.buffer = []; S.conectado = true; S.reconectando = false; S.falhasReconexao = 0; S.manualOff = false; pedeTelaAcesa(); renderInd(); }
  function aoDesconectar() {
    S.conectado = false; S.char = null;
    if (S.manualOff) { S.reconectando = false; renderInd(); return; }
    S.reconectando = true; renderInd();
    tentaReconectar();
  }
  let recT = null;
  function tentaReconectar() {
    clearTimeout(recT);
    const espera = [1000, 2000, 4000, 8000][S.falhasReconexao] || 10000;
    recT = setTimeout(async () => {
      if (S.manualOff) return;
      try {
        if (S.sim) { await S.sim.reconecta(); } else { await conectaGatt(); }
        aoConectar(); C.toast('Sensor cardíaco reconectado');
      } catch (e) { S.falhasReconexao++; renderInd(); tentaReconectar(); }
    }, espera);
  }
  function desconectar() {
    S.manualOff = true; clearTimeout(recT);
    try { if (S.sim) S.sim.para(); else if (S.dev && S.dev.gatt.connected) S.dev.gatt.disconnect(); } catch (e) {}
    S.conectado = false; S.reconectando = false; S.sim = null; S.dev = null; S.ultimo = null;
    soltaTelaAcesa(); renderInd();
  }

  // ---------- tela acesa e atualização adiada ----------
  async function pedeTelaAcesa() { try { if ('wakeLock' in navigator && !S.wake) { S.wake = await navigator.wakeLock.request('screen'); S.wake.addEventListener('release', () => { S.wake = null; }); } } catch (e) {} }
  function soltaTelaAcesa() { try { if (S.wake) S.wake.release(); } catch (e) {} S.wake = null; }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && (S.conectado || S.reconectando)) pedeTelaAcesa(); });
  const reloadOriginal = window.__kbReload || (() => location.reload());
  let avisoUpd = 0;
  window.__kbReload = function () {
    if (S.conectado || S.reconectando || S.sessao) {
      if (Date.now() - avisoUpd > 60000) { avisoUpd = Date.now(); C.toast('Atualização adiada: sensor cardíaco em uso'); }
      return;
    }
    reloadOriginal();
  };

  // ---------- simulador ----------
  function Simulador(opts) {
    opts = opts || {};
    let t = null, hr = 74, alvoRep = 74, ligado = true, congela = 0, falha = 0, caiAte = 0, proxQueda = Date.now() + (opts.quedaS || 240) * 1000;
    const quedas = opts.quedas !== false;
    this.nome = 'SIMULADOR'; this.bateria = 53;
    this.inicia = () => {
      t = setInterval(() => {
        if (!ligado) return;
        const agora = Date.now();
        if (quedas && agora > proxQueda) { proxQueda = agora + (opts.quedaS || 240) * 1000; caiAte = agora + 8000; ligado = false; aoDesconectar(); return; }
        const emProva = C.ativo() && !C.finalizado();
        const fimP = C.fim();
        let alvo;
        if (emProva) { const min = (agora - (C.inicio() || agora)) / 60000; alvo = 158 + Math.min(18, min * 1.6); }
        else if (fimP && agora - fimP < 180000) alvo = 96;
        else alvo = alvoRep;
        const tau = emProva ? 25 : 40;
        hr += (alvo - hr) / tau + (Math.random() - 0.5) * 2.4;
        if (congela > 0) { congela--; recebe(Math.round(this._ult || hr)); return; }
        if (falha > 0) { falha--; return; }
        if (Math.random() < 0.004) congela = 12;
        if (Math.random() < 0.015) falha = 2 + Math.floor(Math.random() * 3);
        this._ult = Math.round(hr);
        recebe(this._ult);
      }, 1000);
    };
    this.reconecta = () => new Promise((ok, no) => { if (Date.now() < caiAte) return no(new Error('fora de alcance')); ligado = true; ok(); });
    this.para = () => { clearInterval(t); ligado = false; };
  }
  function iniciaSimulador(opts) {
    S.sim = new Simulador(opts); S.nome = S.sim.nome; S.bateria = S.sim.bateria; S.sim.inicia(); aoConectar();
  }

  // ---------- sessões (gravação ligada à prova) ----------
  function novaSessao() {
    S.sessao = {
      id: uuid(), prova_id: C.provaId(), atleta: C.atleta(), movimento: C.movimento(), pista: C.pista(), arbitro: C.arbitro(),
      dispositivo_id: C.dispositivo(), sensor_nome: S.nome, bateria_ini: S.bateria, simulado: !!S.sim,
      inicio: C.inicio() || Date.now(), fim: null, amostras: [], reps: [], score: 0, criado_em: new Date().toISOString()
    };
    // contexto para o registro/estudo: posição do sensor e FC de repouso com o protocolo usado
    const pf = perfilDe(S.sessao.atleta);
    S.sessao.contexto = { sensor_posicao: posicaoSensor(), fc_repouso: pf.fcRepouso || null, fc_repouso_protocolo: pf.fcRepousoProtocolo || (pf.fcRepouso ? 'manual' : null), fc_repouso_em: pf.fcRepousoEm || null, fc_repouso_momento: pf.fcRepousoMomento || null, fc_repouso_segundos: pf.fcRepousoLeituras || null, fc_repouso_reinicios: Number.isFinite(pf.fcRepousoReinicios) ? pf.fcRepousoReinicios : null, fc_repouso_postura: pf.fcRepousoPostura || null, versao_metricas: KBMetricas.VERSAO };
    // guarda o minuto antes do Iniciar (FC antes da largada) e o que chegou entre o Iniciar e a abertura da sessão
    const pre = (KBMetricas.PRE_PROVA_S || 60) * 1000, ini = S.sessao.inicio;
    const desde = Math.max(ini - pre, S.fimAnterior || 0);   // nunca leituras da sessão anterior
    S.buffer.forEach((a) => { if (a[0] > desde) S.sessao.amostras.push([a[0], Number.isFinite(a[1]) ? a[1] : null]); });
    S.sessao.contexto.pre_prova_s = (KBMetricas.PRE_PROVA_S || 60);
  }
  function gravaAmostra(t, b) {
    const s = S.sessao;
    if (t < s.inicio - (KBMetricas.PRE_PROVA_S || 60) * 1000 || t <= (S.fimAnterior || 0)) return;
    if (s.amostras.length && t <= s.amostras[s.amostras.length - 1][0]) return;   // já veio do buffer
    if (s.fim && t > s.fim + KBMetricas.POS_PROVA_S * 1000) return;
    s.amostras.push([t, Number.isFinite(b) ? b : null]);
  }
  function fechaSessao(motivo) {
    const s = S.sessao; if (!s) return; S.sessao = null; lsDel(K_ATUAL);
    S.fimAnterior = Date.now(); S.buffer = [];   // a próxima sessão não herda leituras desta
    if (!s.fim) s.fim = s.amostras.length ? s.amostras[s.amostras.length - 1][0] : Date.now();
    s.encerrada = motivo || 'normal';
    aplicaJanela(s);
    s.contexto.rec_motivo_fim = /nova prova/.test(s.encerrada) ? 'proximo_atleta' : (/interrompida/.test(s.encerrada) ? 'pagina_recarregada' : 'tempo_completo');
    if (/nova prova/.test(s.encerrada)) s.contexto.eventos.troca_atleta = S.fimAnterior;
    try { s.contexto = s.contexto || {}; s.contexto.consentimento = Object.assign({ atualizado_em: new Date().toISOString() }, (window.kbQuest && kbQuest.consentimentoDe(s.atleta)) || { origem: 'nao_identificado', gravacao: false, estudo: false }); } catch (e) {}
    s.amostras = s.amostras.map((a) => [a[0], a[1] === null ? NaN : a[1]]);
    const perf = perfilDe(s.atleta);
    let res = null; try { res = KBMetricas.calcula(s, perf); } catch (e) {}
    if (res && res.suficiente && s.atleta) {
      const k = normNome(s.atleta), P = lsGet(K_PERF, {}); P[k] = Object.assign({}, P[k] || {}, { nome: s.atleta });
      if (res.pico5 !== null && res.pico5 !== undefined) { if (!(P[k].picoHistorico >= res.pico5)) { P[k].picoHistorico = res.pico5; P[k].picoSessoes = [s.id]; } else if (P[k].picoHistorico === res.pico5) P[k].picoSessoes = (P[k].picoSessoes || []).concat(s.id); }
      lsSet(K_PERF, P);
    }
    s.amostras = s.amostras.map((a) => [a[0], Number.isFinite(a[1]) ? a[1] : null]);
    const L = lsGet(K_SESS, []); L.unshift(s); while (L.length > MAX_SESS) L.pop();
    if (!lsSet(K_SESS, L)) { L.length = Math.max(5, Math.floor(L.length / 2)); lsSet(K_SESS, L); }
    const autorizado = s.contexto && s.contexto.consentimento && s.contexto.consentimento.gravacao;
    if (autorizado) { const fila = lsGet(K_FILA, []); fila.push(s.id); lsSet(K_FILA, fila); }   // envio ao banco só de inscritos
    C.toast(autorizado ? 'Relatório de FC salvo: ' + (s.atleta || 'sem nome') : 'FC guardada só neste aparelho: atleta não encontrado na lista de inscritos', autorizado ? undefined : 'err');
  }
  // Janela de captura (decisão de 17/11): a série começa na 1ª contagem (placar 0→1); guarda até 60 s antes dela.
  // Sem nenhuma contagem, a sessão fica com o início do cronômetro e a marca "sem_contagem".
  function aplicaJanela(s) {
    const pre = (KBMetricas.PRE_PROVA_S || 60) * 1000;
    s.contexto = s.contexto || {};
    s.inicio_cronometro = s.inicio_cronometro || s.inicio;
    if (s.serie_inicio && s.serie_inicio >= s.inicio_cronometro && (!s.fim || s.serie_inicio < s.fim)) {
      s.inicio = s.serie_inicio;
      s.contexto.janela = 'primeira_contagem';
    } else { s.contexto.janela = 'sem_contagem'; s.sem_contagem = true; }
    s.amostras = s.amostras.filter((a) => a[0] >= s.inicio - pre);
    s.contexto.pre_prova_s = pre / 1000;
    const prim = s.amostras.length ? s.amostras[0][0] : null, ult = s.amostras.length ? s.amostras[s.amostras.length - 1][0] : null;
    s.contexto.pre_obtido_s = prim !== null && prim < s.inicio ? Math.round((s.inicio - prim) / 1000) : 0;
    s.contexto.rec_disponivel_s = ult !== null && s.fim && ult > s.fim ? Math.round((ult - s.fim) / 1000) : 0;
    s.contexto.eventos = { aquisicao: prim, iniciar: s.inicio_cronometro, primeira_contagem: s.serie_inicio || null, ultima_contagem: s.ultima_contagem || ((s.reps && s.reps.length) ? s.reps[s.reps.length - 1] : null), finalizar: s.fim || null, salvamento: s.salvo_em || null, fim_gravacao: Date.now() };
  }
  let ultSalvo = 0;
  function tick() {
    try {
      const ativo = C.ativo(), fin = C.finalizado(), pid = C.provaId(), agora = Date.now();
      const ligado = S.conectado || S.reconectando;
      if (S.sessao && pid && S.sessao.prova_id !== pid && ativo) fechaSessao('nova prova');
      if (ligado && ativo && !fin && pid && !S.sessao) novaSessao();
      const s = S.sessao;
      if (s) {
        if (ativo && s.prova_id === pid) {
          s.atleta = C.atleta() || s.atleta; s.movimento = C.movimento(); s.pista = C.pista(); s.arbitro = C.arbitro();
          s.score = C.score(); s.reps = C.reps(); { const uc = C.ultimaContagem(); if (uc) s.ultima_contagem = uc; }
          if (!s.serie_inicio) { const pc = C.primeiraContagem(); if (pc) s.serie_inicio = pc; }
          if (!s.salvo_em && C.salvo()) s.salvo_em = agora;
          s.fim = fin ? (C.fim() || agora) : null;
        } else if (!s.fim) s.fim = agora;    // prova descartada ou resetada antes de finalizar
        if (s.fim && agora > s.fim + KBMetricas.POS_PROVA_S * 1000) fechaSessao('normal');
        else if (agora - ultSalvo > 10000) { ultSalvo = agora; lsSet(K_ATUAL, s); }
      }
      renderInd();
      if (painelAberto) renderPainelVivo();
    } catch (e) { try { (window.__h1erros = window.__h1erros || []).push(String((e && e.stack) || e).slice(0, 300)); } catch (x) {} /* nunca derruba o contador */ }
  }
  setInterval(tick, 1000);
  // sessão que ficou aberta (recarga da página no meio da gravação)
  (function recupera() { const a = lsGet(K_ATUAL, null); if (a && a.id) { S.sessao = a; fechaSessao('interrompida (página recarregada)'); } })();

  // ---------- perfis (dados para os cálculos, guardados no aparelho) ----------
  const K_POS = 'kb_h1_posicao_v1';
  const POSICOES = ['braço (bíceps)', 'antebraço', 'pulso'];
  function posicaoSensor() { const v = lsGet(K_POS, POSICOES[0]); return POSICOES.includes(v) ? v : POSICOES[0]; }
  function perfilDe(nome) { const P = lsGet(K_PERF, {}); return Object.assign({}, P[normNome(nome)] || {}); }
  function salvaPerfil(nome, dados) { const P = lsGet(K_PERF, {}), k = normNome(nome); P[k] = Object.assign({}, P[k] || {}, dados, { nome }); lsSet(K_PERF, P); }

  // ---------- janela ----------
  const ov = document.createElement('div'); ov.className = 'h1-ov'; ov.id = 'h1-ov';
  ov.addEventListener('click', (e) => { if (e.target === ov && !fluxo && !repT) fecha(); });   // no fluxo do início e durante os 5 min, toque fora não fecha
  document.body.appendChild(ov);
  let painelAberto = false;
  function mostra(html) { ov.innerHTML = '<div class="h1-box" role="dialog" aria-modal="true">' + html + '</div>'; ov.style.display = 'flex'; ov.scrollTop = 0; }
  function fecha() { ov.style.display = 'none'; ov.innerHTML = ''; painelAberto = false; window.__h1Ouvinte = null; clearInterval(testeT); clearInterval(repT); repT = null; }
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (id) => document.getElementById(id);

  // ---------- passo a passo ----------
  const PASSOS = ['Verificar o aparelho', 'Preparar o sensor', 'Conectar', 'Testar a leitura', 'Funcionando'];
  let passo = 1, statusPasso = '', falhou = false, testeT = null;
  function wizard(conteudo) {
    const lis = PASSOS.map((t, i) => {
      const n = i + 1, cls = n < passo ? 'done' : (n === passo ? (falhou ? 'cur fail' : 'cur') : '');
      return '<li data-n="' + n + '" class="' + cls + '"><strong>' + t + '</strong>' + (n === passo ? '<div>' + conteudo + '</div>' : '') + '</li>';
    }).join('');
    mostra('<button class="h1-canto" type="button" id="h1-termo" title="Termo de participação (consulta)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>Termo</button>' + '<h2>Sensor cardíaco</h2><p class="h1-sub">' + (fluxo ? 'Atleta: <strong>' + esc(fluxo.nome) + '</strong>. Depois de conectar, vem a medida de 5 minutos sentado.' : 'Configure antes da prova. Sem sensor, o contador funciona normalmente.') + '</p><ol class="h1-steps">' + lis + '</ol>' +
      '<div class="h1-btns" style="margin-top:14px"><button class="h1-btn sec" type="button" id="h1-tut5">Tutorial: 5 min sentado</button>' + (fluxo ? '<button class="h1-btn sec" type="button" id="h1-semsens">Seguir sem o sensor</button><button class="h1-btn sec" type="button" id="h1-fechar">Voltar</button>' : '<button class="h1-btn sec" type="button" id="h1-fechar">Fechar</button>') + '</div>' +
      '<p class="h1-aviso">Valores para acompanhamento de treino; não é dispositivo médico. Sensor óptico, não validado no kettlebell.</p>');
    $('h1-fechar').onclick = () => { if (fluxo) cancelaFluxo(); else fecha(); }; if ($('h1-semsens')) $('h1-semsens').onclick = sigaParaProva; $('h1-tut5').onclick = () => { const p = passo; tutorial5(() => { if (p >= 5) passo5(); else if (p === 4 && (S.conectado || S.reconectando)) passo4(); else if (p >= 3) passo3(); else if (p === 2) passo2(); else passo1(); }); }; ligaTermo();
  }
  async function passo1() {
    passo = 1; falhou = false;
    const simLink = '<div class="h1-st" style="margin-top:10px"><a href="#" id="h1-sim" style="color:#8cc8ff">Usar simulador (teste sem o aparelho)</a></div>';
    if (!('bluetooth' in navigator)) {
      falhou = true;
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      wizard('<div class="h1-st h1-err">' + (ios ? 'O iPhone/iPad não permite Bluetooth em sites. Use um celular Android ou um computador com Chrome ou Edge.' : 'Este navegador não tem Bluetooth para sites. Abra o contador no Chrome ou no Edge.') + '</div>' + simLink);
      ligaSim(); return;
    }
    if (!window.isSecureContext) { falhou = true; wizard('<div class="h1-st h1-err">O Bluetooth só funciona com o site em https.</div>' + simLink); ligaSim(); return; }
    wizard('<div class="h1-st">Verificando o Bluetooth…</div>');
    let disp = true; try { if (navigator.bluetooth.getAvailability) disp = await navigator.bluetooth.getAvailability(); } catch (e) {}
    if (!disp) {
      falhou = true;
      wizard('<div class="h1-st h1-err">O Bluetooth do aparelho parece desligado. Ligue o Bluetooth e toque em Verificar de novo.</div><div class="h1-btns"><button class="h1-btn" id="h1-v">Verificar de novo</button></div>' + simLink);
      $('h1-v').onclick = passo1; ligaSim(); return;
    }
    passo2();
  }
  function ligaSim() { const a = $('h1-sim'); if (a) a.onclick = (e) => { e.preventDefault(); iniciaSimulador(); passo = 4; passo4(); }; }
  function passo2() {
    passo = 2; falhou = false;
    wizard('<div class="h1-st">Coloque o sensor <strong>bem justo</strong> no bíceps ou no antebraço do atleta e ligue segurando o botão até a luz piscar.</div><div class="h1-btns"><button class="h1-btn" id="h1-p2">Pronto, continuar</button></div><div class="h1-st" style="margin-top:8px"><a href="#" id="h1-sim" style="color:#8cc8ff">Usar simulador (teste sem o aparelho)</a></div>');
    $('h1-p2').onclick = passo3; ligaSim();
  }
  function passo3(msg) {
    passo = 3; falhou = !!msg;
    wizard('<div class="h1-st">Toque em <strong>Procurar sensor</strong> e escolha o aparelho na lista (ex.: H1_77260).</div>' + (msg ? '<div class="h1-st h1-err">' + esc(msg) + '</div>' : '') + '<div class="h1-btns"><button class="h1-btn" id="h1-p3">Procurar sensor</button></div><div class="h1-st" id="h1-p3s"></div>');
    $('h1-p3').onclick = async () => {
      $('h1-p3').disabled = true; $('h1-p3s').textContent = 'Conectando…';
      try { await procurar(); passo4(); }
      catch (e) {
        const m = e && e.name === 'NotFoundError' ? 'Nenhum sensor escolhido. Confira se ele está ligado e perto, e tente de novo.' : 'Não foi possível conectar: ' + (e && e.message ? e.message : 'erro desconhecido') + '. Desligue e ligue o sensor e tente de novo.';
        passo3(m);
      }
    };
  }
  function passo4() {
    passo = 4; falhou = false;
    const bat = S.bateria !== null ? (S.bateria < 20 ? '<span class="h1-warn">bateria ' + S.bateria + '% (baixa: carregue antes da prova)</span>' : 'bateria ' + S.bateria + '%') : 'bateria não informada';
    wizard('<div class="h1-st h1-ok">Conectado: <strong>' + esc(S.nome) + '</strong> · ' + bat + '</div><div class="h1-st">Com o atleta <strong>parado</strong>, testando a leitura por 10 segundos…</div><div class="h1-big" id="h1-bpm">--<small> bpm</small></div><div class="h1-st" id="h1-t4">10 s</div><div id="h1-r4"></div>');
    const lidas = []; let seg = 10;
    window.__h1Ouvinte = (t, b, ok) => { lidas.push({ b, ok }); const e = $('h1-bpm'); if (e) e.innerHTML = (Number.isFinite(b) ? b : '--') + '<small> bpm</small>'; };
    clearInterval(testeT);
    testeT = setInterval(() => {
      seg--; const e = $('h1-t4'); if (e) e.textContent = seg + ' s';
      if (seg > 0) return;
      clearInterval(testeT); window.__h1Ouvinte = null;
      const val = lidas.filter((l) => l.ok).map((l) => l.b);
      const varia = new Set(val).size >= 2;
      const r = $('h1-r4'); if (!r) return;
      if (val.length >= 8 && varia) {
        r.innerHTML = '<div class="h1-st h1-ok">' + val.length + ' leituras válidas (de ' + Math.min(...val) + ' a ' + Math.max(...val) + ' bpm).</div><label class="h1-chk"><input type="checkbox" id="h1-c4"><span>O atleta está parado e o valor parece normal.</span></label><div class="h1-btns"><button class="h1-btn" id="h1-p4" disabled>Continuar</button><button class="h1-btn sec" id="h1-r4b">Testar de novo</button></div>';
        $('h1-c4').onchange = (ev) => { $('h1-p4').disabled = !ev.target.checked; };
        $('h1-p4').onclick = passo5; $('h1-r4b').onclick = passo4;
      } else {
        falhou = true;
        const why = val.length < 8 ? 'Só ' + val.length + ' leituras válidas em 10 s (mínimo 8).' : 'O valor não variou (sensor pode estar fora da pele).';
        r.innerHTML = '<div class="h1-st h1-err">' + why + ' Aperte o sensor no braço e tente de novo.</div><div class="h1-btns"><button class="h1-btn" id="h1-r4b">Testar de novo</button><button class="h1-btn sec" id="h1-desc4">Desconectar</button></div>';
        $('h1-r4b').onclick = passo4; $('h1-desc4').onclick = () => { desconectar(); passo3(); };
      }
    }, 1000);
  }
  const MEDE_REPOUSO = true;   // 17/11 (madrugada): Allan pediu a medida de 5 min sentado sempre que o sensor for usado em um atleta
  function passo5() {
    passo = 5; falhou = false;
    wizard('<div class="h1-st h1-ok"><strong>Funcionando ✓</strong> O ícone ' + BT_SVG.replace('<svg', '<svg style="width:10px;height:12px;color:#2fbf6b;vertical-align:-1px"') + ' e o BPM ficam no topo da tela. A FC é gravada sozinha em cada prova.</div>' +
      '<h3>Onde está o sensor?</h3><select class="h1-in" id="h1-pos" aria-label="Posição do sensor">' + POSICOES.map((p) => '<option' + (p === posicaoSensor() ? ' selected' : '') + '>' + p + '</option>').join('') + '</select><div class="h1-st" style="font-size:.8rem">O braço (bíceps) teve a melhor precisão entre as posições testadas (Moghaddam et al., 2026).</div>' +
      '<div class="h1-btns">' + (fluxo ? '<button class="h1-btn" id="h1-ok5">Continuar: 5 minutos sentado</button>' : '<button class="h1-btn sec" id="h1-rep">Medir 5 min sentado</button><button class="h1-btn" id="h1-ok5">Concluir</button>') + '</div>');
    $('h1-pos').onchange = (e) => lsSet(K_POS, e.target.value);
    $('h1-ok5').onclick = fluxo ? telaRepouso : fecha;
    if ($('h1-rep')) $('h1-rep').onclick = telaRepouso;
  }

  // ---------- medida de 5 min sentado (sempre que o sensor for usado em um atleta) ----------
  const REP_S = 300;
  let fluxo = null;   // { nome, depois, cancela }: veio da tela de início do contador
  let repT = null;
  const ILUSTRA_REP = '<svg viewBox="0 0 320 170" role="img" aria-label="Atleta sentado numa cadeira, costas apoiadas, pés no chão, com o sensor no bíceps, durante 5 minutos" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
    '<line x1="20" y1="160" x2="300" y2="160" stroke="#444" stroke-width="2"/>' +
    '<g stroke="#8a8a8a" stroke-width="4"><line x1="70" y1="112" x2="140" y2="112"/><line x1="138" y1="48" x2="138" y2="112"/><line x1="76" y1="112" x2="76" y2="160"/><line x1="134" y1="112" x2="134" y2="160"/></g>' +
    '<g stroke="#f2f2f2" stroke-width="7"><circle cx="118" cy="34" r="13" stroke-width="5"/><line x1="121" y1="50" x2="126" y2="104"/><line x1="126" y1="104" x2="84" y2="106"/><line x1="84" y1="106" x2="82" y2="156"/><line x1="82" y1="156" x2="66" y2="157"/>' +
    '<line x1="120" y1="58" x2="108" y2="84"/><line x1="108" y1="84" x2="90" y2="100"/></g>' +
    '<rect x="105" y="64" width="16" height="10" rx="3" transform="rotate(-62 113 69)" fill="#ffcc00" stroke="#000" stroke-width="1.5"/>' +
    '<line x1="122" y1="70" x2="172" y2="40" stroke="#ffcc00" stroke-width="1.5"/><text x="174" y="38" fill="#ffcc00" font-family="system-ui,sans-serif" font-size="12" font-weight="700" stroke="none">sensor no bíceps</text>' +
    '<circle cx="250" cy="88" r="34" stroke="#ffcc00" stroke-width="4"/><line x1="250" y1="88" x2="250" y2="66" stroke="#ffcc00" stroke-width="4"/><line x1="250" y1="88" x2="266" y2="98" stroke="#ffcc00" stroke-width="4"/>' +
    '<text x="250" y="142" text-anchor="middle" fill="#fff" font-family="system-ui,sans-serif" font-size="15" font-weight="800" stroke="none">5 minutos</text>' +
    '<text x="250" y="158" text-anchor="middle" fill="#bbb" font-family="system-ui,sans-serif" font-size="11" stroke="none">sentado e quieto</text></svg>';
  const TUT5 = '<h3>Como fazer</h3><ol class="h1-ori">' +
      '<li>Sensor <strong>bem justo no bíceps</strong>, sobre a pele seca. O ícone no topo da tela precisa estar verde.</li>' +
      '<li>Atleta <strong>sentado</strong>, costas apoiadas e pés no chão. <strong>Sem falar, sem celular e sem levantar</strong>.</li>' +
      '<li>Marque <strong>antes ou depois do aquecimento</strong> (explicação abaixo).</li>' +
      '<li>Toque em <strong>Iniciar os 5 minutos</strong>. Se o atleta se mexer ou falar, toque em <strong>Reiniciar os 5 minutos</strong>.</li>' +
      '<li>No fim, o valor é salvo sozinho. Depois: aquecimento e prova com o sensor no braço, <strong>perto deste computador</strong>.</li></ol>' +
    '<h3>Antes ou depois do aquecimento?</h3><ul class="h1-ori">' +
      '<li><strong>Antes do aquecimento</strong>: o atleta ainda não aqueceu hoje. É o melhor momento: dá para medir pelo menu (Sensor cardíaco → Medir 5 min sentado) e, na hora da prova, tocar em "Usar esta medida".</li>' +
      '<li><strong>Depois do aquecimento</strong>: o atleta já aqueceu, mesmo que pouco. Na dúvida, marque esta.</li></ul>' +
    '<h3>Se não seguir corretamente</h3><ul class="h1-ori">' +
      '<li>Falar, mexer ou levantar: a FC sobe, e o TRIMP de Banister, o EPOC e o índice da reserva saem <strong>menores</strong> do que deveriam.</li>' +
      '<li>Sensor frouxo: faltam leituras e a medida <strong>não é salva</strong> (precisa de 45 s com leitura no último minuto).</li>' +
      '<li>Medir depois do aquecimento: os valores saem, com um <strong>"i" roxo</strong> avisando que não estão totalmente alinhados com os estudos.</li>' +
      '<li>Marcar o momento errado: o relatório explica o resultado de forma errada.</li>' +
      '<li>Pular a medida: TRIMP de Banister, EPOC e índice da reserva <strong>não podem ser calculados</strong> nesta prova.</li></ul>' +
    '<h3>O que aparece nos resultados</h3><ul class="h1-ori">' +
      '<li><strong>FC sentado antes da prova (5 min)</strong>.</li>' +
      '<li><strong>TRIMP de Banister</strong>, <strong>EPOC (indicador experimental)</strong> e <strong>índice relativo à FC sentada</strong>, como estimativas, com o "i" explicando a adaptação.</li>' +
      '<li>Se foi depois do aquecimento, o "i" diz que os valores não estão totalmente alinhados com os estudos.</li></ul>' +
    '<details class="h1-mais"><summary>Mais orientações</summary><ul class="h1-ori">' +
      '<li>Use na prova <strong>este mesmo computador</strong>: a medida fica guardada só nele.</li>' +
      '<li>Sempre sentado, para comparar: deitado a FC fica mais baixa (Gonzales et al., 2023). Ela só estabiliza depois de 5 min sentado (Hart, 2015).</li>' +
      '<li>No dia da competição, a FC sentada sobe mesmo antes do aquecimento: 86 contra 73 bpm dois dias antes (Serafim, 2023). Depois do aquecimento, sobe mais.</li>' +
      '<li>Longe demais do computador, a conexão cai e a FC não é gravada.</li>' +
      '<li>Depois da prova: se der, o atleta fica perto mais 2 minutos com o sensor (recuperação). Questionário pós-prova: sensação a partir de 5 min; esforço perto de 30 min depois.</li>' +
      '<li>Antes do próximo atleta, limpe o sensor e a braçadeira.</li></ul></details>';
  function tutorial5(volta) {
    mostra('<h2>Tutorial: medida de 5 minutos sentado</h2><p class="h1-sub">Feita sempre que o sensor for usado em um atleta, antes da prova.</p><div class="h1-fig">' + ILUSTRA_REP + '</div>' + TUT5 + '<div class="h1-btns"><button class="h1-btn" id="h1-tut-ok">Entendi</button></div>');
    $('h1-tut-ok').onclick = () => { if (typeof volta === 'function') volta(); else fecha(); };
  }
  const mmss = (x) => Math.floor(x / 60) + ':' + String(x % 60).padStart(2, '0');
  function naListaDeInscritos(nome) { try { return !!(window.kbQuest && nome && kbQuest.consentimentoDe(nome).origem === 'inscricao'); } catch (e) { return false; } }
  function medidaDeHoje(nome) {
    const p = perfilDe(nome); if (p.fcRepousoProtocolo !== '5min' || !p.fcRepousoEm || !Number.isFinite(p.fcRepouso)) return null;
    const d = new Date(p.fcRepousoEm), h = new Date(); return (d.toDateString() === h.toDateString() && d <= h) ? p : null;
  }
  function pararRep() { clearInterval(repT); repT = null; window.__h1Ouvinte = null; }
  function sigaParaProva() { const f = fluxo; fluxo = null; pararRep(); fecha(); if (f && typeof f.depois === 'function') f.depois(); }
  function cancelaFluxo() { const f = fluxo; fluxo = null; pararRep(); fecha(); if (f && typeof f.cancela === 'function') f.cancela(); }
  function prepararAtleta(nome, depois, cancela) {
    fluxo = { nome: String(nome || '').trim(), depois, cancela };
    if (S.conectado || S.reconectando) telaRepouso(); else passo1();
  }
  function telaRepouso() {
    pararRep(); painelAberto = false;
    const fixo = !!fluxo, nome = fixo ? fluxo.nome : (C.atleta() || '');
    if (S.sessao) { mostra('<h2>Medida de 5 minutos sentado</h2><div class="h1-st h1-err">Há uma prova sendo gravada neste sensor. Termine a prova antes de medir outro atleta.</div><div class="h1-btns"><button class="h1-btn sec" id="h1-volta">Fechar</button></div>'); $('h1-volta').onclick = fecha; return; }
    const hoje = medidaDeHoje(nome);
    const lista = (n) => n ? (naListaDeInscritos(n) ? '<span class="h1-ok">✓ na lista de inscritos</span>' : '<span class="h1-warn">não encontrado na lista de inscritos: a FC fica só neste aparelho</span>') : '';
    mostra('<h2>Medida de 5 minutos sentado</h2><p class="h1-sub">Faça sempre que o sensor for usado em um atleta, antes da prova.</p>' +
      (fixo ? '<div class="h1-q">Atleta: <strong>' + esc(nome) + '</strong> · ' + lista(nome) + '</div>'
            : '<label class="h1-sub" style="display:block;margin:0">Atleta<input class="h1-in" id="h1-ra" placeholder="Nome do atleta" autocomplete="off" value="' + esc(nome) + '"></label><div class="h1-st" id="h1-ral">' + lista(nome) + '</div>') +
      '<div class="h1-fig">' + ILUSTRA_REP + '</div>' +
      TUT5 +
      '<h3>Quando está sendo medida?</h3><div class="h1-mom">' +
        '<label class="h1-chk"><input type="radio" name="h1-mom" value="antes_aquecimento"><span><strong>Antes do aquecimento</strong>: ainda não aqueceu hoje (melhor)</span></label>' +
        '<label class="h1-chk"><input type="radio" name="h1-mom" value="depois_aquecimento"><span><strong>Depois do aquecimento</strong>: já aqueceu, mesmo que pouco (na dúvida, marque esta)</span></label></div>' +
      '<div class="h1-timer" id="h1-tm">' + mmss(REP_S) + '</div><div class="h1-tmb" id="h1-tmb">FC agora: ' + (S.ultimo && Number.isFinite(S.ultimo.b) ? S.ultimo.b : '--') + ' bpm</div>' +
      '<div class="h1-btns" id="h1-tmbt" style="justify-content:center"><button class="h1-btn" id="h1-ini" disabled>Iniciar os 5 minutos</button></div><div id="h1-r5"></div>' +
      (hoje ? '<div class="h1-q" id="h1-hoje">Já medida hoje às ' + new Date(hoje.fcRepousoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' (há ' + Math.max(0, Math.round((Date.now() - Date.parse(hoje.fcRepousoEm)) / 60000)) + ' min; ' + (hoje.fcRepousoMomento === 'antes_aquecimento' ? 'antes' : 'depois') + ' do aquecimento): <strong>' + hoje.fcRepouso + ' bpm</strong>. <button class="h1-btn sec" id="h1-usar">' + (fixo ? 'Usar esta medida e seguir para a prova' : 'Manter esta medida') + '</button></div>' : '') +
      '<div class="h1-btns">' + (fixo ? '<button class="h1-btn sec" id="h1-pula">Seguir sem a medida</button><button class="h1-btn sec" id="h1-volta">Voltar</button>' : '<button class="h1-btn sec" id="h1-volta">Fechar</button>') + '</div>' +
      '<p class="h1-aviso">A medida de 5 minutos sentado é a FC antes da prova, não a FC de repouso de laboratório. Nos cálculos, o que depende dela aparece como estimativa.</p>');
    const nomeAtual = () => fixo ? nome : (($('h1-ra') && $('h1-ra').value) || '').trim();
    const momento = () => { const r = document.querySelector('input[name="h1-mom"]:checked'); return r ? r.value : ''; };
    const libera = () => { const b = $('h1-ini'); if (b) b.disabled = !(momento() && nomeAtual()); };
    document.querySelectorAll('input[name="h1-mom"]').forEach((r) => { r.onchange = libera; });
    if ($('h1-ra')) $('h1-ra').oninput = () => { $('h1-ral').innerHTML = lista(nomeAtual()); libera(); };
    $('h1-ini').onclick = () => iniciaRep(nomeAtual(), momento(), fixo);
    if ($('h1-usar')) $('h1-usar').onclick = () => { if (fixo) sigaParaProva(); else fecha(); };
    if ($('h1-pula')) $('h1-pula').onclick = () => {
      $('h1-r5').innerHTML = '<div class="h1-st h1-warn">Sem a medida de 5 minutos, o TRIMP de Banister, o EPOC e o índice da reserva <strong>não podem ser calculados</strong> nesta prova. As outras métricas saem normalmente.</div><div class="h1-btns"><button class="h1-btn sec" id="h1-pula2">Seguir mesmo assim</button><button class="h1-btn" id="h1-medir">Voltar e medir</button></div>';
      $('h1-pula2').onclick = sigaParaProva; $('h1-medir').onclick = () => { $('h1-r5').innerHTML = ''; const r = document.querySelector('input[name="h1-mom"]'); if (r) r.focus(); };
      $('h1-r5').scrollIntoView({ block: 'center' });
    };
    $('h1-volta').onclick = () => { if (fixo) cancelaFluxo(); else fecha(); };
  }
  let reinicios = 0;
  function iniciaRep(nome, mom, fixo, reinicio) {
    pararRep(); reinicios = reinicio ? reinicios + 1 : 0;
    if (!nome || !mom) return;
    const fimT = Date.now() + REP_S * 1000, lidas = [];
    document.querySelectorAll('input[name="h1-mom"]').forEach((r) => { r.disabled = true; }); if ($('h1-ra')) $('h1-ra').disabled = true;
    const hj = $('h1-hoje'); if (hj) hj.remove();
    $('h1-r5').innerHTML = '';
    const tm = $('h1-tm'); tm.textContent = mmss(REP_S); tm.classList.add('run');
    $('h1-tmbt').innerHTML = '<button class="h1-btn sec" id="h1-reset">Reiniciar os 5 minutos</button>';
    $('h1-reset').onclick = () => iniciaRep(nome, mom, fixo, true);
    window.__h1Ouvinte = (t, b, ok) => { if (ok && Number.isFinite(b)) lidas.push([t, b]); const e = $('h1-tmb'); if (e) e.textContent = 'FC agora: ' + (Number.isFinite(b) ? b : '--') + ' bpm'; };
    repT = setInterval(() => {
      const rest = Math.max(0, Math.ceil((fimT - Date.now()) / 1000)), e = $('h1-tm'); if (!e) { pararRep(); return; }
      e.textContent = mmss(rest); if (rest > 0) return;
      pararRep(); e.classList.remove('run');
      const porSeg = new Map(); lidas.filter((x) => x[0] >= fimT - 60000).forEach((x) => porSeg.set(Math.floor(x[0] / 1000), x[1]));   // segundos distintos; no mesmo segundo vale a última
      const ult = [...porSeg.values()];
      const novo = '<button class="h1-btn sec" id="h1-reset">Reiniciar os 5 minutos</button>';
      if (ult.length < 45) {
        $('h1-r5').innerHTML = '<div class="h1-st h1-err">Poucas leituras no último minuto (' + ult.length + ' segundos de 60, mínimo 45). Aperte o sensor no braço e reinicie.</div>';
        $('h1-tmbt').innerHTML = novo; $('h1-reset').onclick = () => iniciaRep(nome, mom, fixo, true); return;
      }
      const m = Math.round(ult.reduce((a, b) => a + b, 0) / ult.length);
      salvaPerfil(nome, { fcRepouso: m, fcRepousoEm: new Date().toISOString(), fcRepousoProtocolo: '5min', fcRepousoMomento: mom, fcRepousoLeituras: ult.length, fcRepousoPostura: 'sentado', fcRepousoReinicios: reinicios });
      $('h1-r5').innerHTML = '<div class="h1-st h1-ok">Salvo: FC sentado de ' + esc(nome) + ' = <strong>' + m + ' bpm</strong> (média do último minuto, ' + ult.length + ' leituras; ' + (mom === 'antes_aquecimento' ? 'antes' : 'depois') + ' do aquecimento).</div>';
      $('h1-tmbt').innerHTML = '<button class="h1-btn" id="h1-segue">' + (fixo ? 'Continuar para a prova' : 'Concluir') + '</button>' + novo;
      $('h1-segue').onclick = () => { if (fixo) sigaParaProva(); else fecha(); };
      $('h1-reset').onclick = () => iniciaRep(nome, mom, fixo, true);
      C.toast('FC sentado salva: ' + m + ' bpm');
    }, 1000);
  }

  // ---------- painel (sensor já conectado) ----------
  function painel() {
    painelAberto = true;
    mostra('<button class="h1-canto" type="button" id="h1-termo" title="Termo de participação (consulta)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>Termo</button>' + '<h2>Sensor cardíaco</h2><p class="h1-sub" id="h1-pst"></p><div class="h1-big" id="h1-pb">--<small> bpm</small></div><div class="h1-st" id="h1-pg"></div>' +
      '<div class="h1-btns"><button class="h1-btn" id="h1-rel">Relatórios de FC</button><button class="h1-btn sec" id="h1-qp">Questionário pós-prova</button><button class="h1-btn sec" id="h1-t">Testar de novo</button>' + (MEDE_REPOUSO ? '<button class="h1-btn sec" id="h1-r">Medir 5 min sentado</button>' : '') + '<button class="h1-btn dan" id="h1-d">Desconectar</button><button class="h1-btn sec" id="h1-f">Fechar</button></div>' +
      '<p class="h1-aviso">Valores para acompanhamento de treino; não é dispositivo médico.</p>');
    renderPainelVivo();
    $('h1-rel').onclick = () => { painelAberto = false; relatorios(); };
    $('h1-t').onclick = () => { painelAberto = false; passo4(); };
    if ($('h1-r')) $('h1-r').onclick = () => { painelAberto = false; telaRepouso(); };
    $('h1-d').onclick = () => { if (S.sessao) { C.toast('Há uma prova sendo gravada. Termine a prova antes de desconectar.', 'err'); return; } desconectar(); fecha(); C.toast('Sensor desconectado'); };
    $('h1-f').onclick = fecha; ligaTermo();
    $('h1-qp').onclick = () => { if (window.kbQuest) kbQuest.posProva({}); else C.toast('Questionário indisponível', 'err'); };
  }
  function ligaTermo() { const b = $('h1-termo'); if (b) b.onclick = () => { if (window.kbQuest) kbQuest.termo({}); else C.toast('Termo indisponível', 'err'); }; }
  function renderPainelVivo() {
    const s = estado(), e1 = $('h1-pst'), e2 = $('h1-pb'), e3 = $('h1-pg'); if (!e1) return;
    e1.textContent = esc(S.nome) + (S.bateria !== null ? ' · bateria ' + S.bateria + '%' : '') + ' · ' + ({ ok: 'recebendo a FC', warn: 'sinal suspeito ou reconectando', bad: 'conexão perdida, tentando reconectar', off: 'desconectado' })[s];
    const rec = S.ultimo && Date.now() - S.ultimo.t < 3500 && Number.isFinite(S.ultimo.b);
    e2.innerHTML = (rec ? S.ultimo.b : '--') + '<small> bpm</small>';
    e3.textContent = S.sessao ? 'Gravando a prova de ' + (S.sessao.atleta || '…') + (S.sessao.fim ? ' (recuperação: ' + Math.max(0, Math.ceil((S.sessao.fim + KBMetricas.POS_PROVA_S * 1000 - Date.now()) / 1000)) + ' s)' : '') : 'Pronto: a próxima prova será gravada.';
  }

  // ---------- relatórios ----------
  function relatorios() {
    const L = lsGet(K_SESS, []);
    const itens = L.map((s, i) => {
      const d = new Date(s.inicio), dur = s.fim ? Math.round((s.fim - s.inicio) / 1000) : 0;
      return '<div class="h1-item' + (s.simulado ? ' kb-mock' : '') + '" data-i="' + i + '"><div><strong>' + esc(s.atleta || 'Sem nome') + '</strong><br><small>' + d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + ' · ' + Math.floor(dur / 60) + ':' + String(dur % 60).padStart(2, '0') + (s.movimento ? ' · ' + esc(s.movimento) : '') + (s.simulado ? ' · simulado' + '<span class="kb-mock-tag" title="Dado fictício (mock)">MOCK</span>' : '') + '</small></div><small>' + (s.score || 0) + ' rep.</small></div>';
    }).join('');
    mostra('<h2>Relatórios de FC</h2><p class="h1-sub">Sessões gravadas neste aparelho (mais recentes primeiro).</p><div class="h1-list">' + (itens || '<div class="h1-st">Nenhuma sessão gravada ainda.</div>') + '</div><div class="h1-btns" style="margin-top:12px"><button class="h1-btn sec" id="h1-volt">Voltar</button></div>');
    ov.querySelectorAll('.h1-item').forEach((el) => { el.onclick = () => relatorio(L[+el.dataset.i]); });
    $('h1-volt').onclick = () => { (S.conectado || S.reconectando) ? painel() : fecha(); };
  }
  let mostrarC = false;
  try { mostrarC = localStorage.getItem('kb_h1_mostra_c') === '1'; } catch (e) {}
  const NIVEL = { A: 'MEDIDO', B: 'CALCULADO', C: 'ESTIMATIVA', D: 'REFERÊNCIA DA LITERATURA', E: 'INDISPONÍVEL', R: 'REGRA DO SITE', X: 'DADOS INSUFICIENTES' };
  function fmtValor(c) {
    if (c.insuficiente) return '<div class="v" style="font-size:1rem;color:#aaa">Dados insuficientes</div>';
    if (c.nivel === 'E') return '<div class="m">' + esc(c.motivo || 'Indisponível') + '</div>';
    if (c.nivel === 'D') return '<div class="m">' + esc(c.referencia || '') + '</div>';
    if (c.fmt === 'tempo') { const s = Math.round(c.valor); return '<div class="v">' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '</div>'; }
    if (c.fmt === 'par') return '<div class="v">' + c.valor[0] + ' / ' + c.valor[1] + ' <span class="u">' + c.unidade + '</span></div>';
    if (c.fmt === 'faixa') return '<div class="v">≈ ' + c.valor[0] + '–' + c.valor[1] + ' <span class="u">' + c.unidade + '</span></div>' + (c.aviso ? '<div class="m">' + esc(c.aviso) + '</div>' : '');
    if (c.fmt === 'zonas') {
      const tot = c.valor.reduce((a, b) => a + b, 0) || 1;
      return '<table class="h1-zon">' + c.rotulos.map((r, i) => '<tr><td style="width:46%"><strong>' + r + '</strong>' + (c.textos ? '<br><span style="color:#999;font-size:.74rem">' + esc(c.textos[i]) + '</span>' : '') + '</td><td><div class="bar" style="width:' + Math.max(2, (c.valor[i] / tot) * 100) + '%;opacity:' + (0.35 + i * 0.13) + '"></div></td><td style="text-align:right;width:22%">' + c.valor[i].toFixed(1) + ' min</td></tr>').join('') + '</table><div class="m">Referência das zonas: ' + c.fcMax + ' bpm (' + esc(c.origemMax) + ')</div>';
    }
    if (c.fmt === 'faixaC') return '<div class="v">≈ ' + c.valor + '</div>';
    return '<div class="v">' + (c.valor === null ? '--' : c.valor) + ' <span class="u">' + esc(c.unidade) + '</span></div>' + (c.faixa ? '<div class="m">faixa provável ' + c.faixa[0] + '–' + c.faixa[1] + ' bpm</div>' : '');
  }
  function grafico(s, res) {
    const W = 520, H = 160, pad = 26;
    const pts = s.amostras.filter((a) => Number.isFinite(a[1]));
    if (pts.length < 2) return '';
    const t0 = s.inicio, t1 = Math.max(pts[pts.length - 1][0], s.fim || 0);
    const vmin = Math.min(60, ...pts.map((p) => p[1])) - 5, vmax = Math.max(res.fcMax || 0, ...pts.map((p) => p[1])) + 5;
    const x = (t) => pad + ((t - t0) / (t1 - t0 || 1)) * (W - pad - 6), y = (v) => H - 18 - ((v - vmin) / (vmax - vmin || 1)) * (H - 28);
    let bandas = '';
    if (res.fcMax) [[0.9, '#ff4a4a'], [0.8, '#ff9a3c'], [0.7, '#ffcc00'], [0.6, '#2fbf6b']].forEach(([p, cor]) => { const yy = y(res.fcMax * p); bandas += '<line x1="' + pad + '" x2="' + (W - 6) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + cor + '" stroke-opacity=".35" stroke-dasharray="3 4"/><text x="' + (W - 8) + '" y="' + (yy - 2) + '" fill="' + cor + '" fill-opacity=".7" font-size="9" text-anchor="end">' + Math.round(p * 100) + '%</text>'; });
    let d = '', prev = null;
    pts.forEach((p) => { const gap = prev && p[0] - prev[0] > 3000; d += (d && !gap ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1) + ' '; prev = p; });
    const fimL = res && res.janelaExec === 'contagens' ? res.fim : s.fim, fimX = fimL ? x(fimL) : null, fimT = res && res.janelaExec === 'contagens' ? 'última contagem' : 'fim da série';
    return '<svg class="h1-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Curva da FC ao longo da série">' + bandas +
      (fimX ? '<line x1="' + fimX + '" x2="' + fimX + '" y1="6" y2="' + (H - 18) + '" stroke="#888" stroke-dasharray="2 3"/><text x="' + (fimX + 3) + '" y="14" fill="#aaa" font-size="9">' + fimT + '</text>' : '') +
      '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="1.6"/>' +
      '<text x="4" y="' + (y(vmax - 5) + 4) + '" fill="#888" font-size="9">' + Math.round(vmax - 5) + '</text><text x="4" y="' + (y(vmin + 5) + 4) + '" fill="#888" font-size="9">' + Math.round(vmin + 5) + '</text>' +
      '<text x="' + pad + '" y="' + (H - 4) + '" fill="#888" font-size="9">0:00</text><text x="' + (W - 6) + '" y="' + (H - 4) + '" fill="#888" font-size="9" text-anchor="end">' + Math.floor((t1 - t0) / 60000) + ':' + String(Math.floor(((t1 - t0) % 60000) / 1000)).padStart(2, '0') + '</text></svg>';
  }
  function relatorio(s) {
    const perf = Object.assign(perfilDe(s.atleta), { pse: s.pse });
    s.amostras = s.amostras.map((a) => [a[0], a[1] === null ? NaN : a[1]]);
    const res = KBMetricas.calcula(s, perf);
    s.amostras = s.amostras.map((a) => [a[0], Number.isFinite(a[1]) ? a[1] : null]);
    const ess = res.essenciais || [];
    const visiveis = res.cards.filter((c) => mostrarC || c.nivel !== 'C' || ess.includes(c.id));
    visiveis.sort((x, y) => (ess.includes(x.id) ? ess.indexOf(x.id) : 99) - (ess.includes(y.id) ? ess.indexOf(y.id) : 99));
    const cards = visiveis.map((c) => '<div class="h1-card lv' + c.nivel + (c.fmt === 'zonas' || c.nivel === 'D' || c.nivel === 'E' ? ' wide' : '') + '"><div class="t">' + esc(c.titulo) + (c.semFonte ? '<span class="kb-sf" title="Área experimental: hipótese ou cálculo do site, sem validação para este uso" aria-label="Área experimental">i</span>' : '') + '</div><button class="i" type="button" aria-label="Fonte">i</button>' + fmtValor(c) +
      '<span class="h1-sel lv-' + c.nivel + '">' + NIVEL[c.nivel] + '</span>' + (ess.includes(c.id) ? '<span class="rf-ess" title="Métrica mínima pedida pela organização do campeonato">ESSENCIAL</span>' : '') + '<div class="n"><strong>Fonte:</strong> ' + esc(c.ref) + '<br>' + esc(c.nota) +
      (c.metodos ? '<br><strong>Métodos:</strong> ' + c.metodos.map((m) => esc(m.nome) + ': ' + m.kcal + ' kcal').join('; ') : '') + (c.removido ? '<br><strong>Método retirado:</strong> ' + esc(c.removido) : '') + (c.semFonte ? '<br><strong style="color:#b47cff">Área experimental:</strong> ' + esc(c.semFonte) : '') + '</div></div>').join('');
    const d = new Date(s.inicio);
    const tab = '<table class="h1-tab"><tr><th>Minuto</th><th>FC média</th><th>Repetições</th></tr>' + res.porMin.map((m) => '<tr><td>' + m.minuto + '</td><td>' + (m.fc || '--') + '</td><td>' + m.reps + '</td></tr>').join('') + '</table>';
    mostra('<h2' + (s.simulado ? ' class="kb-mock"' : '') + '>' + esc(s.atleta || 'Sem nome') + (s.simulado ? '<span class="kb-mock-tag" title="Dado fictício (mock)">MOCK</span>' : '') + '</h2><p class="h1-sub">' + d.toLocaleString('pt-BR') + (s.movimento ? ' · ' + esc(s.movimento) : '') + (s.pista ? ' · Plataforma ' + esc(s.pista) : '') + ' · ' + (s.score || 0) + ' repetições · sensor ' + esc(s.sensor_nome || '') + (s.simulado ? ' (SIMULADO)' : '') + (s.encerrada && s.encerrada !== 'normal' ? ' · ' + esc(s.encerrada) : '') + '</p>' +
      (!res.suficiente ? '<div class="h1-st h1-warn">Só ' + Math.round(res.pctValidas * 100) + '% das leituras foram válidas (mínimo 80%). As métricas calculadas não foram geradas.</div>' : '') +
      grafico(s, res) +
      '<p class="h1-sub">O selo de cada cartão mostra a <strong>natureza do resultado</strong> (medido, calculado, estimativa, referência da literatura ou indisponível); não é uma escala de precisão. O "i" roxo marca a área experimental.</p>' +
      '<label class="h1-tgl"><input type="checkbox" id="h1-mc"' + (mostrarC ? ' checked' : '') + '> Mostrar estimativas (calorias, FCmáx pela idade)</label>' +
      '<div class="h1-cards">' + cards + '</div>' +
      blocoQuest(s) +
      '<h3>FC × repetições por minuto</h3>' + tab +
      '<h3>Dados do atleta para os cálculos</h3><div class="h1-sub">Guardados só neste aparelho. Deixe em branco o que não souber.</div>' +
      '<div class="h1-grid2"><label>Sexo<select class="h1-in" id="h1-sx"><option value="">—</option><option value="M"' + (perf.sexo === 'M' ? ' selected' : '') + '>Masculino</option><option value="F"' + (perf.sexo === 'F' ? ' selected' : '') + '>Feminino</option></select></label>' +
      '<label>Idade<input class="h1-in" id="h1-id" inputmode="numeric" value="' + (perf.idade || '') + '"></label>' +
      '<label>Peso (kg)<input class="h1-in" id="h1-pe" inputmode="decimal" value="' + (perf.peso || '') + '"></label>' +
      '<label>FC de repouso (bpm)<input class="h1-in" id="h1-fr" inputmode="numeric" value="' + (perf.fcRepouso || '') + '"></label>' +
      '<label>FC máxima conhecida (bpm)<input class="h1-in" id="h1-fm" inputmode="numeric" value="' + (perf.fcMaxConhecida || '') + '"></label>' +
      '<div class="h1-sub" style="grid-column:1/-1">Esforço percebido: ' + (Number.isFinite(s.pse) ? s.pse + ' (pelo questionário pós-prova)' : 'use o botão Questionário pós-prova') + '</div></div>' +
      '<div class="h1-btns"><button class="h1-btn" id="h1-rc">Recalcular</button><button class="h1-btn sec" id="h1-qr">Questionário pós-prova</button><button class="h1-btn sec" id="h1-csv">Exportar CSV</button><button class="h1-btn sec" id="h1-vl">Voltar</button></div>' +
      '<p class="h1-aviso">Versão do método: ' + esc(res.versao) + '. Valores para acompanhamento de treino; não é dispositivo médico. Sensor óptico, não validado no kettlebell. Toque em "i" para ver a fonte de cada número.</p>');
    ov.querySelectorAll('.h1-card .i').forEach((b) => { b.onclick = () => b.parentElement.classList.toggle('op'); });
    $('h1-mc').onchange = (e) => { mostrarC = e.target.checked; try { localStorage.setItem('kb_h1_mostra_c', mostrarC ? '1' : '0'); } catch (x) {} relatorio(s); };
    const num = (id) => { const v = parseFloat(String($(id).value).replace(',', '.')); return Number.isFinite(v) ? v : undefined; };
    $('h1-rc').onclick = () => {
      if (s.atleta) salvaPerfil(s.atleta, { sexo: $('h1-sx').value || undefined, idade: num('h1-id'), peso: num('h1-pe'), fcRepouso: num('h1-fr'), fcMaxConhecida: num('h1-fm') });
      const L = lsGet(K_SESS, []); const i = L.findIndex((x) => x.id === s.id); if (i >= 0) { L[i] = s; lsSet(K_SESS, L); } if (s.contexto && s.contexto.consentimento && s.contexto.consentimento.gravacao) { const F = lsGet(K_FILA, []); if (!F.includes(s.id)) { F.push(s.id); lsSet(K_FILA, F); } enviaFila(); }
      relatorio(s);
    };
    $('h1-csv').onclick = () => exportaCSV(s, res);
    $('h1-qr').onclick = () => { if (window.kbQuest) kbQuest.posProva({ sessaoId: s.id }); else C.toast('Questionário indisponível', 'err'); };
    $('h1-vl').onclick = relatorios;
  }
  function blocoQuest(s) {
    const c = s.contexto && s.contexto.consentimento, q = s.questionario;
    const cons = !c ? 'Autorização: não registrada' : (c.gravacao ? 'Autorização: ' + (/inscricao/.test(c.origem) ? 'pela inscrição' : 'termo') + ' · Estudo: ' + (c.estudo ? 'sim' : (c.retirado_em ? 'retirado' : 'não')) : 'Atleta não encontrado na lista de inscritos: FC guardada só neste aparelho');
    const mm = (x) => (Number.isFinite(x) ? ' (' + Math.round(x / 60) + ' min após o fim)' : '');
    const qq = q ? 'Sensação: ' + (Number.isFinite(q.fs) ? (q.fs > 0 ? '+' + q.fs : q.fs) + mm(q.fs_atraso_s) : '—') + ' · Esforço: ' + (Number.isFinite(q.pse) ? q.pse + mm(q.pse_atraso_s) : '—') : 'Questionário pós-prova: não respondido';
    const jan = s.contexto && s.contexto.janela === 'sem_contagem' ? ' · Sem contagem: a série usa o início do cronômetro' : '';
    return '<div class="h1-q">' + esc(cons) + ' · ' + esc(qq) + esc(jan) + '</div>';
  }
  function listaSessoes() { return lsGet(K_SESS, []); }
  function salvaQuestionario(id, q) {
    const L = lsGet(K_SESS, []); const s = L.find((x) => x.id === id); if (!s) return false;
    s.questionario = q; if (Number.isFinite(q.pse)) s.pse = q.pse;
    s.contexto = s.contexto || {}; s.contexto.questionario = { fs: q.fs, pse: q.pse, fs_atraso_s: q.fs_atraso_s, pse_atraso_s: q.pse_atraso_s, fim_ref: q.fim_ref, alteracoes: (q.historico || []).length, versao: q.versao };
    if (!lsSet(K_SESS, L)) return false;
    if (s.contexto.consentimento && s.contexto.consentimento.gravacao) { const F = lsGet(K_FILA, []); if (!F.includes(id)) { F.push(id); lsSet(K_FILA, F); } enviaFila(); }
    if (ov.style.display === 'flex' && $('h1-qr')) relatorio(s);
    return true;
  }
  // retirada do estudo: atualiza as sessões já salvas deste atleta e reenvia (o banco mescla o contexto mais novo)
  function atualizaConsentimento(nome) {
    const L = lsGet(K_SESS, []), k = normNome(nome), F = lsGet(K_FILA, []); let n = 0;
    L.forEach((s) => { if (normNome(s.atleta) !== k) return; s.contexto = s.contexto || {};
      s.contexto.consentimento = Object.assign({}, s.contexto.consentimento || {}, (window.kbQuest && kbQuest.consentimentoDe(s.atleta)) || {}, { atualizado_em: new Date().toISOString() });
      if (s.contexto.consentimento.gravacao && !F.includes(s.id)) F.push(s.id); n++; });
    lsSet(K_SESS, L); lsSet(K_FILA, F); enviaFila(); return n;
  }
  function exportaCSV(s, res) {
    const linhas = ['segundo;hora;bpm'];
    s.amostras.forEach((a) => linhas.push(Math.round((a[0] - s.inicio) / 1000) + ';' + new Date(a[0]).toLocaleTimeString('pt-BR') + ';' + (a[1] === null ? '' : a[1])));
    linhas.push(''); linhas.push('metrica;natureza do resultado;valor;unidade;fonte');
    res.cards.forEach((c) => linhas.push([c.titulo, NIVEL[c.nivel], Array.isArray(c.valor) ? c.valor.join(' a ') : (c.valor === null ? '' : c.valor), c.unidade, c.ref].map((x) => String(x).replace(/;/g, ',')).join(';')));
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = 'FC_' + (s.atleta || 'atleta').replace(/[^\w\-]+/g, '_') + '_' + new Date(s.inicio).toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.csv';
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- envio ao banco (fc_registrar) ----------
  // Fila K_FILA guarda os ids das sessões salvas; envia quando há rede. Reenvio é seguro (o banco ignora duplicadas).
  let enviando = false;
  async function enviaFila() {
    if (enviando || !navigator.onLine) return;
    let nuvem = null; try { nuvem = NUVEM; } catch (e) { return; }
    if (!nuvem || !nuvem.url || !nuvem.key) return;
    const fila = lsGet(K_FILA, []); if (!fila.length) return;
    enviando = true;
    try {
      const L = lsGet(K_SESS, []); const resta = [], enviadas = [];
      for (const id of fila) {
        const s = L.find((x) => x.id === id); if (!s) continue;
        const corpo = { s: { id: s.id, prova_id: s.prova_id, atleta: s.atleta, movimento: s.movimento, pista: s.pista, arbitro: s.arbitro,
          dispositivo_id: s.dispositivo_id, sensor_nome: s.sensor_nome, simulado: s.simulado, inicio: s.inicio, fim: s.fim,
          amostras: s.amostras, reps: s.reps, score: s.score, pse: s.pse, encerrada: s.encerrada, contexto: s.contexto || {},
          versao_metricas: (window.KBMetricas && KBMetricas.VERSAO) || '' } };
        try {
          const r = await fetch(nuvem.url + '/rest/v1/rpc/fc_registrar', { method: 'POST', headers: { apikey: nuvem.key, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
          if (!r.ok) resta.push(id); else enviadas.push(id);
        } catch (e) { resta.push(id); }
      }
      // relê o armazenamento: durante o envio (await) outra sessão pode ter sido salva; nunca gravar uma lista antiga por cima
      const L2 = lsGet(K_SESS, []); L2.forEach((x) => { if (enviadas.includes(x.id)) x.enviada = true; }); lsSet(K_SESS, L2);
      const F2 = lsGet(K_FILA, []); lsSet(K_FILA, F2.filter((id) => !enviadas.includes(id)));
    } finally { enviando = false; }
  }
  setInterval(enviaFila, 60000); window.addEventListener('online', enviaFila); setTimeout(enviaFila, 5000);

  // ---------- entrada pública ----------
  function abrir() { try { if (S.conectado || S.reconectando) painel(); else passo1(); } catch (e) { C.toast('Sensor cardíaco indisponível neste aparelho', 'err'); } }
  window.kbH1 = { abrir, prepararAtleta, ligado: () => !!(S.conectado || S.reconectando), medindo: () => !!repT || (ov.style.display === 'flex'), relatorios, estado, desconectar, enviaFila, listaSessoes, salvaQuestionario, atualizaConsentimento, _sim: iniciaSimulador, _S: S };
})();
