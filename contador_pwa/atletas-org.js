/* atletas-org.js — Área da organização no Contador: "Atletas" (todos os atletas com dados e desempenho)
 * e "Cadastro de atletas" (corrigir dados, pesagem, FC de repouso e dados privados só de escrita).
 * Protegido pelo mesmo PIN do contador: no aparelho fica só o hash (confere offline); o banco confere o PIN de novo.
 * Os dados vindos do banco ficam só na memória (não são gravados no aparelho).
 * Depende de: metricas.js, relatorio-fc.js. Usa (se existirem) NUVEM, showToast, deviceId, arbitro, kbH1.
 */
(function () {
  'use strict';
  if (window.kbOrg) return;
  const PIN_SHA = '4b16c9448cd7a7382dc6bc9171f7546998d6d474a55579c575e5c77994a1b7d0';            // SHA-256 de 'kb-conbraks-org|' + PIN (o PIN não fica no código)
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

  let pin = null, pinAte = 0, dados = null, dadosEm = 0, mostrarC = false;

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
  `;
  document.head.appendChild(st);
  const ov = document.createElement('div'); ov.className = 'ko-ov'; ov.id = 'ko-ov'; document.body.appendChild(ov);
  ov.addEventListener('click', (e) => { if (e.target === ov) fecha(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.style.display === 'flex') fecha(); });
  function mostra(h) { ov.innerHTML = '<div class="ko-box" role="dialog" aria-modal="true">' + h + '</div>'; ov.style.display = 'flex'; ov.scrollTop = 0; const f = ov.querySelector('[autofocus]'); if (f) f.focus(); }
  function fecha() { ov.style.display = 'none'; ov.innerHTML = ''; }

  // ---------- PIN ----------
  async function sha(t) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)); return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join(''); }
  function pedePin(titulo) {
    return new Promise((ok) => {
      if (pin && Date.now() < pinAte) return ok(true);
      mostra('<h2>' + esc(titulo) + '</h2><p class="ko-sub">Área da organização. Digite o PIN.</p><div class="ko-pin">' + [0, 1, 2, 3].map((i) => '<input class="ko-in" id="ko-p' + i + '" inputmode="numeric" maxlength="1" autocomplete="off" aria-label="Dígito ' + (i + 1) + ' do PIN"' + (i ? '' : ' autofocus') + ' type="password">').join('') + '</div><div id="ko-pe" class="ko-err" role="alert" style="text-align:center;min-height:1.4em"></div><div class="ko-btns" style="justify-content:center"><button class="ko-btn sec" id="ko-pc">Cancelar</button></div>');
      const ins = [0, 1, 2, 3].map((i) => $('ko-p' + i));
      const confere = async () => {
        const v = ins.map((i) => i.value).join(''); if (v.length < 4) return;
        if ((await sha('kb-conbraks-org|' + v)) === PIN_SHA) { pin = v; pinAte = Date.now() + PIN_VALIDADE; ok(true); enviaFila(); }
        else { $('ko-pe').textContent = 'PIN incorreto.'; ins.forEach((i) => { i.value = ''; }); ins[0].focus(); }
      };
      ins.forEach((inp, i) => {
        inp.addEventListener('input', () => { inp.value = inp.value.replace(/\D/g, '').slice(-1); if (inp.value && i < 3) ins[i + 1].focus(); confere(); });
        inp.addEventListener('keydown', (e) => { if (e.key === 'Backspace' && !inp.value && i > 0) ins[i - 1].focus(); });
      });
      $('ko-pc').onclick = () => { fecha(); ok(false); };
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
  async function carrega(forca) {
    if (dados && !forca && Date.now() - dadosEm < 120000) return dados;
    const j = await rpc('org_consultar', { pin });
    if (!j.ok) { if (j.erro === 'pin') { pin = null; } throw new Error(j.erro === 'bloqueado' ? 'Muitos PINs errados no banco. Espere 10 minutos.' : 'PIN recusado pelo banco.'); }
    dados = j.atletas || []; dadosEm = Date.now(); return dados;
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
    if (!navigator.onLine) return offline();
    mostra('<h2>Atletas</h2><p class="ko-sub">Carregando do banco…</p>');
    try { await carrega(); } catch (e) { mostra('<h2>Atletas</h2><p class="ko-err">' + esc(e.message) + '</p><div class="ko-btns"><button class="ko-btn sec" id="ko-f">Fechar</button></div>'); $('ko-f').onclick = fecha; return; }
    lista();
  }
  function lista() {
    const loc = fcLocais();
    mostra('<h2>Atletas</h2><p class="ko-sub">' + dados.length + ' atletas · dados do banco de ' + new Date(dadosEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '. Nada disto fica gravado no aparelho.</p>' +
      '<input class="ko-in" id="ko-q" placeholder="Buscar por nome, equipe, cidade ou prova" autocomplete="off" value="' + esc(busca) + '" autofocus aria-label="Buscar atleta">' +
      '<div class="ko-list" id="ko-l"></div><div class="ko-btns"><button class="ko-btn sec" id="ko-r">Atualizar</button><button class="ko-btn sec" id="ko-c">Cadastro de atletas</button><button class="ko-btn sec" id="ko-x">Exportar dados (uso interno)</button><button class="ko-btn sec" id="ko-f">Fechar</button></div>');
    const desenha = () => {
      const q = norm(busca);
      const it = dados.filter((a) => !q || norm([a.nome, a.apelido, a.equipe, a.cidade, a.uf, (a.inscricoes || []).map((i) => i.prova).join(' ')].join(' ')).includes(q));
      $('ko-l').innerHTML = it.map((a) => {
        const nfc = (a.fc || []).length + loc.filter((s) => !s.enviada && norm(s.atleta) === norm(a.nome)).length;
        return '<button class="ko-item' + (a.mock ? ' kb-mock' : '') + '" data-id="' + a.id + '"><div><strong>' + esc(a.nome) + '</strong>' + (a.mock ? '<span class="kb-mock-tag" title="Dado fictício (mock)">MOCK</span>' : '') + '<small>' + esc([a.equipe, [a.cidade, a.uf].filter(Boolean).join('/')].filter(Boolean).join(' · ')) + '</small>' +
          (a.inscricoes || []).map((i) => '<span class="ko-tag">' + esc(i.prova) + (i.carga_kg ? ' ' + i.carga_kg + 'kg' : '') + '</span>').join('') +
          (a.menor ? '<span class="ko-tag ' + (a.autorizacao_menor === 'autorizada' ? 'ok' : 'warn') + '">menor · ' + esc(a.autorizacao_menor || 'pendente') + '</span>' : '') +
          (a.conta ? '<span class="ko-tag ok">conta criada</span>' : '') + (nfc ? '<span class="ko-tag fc">' + nfc + ' FC</span>' : '') +
          '</div><small style="text-align:right">' + ((a.provas || []).length ? (a.provas || []).map((p) => (p.reps != null ? p.reps : '–') + ' rep').join('<br>') : '') + '</small></button>';
      }).join('') || '<p class="ko-sub">Nenhum atleta encontrado.</p>';
      $('ko-l').querySelectorAll('.ko-item').forEach((b) => { b.onclick = () => detalhe(dados.find((a) => a.id === b.dataset.id)); });
    };
    $('ko-q').addEventListener('input', (e) => { busca = e.target.value; desenha(); });
    desenha();
    $('ko-r').onclick = async () => { try { await carrega(true); lista(); } catch (e) { toast(e.message, 'err'); } };
    $('ko-c').onclick = () => escolheParaAjuste();
    $('ko-x').onclick = () => exportar();
    $('ko-f').onclick = fecha;
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
    let d; try { d = await montaEstudo(); } catch (e) { mostra('<h2>Exportar dados (uso interno da organização)</h2><p class="ko-err">' + esc(e.message) + '</p><div class="ko-btns"><button class="ko-btn sec" id="ko-v">Voltar</button></div>'); $('ko-v').onclick = lista; return; }
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
      ['Peso (pesagem)', g.peso_kg != null ? String(g.peso_kg).replace('.', ',') + ' kg' : ''], ['Altura', g.altura_cm != null ? g.altura_cm + ' cm' : ''], ['FC de repouso', g.fc_repouso != null ? g.fc_repouso + ' bpm' : ''],
      ['E-mail', a.tem_email ? 'cadastrado' : 'falta'], ['WhatsApp', a.tem_whatsapp ? 'cadastrado' : 'falta'], ['Área do atleta', a.conta ? 'conta criada (' + a.conta + ')' : 'sem conta'],
      ['Menor de idade', a.menor ? 'sim · autorização ' + (a.autorizacao_menor || 'pendente') : '']].filter((x) => x[1] !== '' && x[1] != null);
    mostra('<h2' + (a.mock ? ' class="kb-mock"' : '') + '>' + esc(a.nome) + (a.mock ? '<span class="kb-mock-tag" title="Dado fictício (mock)">MOCK</span>' : '') + '</h2><p class="ko-sub">' + esc(a.apelido ? 'Nome no placar: ' + a.apelido : '') + '</p>' +
      '<div class="ko-kv">' + kv.map((x) => '<div><span>' + esc(x[0]) + '</span>' + esc(x[1]) + '</div>').join('') + '</div>' +
      '<h3>Inscrições</h3>' + ((a.inscricoes || []).length ? '<table class="ko-tab"><tr><th>Prova</th><th>Carga</th><th>Categorias</th></tr>' + a.inscricoes.map((i) => '<tr><td>' + esc(i.prova) + '</td><td>' + (i.carga_kg ? esc(i.carga_kg) + ' kg' : '–') + '</td><td>' + esc((i.categorias || []).join(', ')) + '</td></tr>').join('') + '</table>' : '<p class="ko-sub">Nenhuma.</p>') +
      '<h3>Resultados no contador</h3>' + ((a.provas || []).length ? '<table class="ko-tab"><tr><th>Data</th><th>Movimento</th><th>Plat.</th><th class="n">Rep. válidas</th><th class="n">No count</th><th class="n">Duração</th></tr>' + a.provas.map((p) => '<tr' + (p.mock ? ' class="kb-mock"' : '') + '><td>' + (p.inicio ? new Date(p.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '–') + '</td><td>' + esc(p.movimento || '–') + '</td><td>' + esc(p.pista || '–') + '</td><td class="n">' + (p.reps != null ? p.reps : '–') + '</td><td class="n">' + (p.no_counts != null ? p.no_counts : '–') + '</td><td class="n">' + dur(p.duracao_s) + '</td></tr>').join('') + '</table>' : '<p class="ko-sub">Nenhum resultado ainda.</p>') +
      '<h3>Frequência cardíaca</h3>' + (fcs.length ? '<div class="ko-list">' + fcs.map((s, i) => '<button class="ko-item' + (s.simulado ? ' kb-mock' : '') + '" data-i="' + i + '"><div><strong>' + new Date(s.inicio).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + (s.movimento ? ' · ' + esc(s.movimento) : '') + '</strong><small>' + (s.score || 0) + ' repetições · ' + esc(s.origem) + (s.simulado ? ' · SIMULADO' + '<span class="kb-mock-tag" title="Dado fictício (mock)">MOCK</span>' : '') + '</small></div><small>ver relatório ›</small></button>').join('') + '</div>' : '<p class="ko-sub">Nenhuma sessão com o sensor.</p>') +
      '<div class="ko-btns">' + (a.id ? '<button class="ko-btn" id="ko-aj">Ajustar cadastro</button>' : '') + '<button class="ko-btn sec" id="ko-v">Voltar</button></div>');
    ov.querySelectorAll('.ko-item[data-i]').forEach((b) => { b.onclick = () => relatorio(a, fcs[+b.dataset.i]); });
    if (a.id) $('ko-aj').onclick = () => ajuste(a);
    $('ko-v').onclick = () => (dados && a.id ? lista() : offline());
  }
  function relatorio(a, s) {
    mostra('<h2>' + esc(a.nome) + '</h2><p class="ko-sub">' + new Date(s.inicio).toLocaleString('pt-BR') + (s.movimento ? ' · ' + esc(s.movimento) : '') + (s.pista ? ' · Plataforma ' + esc(s.pista) : '') + ' · ' + (s.score || 0) + ' repetições' + (s.simulado ? ' · SIMULADO' : '') + '</p>' +
      '<label style="display:flex;gap:8px;align-items:center;font-size:.88rem;color:#ccc"><input type="checkbox" id="ko-mc"' + (mostrarC ? ' checked' : '') + '> Mostrar estimativas (calorias, FCmáx pela idade)</label>' +
      '<div id="ko-rel">' + KBRelFC.html(s, perfilDe(a), { estimativas: mostrarC }) + '</div><div class="ko-btns"><button class="ko-btn sec" id="ko-v">Voltar</button></div>');
    KBRelFC.liga($('ko-rel'));
    $('ko-mc').onchange = (e) => { mostrarC = e.target.checked; relatorio(a, s); };
    $('ko-v').onclick = () => detalhe(a);
  }
  function offline() {
    const L = fcLocais(), por = {};
    L.forEach((s) => { (por[s.atleta || 'Sem nome'] = por[s.atleta || 'Sem nome'] || []).push(s); });
    mostra('<h2>Atletas</h2><p class="ko-warn">Sem internet. A lista completa vem do banco; aqui aparecem só as sessões de FC gravadas neste aparelho.</p>' +
      '<div class="ko-list">' + (Object.keys(por).sort().map((n) => '<button class="ko-item" data-n="' + esc(n) + '"><div><strong>' + esc(n) + '</strong><small>' + por[n].length + ' sessão(ões) de FC</small></div><small>›</small></button>').join('') || '<p class="ko-sub">Nenhuma sessão neste aparelho.</p>') + '</div>' +
      '<div class="ko-btns"><button class="ko-btn sec" id="ko-f">Fechar</button></div>');
    ov.querySelectorAll('.ko-item').forEach((b) => { b.onclick = () => { const a = { nome: b.dataset.n, fc: [] }; detalhe(Object.assign(a, { fc: [] })); }; });
    $('ko-f').onclick = fecha;
  }

  // ---------- Cadastro de atletas (ajuste) ----------
  async function abrirCadastro() {
    if (!(await pedePin('Cadastro de atletas'))) return;
    escolheParaAjuste();
  }
  async function escolheParaAjuste() {
    if (!dados) {
      if (!navigator.onLine) { mostra('<h2>Cadastro de atletas</h2><p class="ko-warn">Sem internet. Para escolher o atleta é preciso carregar a lista do banco uma vez nesta sessão.</p>' + filaInfo() + '<div class="ko-btns"><button class="ko-btn sec" id="ko-f">Fechar</button></div>'); $('ko-f').onclick = fecha; return; }
      mostra('<h2>Cadastro de atletas</h2><p class="ko-sub">Carregando do banco…</p>');
      try { await carrega(); } catch (e) { mostra('<h2>Cadastro de atletas</h2><p class="ko-err">' + esc(e.message) + '</p><div class="ko-btns"><button class="ko-btn sec" id="ko-f">Fechar</button></div>'); $('ko-f').onclick = fecha; return; }
    }
    mostra('<h2>Cadastro de atletas</h2><p class="ko-sub">Escolha o atleta para completar ou corrigir os dados (inclusive pesagem e FC de repouso).</p>' + filaInfo() +
      '<input class="ko-in" id="ko-q" placeholder="Buscar atleta" autocomplete="off" autofocus aria-label="Buscar atleta"><div class="ko-list" id="ko-l"></div><div class="ko-btns"><button class="ko-btn sec" id="ko-f">Fechar</button></div>');
    const desenha = (q) => {
      q = norm(q);
      $('ko-l').innerHTML = dados.filter((a) => !q || norm(a.nome + ' ' + (a.equipe || '')).includes(q)).map((a) => {
        const falta = [!a.tem_email && 'e-mail', !a.tem_whatsapp && 'WhatsApp', !a.cidade && 'cidade', !(a.pesagem && a.pesagem.peso_kg) && 'pesagem', !(a.pesagem && a.pesagem.fc_repouso) && 'FC repouso', a.menor && a.autorizacao_menor !== 'autorizada' && 'autorização'].filter(Boolean);
        return '<button class="ko-item" data-id="' + a.id + '"><div><strong>' + esc(a.nome) + '</strong><small>' + esc(a.equipe || '') + '</small>' + falta.map((f) => '<span class="ko-tag warn">falta ' + f + '</span>').join('') + '</div><small>›</small></button>';
      }).join('');
      $('ko-l').querySelectorAll('.ko-item').forEach((b) => { b.onclick = () => ajuste(dados.find((a) => a.id === b.dataset.id)); });
    };
    $('ko-q').addEventListener('input', (e) => desenha(e.target.value)); desenha('');
    $('ko-f').onclick = fecha;
  }
  function filaInfo() { const n = lsGet(K_FILA, []).length; return n ? '<p class="ko-warn">' + n + ' ajuste(s) aguardando envio ao banco.</p>' : ''; }
  function ajuste(a) {
    const loc = lsGet('kb_h1_perfis_v1', {})[norm(a.nome)] || {};
    const equipes = [...new Set(dados.map((x) => x.equipe).filter(Boolean))].sort();
    const campo = (id, rot, val, extra) => '<label>' + rot + '<input class="ko-in" id="ko-' + id + '" value="' + esc(val == null ? '' : val) + '" ' + (extra || '') + '></label>';
    const sel = (id, rot, val, ops) => '<label>' + rot + '<select class="ko-in" id="ko-' + id + '">' + ops.map((o) => '<option value="' + esc(o[0]) + '"' + (String(val) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select></label>';
    const g = a.pesagem || {};
    mostra('<h2>Ajustar cadastro</h2><p class="ko-sub">' + esc(a.nome) + '</p>' +
      '<h3>Dados do atleta</h3><div class="ko-grid">' + campo('nome_completo', 'Nome completo', a.nome) + campo('apelido_exibicao', 'Nome no placar', a.apelido) +
      sel('sexo', 'Sexo', a.sexo || '', [['', '—'], ['Masculino', 'Masculino'], ['Feminino', 'Feminino']]) + campo('cidade', 'Cidade', a.cidade) + campo('uf', 'UF', a.uf, 'maxlength="2" style="text-transform:uppercase"') +
      campo('equipe', 'Equipe', a.equipe, 'list="ko-eqs"') + '<datalist id="ko-eqs">' + equipes.map((e) => '<option value="' + esc(e) + '">').join('') + '</datalist>' +
      sel('federado', 'Federado', a.federado == null ? '' : String(a.federado), [['', '—'], ['true', 'Sim'], ['false', 'Não']]) + campo('entidade', 'Entidade', a.entidade) +
      campo('classe_peso_10min', 'Classe de peso 10 min', a.classe_10) + campo('classe_peso_12_30min', 'Classe de peso 12/30 min', a.classe_12_30) + '</div>' +
      '<h3>Pesagem e FC de repouso</h3><p class="ko-sub">Última: ' + (g.data ? esc(new Date(g.data + 'T12:00').toLocaleDateString('pt-BR')) + ' · ' + (g.peso_kg != null ? String(g.peso_kg).replace('.', ',') + ' kg' : 'sem peso') + (g.altura_cm != null ? ' · ' + g.altura_cm + ' cm' : '') + (g.fc_repouso != null ? ' · FC ' + g.fc_repouso + ' bpm' : '') : 'nenhuma') + '. Preencha para registrar uma nova.</p>' +
      '<div class="ko-grid">' + campo('peso_kg', 'Peso (kg)', '', 'inputmode="decimal"') + campo('altura_cm', 'Altura (cm)', '', 'inputmode="numeric"') +
      campo('fc_repouso', 'FC de repouso (bpm)', loc.fcRepouso && !(g.fc_repouso != null) ? loc.fcRepouso : '', 'inputmode="numeric"' + (loc.fcRepouso ? ' title="Medida com o sensor neste aparelho"' : '')) +
      campo('data_pesagem', 'Data', new Date().toISOString().slice(0, 10), 'type="date"') + campo('responsavel', 'Responsável pela pesagem', arb()) + '</div>' +
      (loc.fcRepouso && !(g.fc_repouso != null) ? '<p class="ko-sub">FC de repouso preenchida com a medida do sensor neste aparelho (' + loc.fcRepouso + ' bpm).</p>' : '') +
      '<h3>Dados privados (só escrita)</h3><div class="ko-priv"><p class="ko-sub">O valor atual não é mostrado. Preencha só o que for corrigir ou incluir. Situação: e-mail ' + (a.tem_email ? 'cadastrado' : '<b class="ko-warn">falta</b>') + ' · WhatsApp ' + (a.tem_whatsapp ? 'cadastrado' : '<b class="ko-warn">falta</b>') + '.</p><div class="ko-grid">' +
      campo('email', 'E-mail', '', 'type="email" autocomplete="off"') + campo('whatsapp', 'WhatsApp com DDD', '', 'inputmode="tel" autocomplete="off"') + campo('responsavel_legal', 'Responsável legal (menor)', '', 'autocomplete="off"') +
      sel('autorizacao_menor', 'Autorização do menor', '', [['', '— não alterar —'], ['pendente', 'Pendente'], ['autorizada', 'Autorizada'], ['negada', 'Negada']]) + '</div></div>' +
      '<h3>Quem está alterando</h3><div class="ko-grid">' + campo('quem', 'Seu nome (árbitro ou organização)', arb(), 'autocomplete="off"') + '</div>' +
      '<div id="ko-msg" role="alert" style="margin-top:8px"></div><div class="ko-btns"><button class="ko-btn" id="ko-s">Salvar</button><button class="ko-btn sec" id="ko-v">Voltar</button></div>');
    $('ko-v').onclick = () => detalhe(a);
    $('ko-s').onclick = async () => {
      const v = (id) => ($('ko-' + id).value || '').trim(), msg = $('ko-msg');
      const atual = { nome_completo: a.nome, apelido_exibicao: a.apelido, sexo: a.sexo, cidade: a.cidade, uf: a.uf, equipe: a.equipe, federado: a.federado == null ? '' : String(a.federado), entidade: a.entidade, classe_peso_10min: a.classe_10, classe_peso_12_30min: a.classe_12_30 };
      const campos = {};
      Object.keys(atual).forEach((k) => { let x = v(k); if (k === 'uf') x = x.toUpperCase(); if (x && x !== String(atual[k] == null ? '' : atual[k])) campos[k] = x; });
      ['peso_kg', 'altura_cm', 'fc_repouso'].forEach((k) => { const x = v(k).replace(',', '.'); if (x) campos[k] = x; });
      if (campos.peso_kg || campos.altura_cm || campos.fc_repouso) { campos.data_pesagem = v('data_pesagem'); if (v('responsavel')) campos.responsavel = v('responsavel'); }
      ['email', 'whatsapp', 'responsavel_legal', 'autorizacao_menor'].forEach((k) => { if (v(k)) campos[k] = v(k); });
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
        const novo = dados.find((x) => x.id === a.id); if (novo) setTimeout(() => detalhe(novo), 900);
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

  window.kbOrg = { atletas: abrirAtletas, cadastro: abrirCadastro, enviaFila };
})();
