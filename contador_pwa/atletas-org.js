/* atletas-org.js — Área da organização no Contador: "Atletas" (todos os atletas com dados e desempenho)
 * e "Cadastro de atletas" (corrigir dados, pesagem, FC de repouso e dados privados só de escrita).
 * Protegido pelo mesmo PIN do contador: no aparelho fica só o hash (confere offline); o banco confere o PIN de novo.
 * Os dados vindos do banco ficam só na memória (não são gravados no aparelho).
 * Depende de: metricas.js, relatorio-fc.js. Usa (se existirem) NUVEM, showToast, deviceId, arbitro, kbH1.
 */
(function () {
  'use strict';
  if (window.kbOrg) return;
  // 18/11: um só PIN na entrada. PIN da organização = só consulta; PIN de edição = tela de edição. O banco confere os dois (SQL 03 v1.6, só bcrypt).
  const PIN_VALIDADE = 15 * 60 * 1000;
  const K_FILA = 'kb_ajustes_fila_v1';
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const toast = (m, k) => { try { showToast(m, k); } catch (e) {} };
  const nuvem = () => { try { return NUVEM; } catch (e) { return null; } };
  const disp = () => { try { return deviceId(); } catch (e) { return null; } };
  const arb = () => { try { return arbitro || ''; } catch (e) { return ''; } };
  const $ = (id) => document.getElementById(id);

  let pin = null, pinAte = 0, dados = null, dadosEm = 0, mostrarC = false, editAte = 0, modo = 'ver';

  // ---------- estilos ----------
  const st = document.createElement('style');
  st.textContent = `
  .ko-ov{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,.75);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:max(16px,env(safe-area-inset-top)) 12px 24px}
  .ko-box{width:100%;max-width:720px;background:#141414;color:#f2f2f2;border:1px solid #333;border-radius:16px;padding:18px;font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.5);min-width:0}
  .ko-box h2{margin:0 0 4px;font-size:1.25rem;color:#ffcc00} .ko-box h3{margin:16px 0 6px;font-size:1.02rem}
  .ko-sub{color:#aaa;font-size:.88rem;margin:0 0 10px}
  .ko-in{width:100%;box-sizing:border-box;background:#0d0d0d;color:#fff;border:1px solid #444;border-radius:8px;padding:9px 10px;font:15px system-ui,sans-serif}
  .ko-in:focus{outline:2px solid #ffcc00;outline-offset:1px}
  .ko-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .ko-btn{appearance:none;border:0;border-radius:10px;padding:10px 14px;font:600 .95rem system-ui,sans-serif;cursor:pointer;background:#ffcc00;color:#000}
  .ko-btn.sec{background:#2a2a2a;color:#eee;border:1px solid #444} .ko-btn:disabled{opacity:.45;cursor:default}
  .ko-list{display:flex;flex-direction:column;gap:6px;margin-top:10px}
  .ko-item{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;background:#1d1d1d;border:1px solid #2c2c2c;cursor:pointer;text-align:left;color:inherit;font:inherit;width:100%}
  .ko-item:hover,.ko-item:focus{border-color:#666;outline:none} .ko-item small{color:#9a9a9a;display:block}
  .ko-tag{display:inline-block;font:700 .68rem/1 system-ui;padding:3px 6px;border-radius:6px;background:#2c2c2c;color:#ccc;margin:2px 4px 0 0;white-space:nowrap}
  .ko-tag.ok{background:#14432a;color:#7fe0a6} .ko-tag.warn{background:#4a3010;color:#ffc477} .ko-tag.fc{background:#4a1520;color:#ff9db0}
  .ko-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px}
  .ko-grid label{font-size:.8rem;color:#bbb;display:block;min-width:0}
  .ko-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px 12px;font-size:.9rem}
  .ko-kv div span{display:block;color:#999;font-size:.76rem}
  .ko-tab{width:100%;border-collapse:collapse;font-size:.86rem} .ko-tab th,.ko-tab td{border-bottom:1px solid #2a2a2a;padding:6px;text-align:left} .ko-tab td.n{text-align:right}
  .ko-aviso{font-size:.82rem;color:#aaa;margin-top:12px;border-top:1px solid #2a2a2a;padding-top:10px}
  .ko-err{color:#ff8a8a} .ko-ok{color:#5fd88f} .ko-warn{color:#ffd24d}
  .ko-pin{display:flex;gap:10px;justify-content:center;margin:14px 0} .ko-pin input{width:64px;height:64px;text-align:center;font:800 1.8rem system-ui;border-radius:12px}
  .kb-mock{outline:2px dashed #ff8c00!important;outline-offset:2px}.kb-mock-tag{display:inline-block;font:700 .62rem/1 system-ui,sans-serif;letter-spacing:.06em;color:#ff8c00;border:1px dashed #ff8c00;border-radius:5px;padding:2px 5px;margin-left:6px;vertical-align:2px}
  .ko-priv{border:1px dashed #555;border-radius:12px;padding:10px;margin-top:6px}
  .ko-box{position:relative} .ko-box > h2{padding-right:44px}
  .ko-box.ko-larga{max-width:min(1400px,94vw);padding:22px 24px;background:#101318;border-color:#2a3240} .ko-larga .rfp-cab h2{padding-right:44px}
  .ko-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;border:1px solid #555;background:#222;color:#eee;font:400 24px/1 system-ui;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0 0 3px}
  .ko-row{display:flex;gap:8px;align-items:center} .ko-row .ko-item{flex:1;min-width:0} .ko-ck{width:20px;height:20px;flex:none}
  .ko-selbar{display:flex;justify-content:space-between;align-items:center;margin-top:8px;font-size:.86rem;color:#ccc} .ko-selbar label{display:flex;gap:6px;align-items:center}
  `;
  document.head.appendChild(st);
  const ov = document.createElement('div'); ov.className = 'ko-ov'; ov.id = 'ko-ov'; document.body.appendChild(ov);
  // 18/11: toque fora não fecha (não perde o que foi digitado). Esc = Voltar da tela atual. X fecha e volta à tela inicial do contador.
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.style.display === 'flex') { e.preventDefault(); const v = $('ko-v') || $('ko-pc') || $('ko-f'); if (v) v.click(); else fecha(); } });
  let telaN = 0;   // muda a cada tela: navegação atrasada só acontece se a pessoa ainda estiver na mesma tela
  function mostra(h) {
    telaN++;
    ov.innerHTML = '<div class="ko-box" role="dialog" aria-modal="true"><button class="ko-x" type="button" id="ko-xx" aria-label="Fechar" title="Fechar">×</button>' + h + '</div>'; ov.style.display = 'flex'; ov.scrollTop = 0;
    $('ko-xx').onclick = fecha;
    const f = ov.querySelector('[autofocus]'); if (f) f.focus();
  }
  function fecha() { ov.style.display = 'none'; ov.innerHTML = ''; }

  // ---------- PIN ----------
  async function sha(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
  function pedePin(titulo, edicao, volta) {
    return new Promise((ok) => {
      if (!edicao && pin && Date.now() < pinAte) return ok(true);
      if (edicao && Date.now() < editAte) return ok(true);
      mostra('<h2>' + esc(titulo) + '</h2><p class="ko-sub">' + (edicao ? 'Edição do cadastro. Digite o PIN de edição.' : 'Área da organização. Digite o PIN.') + '</p><div class="ko-pin">' + [0, 1, 2, 3].map((i) => '<input class="ko-in" id="ko-p' + i + '" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="Dígito ' + (i + 1) + ' do PIN"' + (i ? '' : ' autofocus') + ' type="password">').join('') + '</div><div id="ko-pe" class="ko-err" role="alert" style="text-align:center;min-height:1.4em"></div><div class="ko-btns" style="justify-content:center"><button class="ko-btn sec" id="ko-pc">Voltar</button></div>');
      const ins = [0, 1, 2, 3].map((i) => $('ko-p' + i));
      const confere = async () => {
        const v = ins.map((i) => i.value).join(''); if (v.length < 4) return;
        if (edicao) { if (await window.kbPinOk('edit', v)) { editAte = Date.now() + PIN_VALIDADE; ok(true); } else { $('ko-pe').textContent = 'PIN incorreto.'; ins.forEach((i) => { i.value = ''; }); ins[0].focus(); } return; }
        if (await window.kbPinOk('org', v)) { pin = v; pinAte = Date.now() + PIN_VALIDADE; modo = 'ver'; ok(true); enviaFila(); }
        else if (await window.kbPinOk('edit', v)) { pin = v; pinAte = Date.now() + PIN_VALIDADE; modo = 'editar'; editAte = pinAte; ok(true); enviaFila(); }
        else { $('ko-pe').textContent = 'PIN incorreto.'; ins.forEach((i) => { i.value = ''; }); ins[0].focus(); }
      };
      ins.forEach((inp, i) => {
        inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && i < 3) ins[i + 1].focus(); confere(); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && i > 0) ins[i - 1].focus(); });
      });
      $('ko-pc').onclick = () => { if (volta) volta(); else fecha(); ok(false); };
    });
  }

  // ---------- banco ----------
  async function rpc(fn, corpo) {
    const n = nuvem(); if (!n) throw new Error('sem configuração do banco');
    const r = await fetch(n.url + '/rest/v1/rpc/' + fn, { method: 'POST', headers: { apikey: n.key, 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.message || ('erro ' + r.status));
    return j;
  }
  const K_ORG = 'kb_org_cache_v1';   // v23 (18/11): cópia do banco no aparelho, para usar sem internet
  let daCopia = false;
  async function carrega(forca) {
    if (dados && !forca && Date.now() - dadosEm < 120000 && !daCopia) return dados;
    let j = null, falha = null;
    if (navigator.onLine) { try { j = await rpc('org_consultar', { pin }); } catch (e) { falha = e; } }
    if (j && j.ok) {
      dados = j.atletas || []; dadosEm = Date.now(); daCopia = false;
      try { localStorage.setItem(K_ORG, JSON.stringify({ em: new Date(dadosEm).toISOString(), atletas: dados })); }
      catch (e) { try { localStorage.setItem(K_ORG, JSON.stringify({ em: new Date(dadosEm).toISOString(), atletas: dados.map((a) => Object.assign({}, a, { fc: [] })), semFc: true })); } catch (er) {} }
      return dados;
    }
    const c = lsGet(K_ORG, null);
    if (c && Array.isArray(c.atletas)) { dados = c.atletas; dadosEm = Date.parse(c.em) || Date.now(); daCopia = true; return dados; }
    if (j && !j.ok) throw new Error('O banco recusou a consulta.');
    throw falha || new Error('Sem internet e ainda sem cópia dos dados neste aparelho. Abra esta tela uma vez com internet.');
  }

  // sessões de FC deste aparelho (ainda não enviadas ou sem rede)
  function fcLocais() { return lsGet('kb_h1_sessoes_v1', []); }
  function perfilDe(a) {
    const loc = (lsGet('kb_h1_perfis_v1', {})[norm(a.nome)] || {});
    const g = a.pesagem || {};
    return {
      sexo: /^m/i.test(a.sexo || '') ? 'M' : (/^f/i.test(a.sexo || '') ? 'F' : loc.sexo),
      idade: Number.isFinite(a.idade) ? a.idade : loc.idade,
      peso: g.peso_kg != null ? +g.peso_kg : loc.peso,
      fcRepouso: g.fc_repouso != null ? +g.fc_repouso : loc.fcRepouso,
      fcRepousoProtocolo: g.fc_repouso != null ? (+loc.fcRepouso === +g.fc_repouso ? loc.fcRepousoProtocolo : 'manual') : loc.fcRepousoProtocolo,
      fcMaxConhecida: loc.fcMaxConhecida,
      // referência do campeonato: maior FC média de 5 s entre todas as séries da pessoa (banco + este aparelho)
      ...(() => { const pc = window.KBMetricas && KBMetricas.picoCampeonato ? KBMetricas.picoCampeonato(a.fc || []) : { valor: null, sessoes: [] }; const lv = Number.isFinite(loc.picoHistorico) ? loc.picoHistorico : null;
        return pc.valor !== null && (lv === null || pc.valor >= lv) ? { picoHistorico: pc.valor, picoSessoes: pc.sessoes } : { picoHistorico: lv === null ? undefined : lv, picoSessoes: loc.picoSessoes || [] }; })()
    };
  }

  // ---------- Atletas ----------
  let busca = '';
  async function abrirAtletas() {
    if (!(await pedePin('Atletas'))) return;
    mostra('<h2>Atletas</h2><p class="ko-sub">Carregando do banco…</p>');
    try { await carrega(); } catch (e) { if (!navigator.onLine) return offline(); mostra('<h2>Atletas</h2><p class="ko-err">' + esc(e.message) + '</p><div class="ko-btns"><button class="ko-btn sec" id="ko-v">Voltar</button></div>'); $('ko-v').onclick = fecha; return; }
    lista();
  }
  function lista() {
    const loc = fcLocais();
    mostra('<h2>Atletas</h2>' + (daCopia || !navigator.onLine ? '<p class="ko-warn">Sem internet: mostrando a cópia guardada neste aparelho (' + new Date(dadosEm).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '). Ajustes ficam na fila até a internet voltar.</p>' : '') + '<p class="ko-sub">' + dados.length + ' atletas · dados do banco de ' + new Date(dadosEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '. ' + (modo === 'editar' ? '<b class="ko-warn">Modo edição</b>: toque no atleta para editar o cadastro.' : 'Só consulta.') + ' Resultados não podem ser editados. Nada disto fica gravado no aparelho.</p>' +
      '<input class="ko-in" id="ko-q" placeholder="Buscar por nome, equipe, cidade ou prova" autocomplete="off" value="' + esc(busca) + '" autofocus aria-label="Buscar atleta">' +
      '<div class="ko-selbar"><label><input type="checkbox" id="ko-all"> Marcar todos da busca</label><span id="ko-nsel"></span></div>' +
      '<div class="ko-list" id="ko-l"></div>' +
      '<div class="ko-btns"><button class="ko-btn" id="ko-exs">Exportar selecionados</button><button class="ko-btn sec" id="ko-ext">Exportar todos</button><button class="ko-btn sec" id="ko-r">Atualizar</button><button class="ko-btn sec" id="ko-x">Dados do sensor (uso interno)</button><button class="ko-btn sec" id="ko-tp">Trocar PIN</button><button class="ko-btn sec" id="ko-v">Voltar</button></div>');
    const visiveis = () => { const q = norm(busca); return dados.filter((a) => !q || norm([a.nome, a.apelido, a.equipe, a.cidade, a.uf, (a.inscricoes || []).map((i) => i.prova).join(' ')].join(' ')).includes(q)); };
    const contaSel = () => { const n = dados.filter((a) => selecionados.has(a.id)).length; $('ko-nsel').textContent = n ? n + ' selecionado(s)' : ''; $('ko-exs').disabled = !n; };
    const desenha = () => {
      const it = visiveis();
      $('ko-l').innerHTML = it.map((a) => {
        const nfc = (a.fc || []).length + loc.filter((s) => !s.enviada && norm(s.atleta) === norm(a.nome)).length;
        return '<div class="ko-row"><input type="checkbox" class="ko-ck" data-id="' + a.id + '" aria-label="Selecionar ' + esc(a.nome) + '"' + (selecionados.has(a.id) ? ' checked' : '') + '><button class="ko-item' + (a.mock ? ' kb-mock' : '') + '" data-id="' + a.id + '"><div><strong>' + esc(a.nome) + '</strong>' + (a.mock ? '<span class="kb-mock-tag" title="Dado fictício (mock)">MOCK</span>' : '') + '<small>' + esc([a.equipe, [a.cidade, a.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')) + '</small>' +
          (a.inscricoes || []).map((i) => '<span class="ko-tag">' + esc(i.prova) + (i.carga_kg ? ' ' + i.carga_kg + 'kg' : '') + '</span>').join('') +
          (a.menor ? '<span class="ko-tag warn">menor de idade</span>' : '') + (nfc ? '<span class="ko-tag fc">' + nfc + ' FC</span>' : '') +
          '</div><small style="text-align:right">' + ((a.provas || []).length ? (a.provas || []).map((p) => (p.reps != null ? p.reps : '–') + ' rep').join('<br>') : '') + '</small></button></div>';
      }).join('') || '<p class="ko-sub">Nenhum atleta encontrado.</p>';
      $('ko-l').querySelectorAll('.ko-item').forEach((b) => { b.onclick = () => { const a = dados.find((x) => x.id === b.dataset.id); if (modo === 'editar') ajuste(a); else detalhe(a); }; });
      $('ko-l').querySelectorAll('.ko-ck').forEach((c) => { c.onchange = () => { if (c.checked) selecionados.add(c.dataset.id); else selecionados.delete(c.dataset.id); contaSel(); }; });
      $('ko-all').checked = it.length > 0 && it.every((a) => selecionados.has(a.id));
      contaSel();
    };
    $('ko-q').addEventListener('input', (e) => { busca = e.target.value; desenha(); });
    $('ko-all').onchange = (e) => { visiveis().forEach((a) => { if (e.target.checked) selecionados.add(a.id); else selecionados.delete(a.id); }); desenha(); };
    desenha();
    $('ko-r').onclick = async () => { try { await carrega(true); lista(); } catch (e) { toast(e.message, 'err'); } };
    $('ko-exs').onclick = () => escolheFormato(dados.filter((a) => selecionados.has(a.id)), lista);
    $('ko-ext').onclick = () => escolheFormato(dados.slice(), lista);
    $('ko-x').onclick = () => exportar();
    $('ko-tp').onclick = () => { pin = null; pinAte = 0; editAte = 0; modo = 'ver'; dados = null; abrirAtletas(); };
    $('ko-v').onclick = fecha;
  }
  const selecionados = new Set();

  // ---------- exportar cadastro + resultados (um, selecionados ou todos; CSV ou HTML) ----------
  const fmtData = (t) => t ? new Date(t).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const pesoTxt = (g) => g && g.peso_kg != null ? String(g.peso_kg).replace('.', ',') : '';
  const quando = (g) => g ? (g.pesado_em ? fmtData(g.pesado_em) : (g.data ? new Date(g.data + 'T12:00').toLocaleDateString('pt-BR') : '')) : '';
  function linhasCadastro(L) {
    return L.map((a) => { const g = a.pesagem || {};
      return { nome: a.nome, nome_placar: a.apelido || '', sexo: a.sexo || '', idade_no_evento: a.idade != null ? a.idade : '', menor: a.menor ? 'sim' : '', equipe: a.equipe || '', cidade: a.cidade || '', uf: a.uf || '',
        classe_10min: a.classe_10 || '', classe_12_30min: a.classe_12_30 || '', federado: a.federado == null ? '' : (a.federado ? 'sim' : 'não'), entidade: a.entidade || '',
        inscricoes: (a.inscricoes || []).map((i) => i.prova + (i.carga_kg ? ' ' + i.carga_kg + 'kg' : '') + ((i.categorias || []).length ? ' (' + i.categorias.join(', ') + ')' : '')).join(' | '),
        ultima_pesagem_kg: pesoTxt(g), ultima_pesagem_em: quando(g), altura_cm: g.altura_cm != null ? g.altura_cm : '', resultados: (a.provas || []).length }; });
  }
  function linhasResultados(L) {
    const r = []; L.forEach((a) => (a.provas || []).forEach((p) => r.push({ atleta: a.nome, data_hora: fmtData(p.inicio), movimento: p.movimento || '', plataforma: p.pista != null ? p.pista : '', arbitro: p.arbitro || '',
      repeticoes_validas: p.reps != null ? p.reps : '', no_counts: p.no_counts != null ? p.no_counts : '', duracao: dur(p.duracao_s), mock: p.mock ? 'sim' : '' }))); return r;
  }
  const csvDe = (rows) => { if (!rows.length) return ''; const k = Object.keys(rows[0]); const q = (v) => { v = String(v == null ? '' : v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    return '﻿' + [k.join(';')].concat(rows.map((r) => k.map((x) => q(r[x])).join(';'))).join('\r\n'); };
  function htmlDe(L) {
    const t = (rows) => rows.length ? '<table><tr>' + Object.keys(rows[0]).map((k) => '<th>' + esc(k.replace(/_/g, ' ')) + '</th>').join('') + '</tr>' + rows.map((r) => '<tr>' + Object.keys(r).map((k) => '<td>' + esc(r[k]) + '</td>').join('') + '</tr>').join('') + '</table>' : '<p>Nenhum.</p>';
    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>Atletas · CONBRAKS 2026</title><style>body{font:14px/1.45 system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px}h2{font-size:16px;margin-top:28px}table{border-collapse:collapse;width:100%;margin-top:8px}th,td{border:1px solid #ccc;padding:4px 6px;text-align:left;vertical-align:top}th{background:#f2f2f2}.s{color:#666}</style></head><body>' +
      '<h1>Atletas · 7º Campeonato Brasileiro de Kettlebell Sport</h1><p class="s">Exportado em ' + esc(new Date().toLocaleString('pt-BR')) + ' · ' + L.length + ' atleta(s) · uso interno da organização.</p>' +
      '<h2>Cadastro</h2>' + t(linhasCadastro(L)) + '<h2>Resultados registrados no contador</h2>' + t(linhasResultados(L)) + '</body></html>';
  }
  function baixaArq(nome, texto, tipo) { const b = new Blob([texto], { type: tipo }); const u = URL.createObjectURL(b); const el = document.createElement('a'); el.href = u; el.download = nome; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  function exportaAtletas(L, formato) {
    const dia = new Date().toISOString().slice(0, 10), base = L.length === 1 ? 'atleta_' + norm(L[0].nome).replace(/[^a-z0-9]+/g, '_') : 'atletas_' + L.length;
    if (formato === 'html') baixaArq(base + '_' + dia + '.html', htmlDe(L), 'text/html;charset=utf-8');
    else { baixaArq(base + '_cadastro_' + dia + '.csv', csvDe(linhasCadastro(L)), 'text/csv;charset=utf-8'); const r = linhasResultados(L); if (r.length) setTimeout(() => baixaArq(base + '_resultados_' + dia + '.csv', csvDe(r), 'text/csv;charset=utf-8'), 400); }
    toast('Exportado: ' + L.length + ' atleta(s)');
  }
  function escolheFormato(L, volta) {
    if (!L.length) { toast('Nenhum atleta selecionado', 'err'); return; }
    mostra('<h2>Exportar ' + (L.length === 1 ? esc(L[0].nome) : L.length + ' atletas') + '</h2><p class="ko-sub">Cadastro e resultados registrados no contador. Sem e-mail, telefone e data de nascimento.</p>' +
      '<div class="ko-btns"><button class="ko-btn" id="ko-fh">HTML (abre no navegador, dá para imprimir)</button><button class="ko-btn sec" id="ko-fc">CSV (planilha)</button><button class="ko-btn sec" id="ko-v">Voltar</button></div>');
    $('ko-fh').onclick = () => exportaAtletas(L, 'html'); $('ko-fc').onclick = () => exportaAtletas(L, 'csv'); $('ko-v').onclick = volta;
  }

  // ---------- Exportar dados para estudo (analytics) ----------
  // 1 linha por sessão + tabelas por minuto e por segundo + dicionário. Sem nome, contato, cidade ou data de nascimento.
  async function montaEstudo() {
    const L = [], M = [], S = [];
    for (const a of dados || []) {
      const fcs = a.fc || []; if (!fcs.length) continue;
      const codigo = 'A' + (await sha('kb-estudo|' + a.id)).slice(0, 8);
      const base = perfilDe(a), g = a.pesagem || {};
      for (const s of fcs) {
        const cx = s.contexto || {};
        const perfil = Object.assign({}, base, { pse: s.pse != null ? +s.pse : undefined });
        if (cx.fc_repouso) { perfil.fcRepouso = +cx.fc_repouso; perfil.fcRepousoProtocolo = cx.fc_repouso_protocolo || 'manual'; }
        const mov = norm(s.movimento);
        const insc = (a.inscricoes || []).find((i) => mov && norm(i.prova).includes(mov)) || ((a.inscricoes || []).length === 1 ? a.inscricoes[0] : null);
        const prova = (a.provas || []).find((p) => p.id === s.prova_id) || {};
        const sess = Object.assign({}, s, { amostras: (s.amostras || []).map((x) => [x[0], x[1] === null ? NaN : x[1]]) });
        const r = KBMetricas.analytics(sess, perfil, { sessao_id: s.id, atleta_codigo: codigo, altura: g.altura_cm, movimento: s.movimento, carga_kg: insc ? insc.carga_kg : null,
          categoria: insc ? (insc.categorias || []).join(', ') : '', plataforma: s.pista, sensor_nome: s.sensor_nome, sensor_posicao: cx.sensor_posicao || '', no_counts: prova.no_counts, simulado: s.simulado || a.mock });
        L.push(r.linha); M.push(...r.minutos); S.push(...r.segundos);
      }
    }
    return { L, M, S };
  }
  function baixa(nome, texto) { const b = new Blob([texto], { type: 'text/csv;charset=utf-8' }); const u = URL.createObjectURL(b); const el = document.createElement('a'); el.href = u; el.download = nome; document.body.appendChild(el); el.click(); el.remove(); setTimeout(() => URL.revokeObjectURL(u), 4000); }
  async function exportar() {
    mostra('<h2>Exportar dados (uso interno da organização)</h2><p class="ko-sub">Calculando…</p>');
    let d; try { d = await montaEstudo(); } catch (e) { mostra('<h2>Dados do sensor (uso interno da organização)</h2><p class="ko-err">' + esc(e.message) + '</p><div class="ko-btns"><button class="ko-btn sec" id="ko-v">Voltar</button></div>'); $('ko-v').onclick = lista; return; }
    const dia = new Date().toISOString().slice(0, 10), sim = d.L.filter((l) => l.simulado).length;
    const dic = KBMetricas.DICIONARIO.map((x) => ({ tabela: 'sessoes', campo: x[0], descricao: x[1], unidade: x[2], natureza: x[3], fonte: x[4] }))
      .concat(KBMetricas.DIC_MIN.map((x) => ({ tabela: 'minutos', campo: x[0], descricao: x[1], unidade: '', natureza: '', fonte: '' })))
      .concat(KBMetricas.DIC_SEG.map((x) => ({ tabela: 'segundos', campo: x[0], descricao: x[1], unidade: '', natureza: '', fonte: '' })));
    mostra('<h2>Exportar dados (uso interno da organização)</h2><p class="ko-sub">' + d.L.length + ' sessões com sensor' + (sim ? ' (' + sim + ' simuladas, marcadas com simulado = 1)' : '') + ' · ' + d.S.length + ' segundos gravados. Método: ' + esc(KBMetricas.VERSAO) + '.</p>' +
      '<p class="ko-err" style="color:#ffcc66">Os atletas autorizaram, pela inscrição, só a gravação da FC e o relatório. Estes arquivos são para uso interno da organização e <strong>não podem ser usados em estudo ou publicação</strong> sem nova autorização dos atletas e aprovação de um comitê de ética.</p><p class="ko-sub">Os arquivos não têm nome, contato, cidade nem data de nascimento: cada atleta aparece só por um código, o que não impede identificação pelos resultados públicos.</p>' +
      '<div class="ko-btns" style="flex-wrap:wrap"><button class="ko-btn" id="ko-e1">Sessões (1 linha por série)</button><button class="ko-btn sec" id="ko-e2">Por minuto</button><button class="ko-btn sec" id="ko-e3">Por segundo</button><button class="ko-btn sec" id="ko-e4">Dicionário dos campos</button><button class="ko-btn sec" id="ko-v">Voltar</button></div>');
    $('ko-e1').onclick = () => baixa('kb_estudo_sessoes_' + dia + '.csv', KBMetricas.csv(d.L, KBMetricas.DICIONARIO.map((x) => x[0])));
    $('ko-e2').onclick = () => baixa('kb_estudo_minutos_' + dia + '.csv', KBMetricas.csv(d.M, KBMetricas.DIC_MIN.map((x) => x[0])));
    $('ko-e3').onclick = () => baixa('kb_estudo_segundos_' + dia + '.csv', KBMetricas.csv(d.S, KBMetricas.DIC_SEG.map((x) => x[0])));
    $('ko-e4').onclick = () => baixa('kb_estudo_dicionario_' + dia + '.csv', KBMetricas.csv(dic, ['tabela', 'campo', 'descricao', 'unidade', 'natureza', 'fonte']));
    $('ko-v').onclick = lista;
  }
  const dur = (s) => s == null ? '–' : Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
  function detalhe(a) {
    const loc = fcLocais().filter((s) => !s.enviada && norm(s.atleta) === norm(a.nome));
    const fcs = (a.fc || []).map((s) => Object.assign({ origem: 'banco' }, s)).concat(loc.map((s) => Object.assign({ origem: 'este aparelho' }, s)));
    const g = a.pesagem || {};
    const kv = [['Equipe', a.equipe], ['Cidade', [a.cidade, a.uf].filter(Boolean).join('/')], ['Sexo', a.sexo], ['Idade no evento', a.idade],
      ['Classe 10 min', a.classe_10], ['Classe 12/30 min', a.classe_12_30], ['Federado', a.federado == null ? '' : (a.federado ? 'Sim' : 'Não')], ['Entidade', a.entidade],
      ['Peso (última pesagem)', g.peso_kg != null ? pesoTxt(g) + ' kg' + (quando(g) ? ' · ' + quando(g) : '') : ''], ['Altura', g.altura_cm != null ? g.altura_cm + ' cm' : ''], ['FC de repouso', g.fc_repouso != null ? g.fc_repouso + ' bpm' : ''],
      ['E-mail', a.tem_email ? 'cadastrado' : 'falta'], ['WhatsApp', a.tem_whatsapp ? 'cadastrado' : 'falta'], ['Área do atleta', a.conta ? 'conta criada (' + a.conta + ')' : 'sem conta'],
      ['Menor de idade', a.menor ? 'sim' : '']].filter((x) => x[1] !== '' && x[1] != null);
    const pes = (a.pesagens || []).length ? a.pesagens : (g.peso_kg != null ? [g] : []);
    mostra('<h2' + (a.mock ? ' class="kb-mock"' : '') + '>' + esc(a.nome) + (a.mock ? '<span class="kb-mock-tag" title="Dado fictício (mock)">MOCK</span>' : '') + '</h2><p class="ko-sub">' + esc(a.apelido ? 'Nome no placar: ' + a.apelido : '') + '</p>' +
      '<div class="ko-kv">' + kv.map((x) => '<div><span>' + esc(x[0]) + '</span>' + esc(x[1]) + '</div>').join('') + '</div>' +
      '<h3>Inscrições</h3>' + ((a.inscricoes || []).length ? '<table class="ko-tab"><tr><th>Prova</th><th>Carga</th><th>Categorias</th></tr>' + a.inscricoes.map((i) => '<tr><td>' + esc(i.prova) + '</td><td>' + (i.carga_kg ? esc(i.carga_kg) + ' kg' : '–') + '</td><td>' + esc((i.categorias || []).join(', ')) + '</td></tr>').join('') + '</table>' : '<p class="ko-sub">Nenhuma.</p>') +
      '<h3>Resultados no contador</h3>' + ((a.provas || []).length ? '<table class="ko-tab"><tr><th>Data</th><th>Movimento</th><th>Plat.</th><th class="n">Rep. válidas</th><th class="n">No count</th><th class="n">Duração</th></tr>' + a.provas.map((p) => '<tr' + (p.mock ? ' class="kb-mock"' : '') + '><td>' + (p.inicio ? new Date(p.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–') + '</td><td>' + esc(p.movimento || '–') + '</td><td>' + esc(p.pista || '–') + '</td><td class="n">' + (p.reps != null ? p.reps : '–') + '</td><td class="n">' + (p.no_counts != null ? p.no_counts : '–') + '</td><td class="n">' + dur(p.duracao_s) + '</td></tr>').join('') + '</table>' : '<p class="ko-sub">Nenhum resultado ainda.</p>') +
      '<h3>Frequência cardíaca</h3>' + (fcs.length ? '<div class="ko-list">' + fcs.map((s, i) => '<button class="ko-item' + (s.simulado ? ' kb-mock' : '') + '" data-i="' + i + '"><div><strong>' + new Date(s.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + (s.movimento ? ' · ' + esc(s.movimento) : '') + '</strong><small>' + (s.score || 0) + ' repetições · ' + esc(s.origem) + (s.simulado ? ' · SIMULADO' + '<span class="kb-mock-tag" title="Dado fictício (mock)">MOCK</span>' : '') + '</small></div><small>ver relatório ›</small></button>').join('') + '</div>' : '<p class="ko-sub">Nenhuma sessão com o sensor.</p>') +
      '<h3>Pesagens</h3>' + (pes.length ? '<table class="ko-tab"><tr><th>Dia e hora</th><th class="n">Peso</th><th>Responsável</th></tr>' + pes.map((x) => '<tr><td>' + esc(quando(x)) + '</td><td class="n">' + esc(pesoTxt(x)) + ' kg</td><td>' + esc(x.responsavel || '') + '</td></tr>').join('') + '</table>' : '<p class="ko-sub">Nenhuma pesagem registrada.</p>') +
      '<div class="ko-btns">' + (a.id ? '<button class="ko-btn" id="ko-pes">Inserir pesagem</button><button class="ko-btn sec" id="ko-e1">Exportar este atleta</button>' : '') + '<button class="ko-btn sec" id="ko-v">Voltar</button></div>');
    ov.querySelectorAll('.ko-item[data-i]').forEach((b) => { b.onclick = () => relatorio(a, fcs[+b.dataset.i]); });
    if (a.id) { $('ko-pes').onclick = () => pesagem(a); $('ko-e1').onclick = () => escolheFormato([a], () => detalhe(a)); }
    $('ko-v').onclick = () => (dados && a.id ? lista() : offline());
  }
  // ---------- Inserir pesagem (PIN da organização): peso com dia e hora ----------
  function pesagem(a) {
    const agora = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    mostra('<h2>Inserir pesagem</h2><p class="ko-sub">' + esc(a.nome) + '. Fica registrada com dia e hora; as anteriores continuam guardadas.</p>' + filaInfo() +
      '<div class="ko-grid"><label>Peso (kg)<input class="ko-in" id="ko-pp" inputmode="decimal" autocomplete="off" autofocus placeholder="Ex.: 72,4"></label>' +
      '<label>Dia e hora<input class="ko-in" id="ko-pq" type="datetime-local" value="' + agora + '"></label>' +
      '<label>Responsável<input class="ko-in" id="ko-pr" autocomplete="off" value="' + esc(arb()) + '" placeholder="Seu nome"></label></div>' +
      '<div id="ko-msg" role="alert" style="margin-top:8px"></div><div class="ko-btns"><button class="ko-btn" id="ko-ps">Salvar pesagem</button><button class="ko-btn sec" id="ko-v">Voltar</button></div>');
    $('ko-v').onclick = () => detalhe(a);
    $('ko-ps').onclick = async () => {
      const peso = ($('ko-pp').value || '').trim().replace(',', '.'), q = $('ko-pq').value, resp = ($('ko-pr').value || '').trim(), msg = $('ko-msg');
      const erros = [];
      if (!(+peso >= 25 && +peso <= 250)) erros.push('Peso fora de 25–250 kg.');
      if (!q) erros.push('Informe o dia e a hora.');
      if (!resp) erros.push('Informe o responsável.');
      if (erros.length) { msg.innerHTML = '<span class="ko-err">' + erros.map(esc).join('<br>') + '</span>'; return; }
      const em = new Date(q).toISOString();
      const item = { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), atleta_id: a.id, nome: a.nome, campos: { peso_kg: peso, pesado_em: em, data_pesagem: q.slice(0, 10), responsavel: resp }, cadastrado_por: resp, dispositivo_id: disp(), criado: Date.now() };
      const F = lsGet(K_FILA, []); F.push(item); lsSet(K_FILA, F);
      $('ko-ps').disabled = true; msg.innerHTML = '<span class="ko-ok">Salvo no aparelho. Enviando…</span>';
      const r = await enviaFila();
      if (r.enviados && !lsGet(K_FILA, []).some((x) => x.id === item.id)) {
        msg.innerHTML = '<span class="ko-ok">Pesagem registrada no banco.</span>';
        try { await carga(true); } catch (e) {}
        const novo = dados.find((x) => x.id === a.id), tn = telaN; if (novo) setTimeout(() => { if (tn === telaN && ov.style.display === 'flex') detalhe(novo); }, 700);
      } else msg.innerHTML = '<span class="ko-warn">' + esc(r.erro || 'Sem internet: a pesagem fica guardada e é enviada quando houver rede (com o PIN digitado).') + '</span>';
    };
  }
  // v21 (18/11): mesmo painel do contador — resumo do que a organização pediu, "+ informações" com tudo, largo no computador
  function relatorio(a, s, completo) {
    const perf = perfilDe(a), cx = s.contexto || {};
    if (Number.isFinite(s.idade_sessao)) perf.idade = s.idade_sessao;
    if (s.peso_sessao != null) perf.peso = +s.peso_sessao;
    const rep5 = cx.fc_repouso && cx.fc_repouso_protocolo === '5min' ? { v: +cx.fc_repouso, mom: cx.fc_repouso_momento } : null;
    perf.fcRepouso = rep5 ? rep5.v : undefined; perf.fcRepousoProtocolo = rep5 ? '5min' : undefined; perf.fcRepousoMomento = rep5 ? rep5.mom : undefined;
    const dados = [
      { rot: 'Sexo', val: a.sexo || 'não informado', fonte: a.sexo ? 'cadastro (banco)' : '', off: !a.sexo },
      { rot: 'Idade', val: perf.idade != null ? perf.idade + ' anos' : 'não informada', fonte: perf.idade != null ? 'banco (ano de nascimento), no dia da série' : '', off: perf.idade == null },
      { rot: 'Peso', val: perf.peso != null ? String(perf.peso).replace('.', ',') + ' kg' : 'sem pesagem', fonte: perf.peso != null ? 'pesagem ' + (s.peso_data || '') : 'use "Inserir pesagem"', off: perf.peso == null },
      { rot: 'FC sentado 5 min', val: rep5 ? rep5.v + ' bpm' : 'não medida', fonte: rep5 ? 'medida de 5 min, ' + (rep5.mom === 'antes_aquecimento' ? 'antes' : 'depois') + ' do aquecimento' : 'TRIMP de Banister, EPOC e índice da reserva ficam desabilitados', off: !rep5 }
    ];
    const r = KBRelFC.painel(s, perf, { estimativas: mostrarC, dados, completo });
    mostra('<div id="ko-rel">' + r.html + '</div><div class="ko-btns"><button class="ko-btn sec" id="ko-v">Voltar</button></div>');
    ov.querySelector('.ko-box').classList.add('ko-larga');
    KBRelFC.ligaPainel($('ko-rel'), s, (v) => { mostrarC = v; relatorio(a, s, true); });
    $('ko-v').onclick = () => { KBRelFC.pararReplays(); detalhe(a); };
  }
  function offline() {
    const L = fcLocais(), por = {};
    L.forEach((s) => { (por[s.atleta || 'Sem nome'] = por[s.atleta || 'Sem nome'] || []).push(s); });
    mostra('<h2>Atletas</h2><p class="ko-warn">Sem internet. A lista completa vem do banco; aqui aparecem só as sessões de FC gravadas neste aparelho.</p>' +
      '<div class="ko-list">' + (Object.keys(por).sort().map((n) => '<button class="ko-item" data-n="' + esc(n) + '"><div><strong>' + esc(n) + '</strong><small>' + por[n].length + ' sessão(ões) de FC</small></div><small>›</small></button>').join('') || '<p class="ko-sub">Nenhuma sessão neste aparelho.</p>') + '</div>' +
      '<div class="ko-btns"><button class="ko-btn sec" id="ko-v">Voltar</button></div>');
    ov.querySelectorAll('.ko-item').forEach((b) => { b.onclick = () => { const a = { nome: b.dataset.n, fc: [] }; detalhe(Object.assign(a, { fc: [] })); }; });
    $('ko-v').onclick = fecha;
  }

  // ---------- Editar cadastro (PIN de edição; o servidor confere o PIN da organização) ----------
  function filaInfo() { const n = lsGet(K_FILA, []).length; return n ? '<p class="ko-warn">' + n + ' ajuste(s) aguardando envio ao banco.</p>' : ''; }
  function ajuste(a) {
    const loc = lsGet('kb_h1_perfis_v1', {})[norm(a.nome)] || {};
    const equipes = [...new Set(dados.map((x) => x.equipe).filter(Boolean))].sort();
    const campo = (id, rot, val, extra) => '<label>' + rot + '<input class="ko-in" id="ko-' + id + '" value="' + esc(val == null ? '' : val) + '" ' + (extra || '') + '></label>';
    const sel = (id, rot, val, ops) => '<label>' + rot + '<select class="ko-in" id="ko-' + id + '">' + ops.map((o) => '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';
    const g = a.pesagem || {};
    mostra('<h2>Editar cadastro</h2><p class="ko-sub">' + esc(a.nome) + '. Resultados não são editáveis.</p>' +
      '<h3>Dados do atleta</h3><div class="ko-grid">' + campo('nome_completo', 'Nome completo', a.nome) + campo('apelido_exibicao', 'Nome no placar', a.apelido) +
      sel('sexo', 'Sexo', a.sexo || '', [['', '—'], ['Masculino', 'Masculino'], ['Feminino', 'Feminino']]) + campo('cidade', 'Cidade', a.cidade) + campo('uf', 'UF', a.uf, 'maxlength="2" style="text-transform:uppercase"') +
      campo('equipe', 'Equipe', a.equipe, 'list="ko-eqs"') + '<datalist id="ko-eqs">' + equipes.map((e) => '<option value="' + esc(e) + '">').join('') + '</datalist>' +
      sel('federado', 'Federado', a.federado == null ? '' : String(a.federado), [['', '—'], ['true', 'Sim'], ['false', 'Não']]) + campo('entidade', 'Entidade', a.entidade) +
      campo('classe_peso_10min', 'Classe de peso 10 min', a.classe_10) + campo('classe_peso_12_30min', 'Classe de peso 12/30 min', a.classe_12_30) + '</div>' +
      '<h3>Pesagem, altura e FC de repouso</h3><p class="ko-sub">Última: ' + (g.data ? esc(new Date(g.data + 'T12:00').toLocaleDateString('pt-BR')) + ' · ' + (g.peso_kg != null ? String(g.peso_kg).replace('.', ',') + ' kg' : 'sem peso') + (g.altura_cm != null ? ' · ' + g.altura_cm + ' cm' : '') + (g.fc_repouso != null ? ' · FC ' + g.fc_repouso + ' bpm' : '') : 'nenhuma') + '. Preencha para registrar uma nova.</p>' +
      '<div class="ko-grid">' + campo('peso_kg', 'Peso (kg)', '', 'inputmode="decimal"') + campo('altura_cm', 'Altura (cm)', '', 'inputmode="numeric"') +
      campo('fc_repouso', 'FC de repouso (bpm)', loc.fcRepouso && !(g.fc_repouso != null) ? loc.fcRepouso : '', 'inputmode="numeric"' + (loc.fcRepouso ? ' title="Medida com o sensor neste aparelho"' : '')) +
      campo('pesado_em', 'Dia e hora', new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16), 'type="datetime-local"') + campo('responsavel', 'Responsável pela pesagem', arb()) + '</div>' +
      (loc.fcRepouso && !(g.fc_repouso != null) ? '<p class="ko-sub">FC de repouso preenchida com a medida do sensor neste aparelho (' + loc.fcRepouso + ' bpm).</p>' : '') +
      '<h3>Dados privados (só escrita)</h3><div class="ko-priv"><p class="ko-sub">O valor atual não é mostrado. Preencha só o que for corrigir ou incluir. Situação: e-mail ' + (a.tem_email ? 'cadastrado' : '<b class="ko-warn">falta</b>') + ' · WhatsApp ' + (a.tem_whatsapp ? 'cadastrado' : '<b class="ko-warn">falta</b>') + '.</p><div class="ko-grid">' +
      campo('email', 'E-mail', '', 'type="email" autocomplete="off"') + campo('whatsapp', 'WhatsApp com DDD', '', 'inputmode="tel" autocomplete="off"') + campo('responsavel_legal', 'Responsável legal (menor)', '', 'autocomplete="off"') + '</div></div>' +
      '<h3>Quem está alterando</h3><div class="ko-grid">' + campo('quem', 'Seu nome (árbitro ou organização)', arb(), 'autocomplete="off"') + '</div>' +
      '<div id="ko-msg" role="alert" style="margin-top:8px"></div><div class="ko-btns"><button class="ko-btn" id="ko-s">Salvar</button><button class="ko-btn sec" id="ko-v">Voltar</button></div>');
    $('ko-v').onclick = () => (modo === 'editar' ? lista() : detalhe(a));
    $('ko-s').onclick = async () => {
      const v = (id) => ($('ko-' + id).value || '').trim(), msg = $('ko-msg');
      const atual = { nome_completo: a.nome, apelido_exibicao: a.apelido, sexo: a.sexo, cidade: a.cidade, uf: a.uf, equipe: a.equipe, federado: a.federado == null ? '' : String(a.federado), entidade: a.entidade, classe_peso_10min: a.classe_10, classe_peso_12_30min: a.classe_12_30 };
      const campos = {};
      Object.keys(atual).forEach((k) => { let x = v(k); if (k === 'uf') x = x.toUpperCase(); if (x && x !== String(atual[k] == null ? '' : atual[k])) campos[k] = x; });
      ['peso_kg', 'altura_cm', 'fc_repouso'].forEach((k) => { const x = v(k).replace(',', '.'); if (x) campos[k] = x; });
      if (campos.peso_kg || campos.altura_cm || campos.fc_repouso) { const q = v('pesado_em'); if (q) { campos.pesado_em = new Date(q).toISOString(); campos.data_pesagem = q.slice(0, 10); } if (v('responsavel')) campos.responsavel = v('responsavel'); }
      ['email', 'whatsapp', 'responsavel_legal'].forEach((k) => { if (v(k)) campos[k] = v(k); });
      const erros = [];
      if (campos.email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(campos.email)) erros.push('E-mail inválido.');
      if (campos.whatsapp && campos.whatsapp.replace(/\D/g, '').length < 10) erros.push('WhatsApp precisa ter DDD + número.');
      if (campos.peso_kg && !(+campos.peso_kg >= 25 && +campos.peso_kg <= 250)) erros.push('Peso fora de 25–250 kg.');
      if (campos.altura_cm && !(+campos.altura_cm >= 100 && +campos.altura_cm <= 230)) erros.push('Altura fora de 100–230 cm.');
      if (campos.fc_repouso && !(+campos.fc_repouso >= 30 && +campos.fc_repouso <= 120)) erros.push('FC de repouso fora de 30–120 bpm.');
      if (campos.equipe && !equipes.some((e) => norm(e) === norm(campos.equipe))) erros.push('Equipe não cadastrada: escolha uma da lista.');
      if (!v('quem')) erros.push('Informe seu nome.');
      if (!Object.keys(campos).length) erros.push('Nada foi alterado.');
      if (erros.length) { msg.innerHTML = '<span class="ko-err">' + erros.map(esc).join('<br>') + '</span>'; return; }
      const item = { id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())), atleta_id: a.id, nome: a.nome, campos, cadastrado_por: v('quem'), dispositivo_id: disp(), criado: Date.now() };
      const F = lsGet(K_FILA, []); F.push(item); lsSet(K_FILA, F);
      $('ko-s').disabled = true; msg.innerHTML = '<span class="ko-ok">Salvo no aparelho. Enviando…</span>';
      const r = await enviaFila();
      if (r.enviados && !lsGet(K_FILA, []).some((x) => x.id === item.id)) {
        msg.innerHTML = '<span class="ko-ok">Enviado ao banco: ' + esc((r.ultimos[item.id] || []).join(', ')) + '.</span>';
        try { await carga(true); } catch (e) {}
        const novo = dados.find((x) => x.id === a.id), tn = telaN; if (novo) setTimeout(() => { if (tn === telaN && ov.style.display === 'flex') (modo === 'editar' ? ajuste(novo) : detalhe(novo)); }, 900);
      } else msg.innerHTML = '<span class="ko-warn">' + esc(r.erro || 'Sem internet: o ajuste fica guardado e é enviado quando houver rede (com o PIN digitado).') + '</span>';
    };
  }
  async function carga(f) { return carrega(f); }
  // envio da fila (precisa do PIN na memória)
  let enviandoF = false;
  async function enviaFila() {
    const res = { enviados: 0, ultimos: {}, erro: null };
    if (enviandoF || !pin || Date.now() > pinAte || !navigator.onLine) return res;
    enviandoF = true;
    try {
      const F = lsGet(K_FILA, []), resta = [];
      for (const it of F) {
        try {
          const j = await rpc('atleta_ajustar', { pin, atleta_id: it.atleta_id, campos: it.campos, cadastrado_por: it.cadastrado_por, dispositivo_id: it.dispositivo_id });
          if (j.ok) { res.enviados++; res.ultimos[it.id] = j.alterados; } else { resta.push(it); res.erro = 'O banco recusou: ' + j.erro; }
        } catch (e) {
          const m = String(e.message || '');
          if (/campo_desconhecido|invalido|nao_encontrad/.test(m)) { res.erro = 'O banco recusou o ajuste de ' + it.nome + ': ' + m + '. Ele foi descartado.'; }
          else { resta.push(it); res.erro = 'Falha ao enviar: ' + m; }
        }
      }
      lsSet(K_FILA, resta);
    } finally { enviandoF = false; }
    return res;
  }
  window.addEventListener('online', () => { enviaFila(); });

  window.kbOrg = { atletas: abrirAtletas, cadastro: abrirAtletas, enviaFila, fechar: fecha };
})();
