/* relatorio-fc.js — desenha o relatório de uma sessão de FC (curva, cards com nível e fonte, tabela por minuto).
 * Usado pela área da organização (atletas-org.js) e pela área do atleta (atleta.html). Depende de metricas.js.
 * KBRelFC.html(sessao, perfil, {estimativas}) → string · KBRelFC.liga(elemento) liga os botões "i".
 * v21 (18/11): KBRelFC.painel(sessao, perfil, {estimativas, dados, aviso, extra}) → {html, res} · KBRelFC.ligaPainel(el, sessao, aoMudar): resumo (pedido do Jefferson) + "+ informações" + replay.
 */
(function () {
  'use strict';
  if (window.KBRelFC) return;
  const css = `
  .rf{--rf-bg:#141414;--rf-card:#1d1d1d;--rf-bd:#2c2c2c;--rf-tx:#f2f2f2;--rf-mu:#a8a8a8;color:var(--rf-tx);font:15px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
  .rf-chart{width:100%;height:170px;background:#0c0c0c;border-radius:10px;margin-top:8px;display:block}
  .rf-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:8px;margin-top:10px}
  .rf-card{background:var(--rf-card);border:1px solid var(--rf-bd);border-radius:12px;padding:10px;position:relative;min-width:0}
  .rf-card.wide,.rf-card.op{grid-column:1/-1}
  .rf-card .t{font-size:.8rem;color:var(--rf-mu);padding-right:24px}
  .rf-card .v{font:800 1.45rem/1.15 system-ui,sans-serif;margin-top:4px;overflow-wrap:anywhere}
  .rf-card .u{font-size:.8rem;color:var(--rf-mu);font-weight:600}
  .rf-card .m{font-size:.82rem;color:var(--rf-mu);margin-top:4px}
  .rf-card .i{position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:50%;border:1px solid #555;background:none;color:#ccc;font:700 12px system-ui;cursor:pointer;padding:0}
  .rf-card .n{display:none;font-size:.8rem;color:#ccc;margin-top:8px;border-top:1px solid #333;padding-top:8px} .rf-card.op .n{display:block}
  .rf-sel{display:inline-block;font:700 .66rem/1 system-ui;padding:3px 6px;border-radius:6px;margin-top:6px;letter-spacing:.3px}
  .rf-A{background:#14432a;color:#7fe0a6}.rf-B{background:#143049;color:#8cc8ff}.rf-C{background:#4a3010;color:#ffc477}.rf-D{background:#24323f;color:#b9cbdc}.rf-E,.rf-X{background:#2c2c2c;color:#aaa}.rf-R{background:#22303a;color:#a9c4d6}
  .rf-zon{width:100%;border-collapse:collapse;font-size:.82rem;margin-top:6px}.rf-zon td{padding:3px 0;vertical-align:middle}.rf-zon .bar{height:8px;border-radius:4px;background:#ffcc00}
  .rf-tab{width:100%;border-collapse:collapse;font-size:.85rem;margin-top:6px}.rf-tab th,.rf-tab td{border-bottom:1px solid #2a2a2a;padding:4px 6px;text-align:right}.rf-tab th:first-child,.rf-tab td:first-child{text-align:left}
  .rf-warn{color:#ffd24d;font-size:.9rem;margin-top:6px}
  .kb-mock{outline:2px dashed #ff8c00!important;outline-offset:2px}.kb-mock-tag{display:inline-block;font:700 .62rem/1 system-ui,sans-serif;letter-spacing:.06em;color:#ff8c00;border:1px dashed #ff8c00;border-radius:5px;padding:2px 5px;margin-left:6px;vertical-align:2px}
  .kb-sf{display:inline-flex;align-items:center;justify-content:center;width:13px;height:13px;margin-left:5px;border:1px dotted #b47cff;border-radius:50%;color:#b47cff;font:700 8px/1 system-ui,sans-serif;vertical-align:1px;cursor:help}
  .rf h4{margin:14px 0 4px;font-size:.98rem}
  .rf-ess{display:inline-block;font:700 .6rem/1 system-ui,sans-serif;letter-spacing:.04em;color:#ffcc00;border:1px solid #6b5a00;border-radius:5px;padding:2px 5px;margin:6px 0 0 6px}
  `;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NIVEL = { A: 'MEDIDO', B: 'CALCULADO', C: 'ESTIMATIVA', D: 'REFERÊNCIA DA LITERATURA', E: 'INDISPONÍVEL', R: 'REGRA DO SITE', X: 'DADOS INSUFICIENTES' };
  function valor(c) {
    if (c.insuficiente) return '<div class="v" style="font-size:1rem;color:#aaa">Dados insuficientes</div>';
    if (c.nivel === 'E') return '<div class="m">' + esc(c.motivo || 'Indisponível') + '</div>';
    if (c.nivel === 'D') return '<div class="m">' + esc(c.referencia || '') + '</div>';
    if (c.fmt === 'tempo') { const s = Math.round(c.valor); return '<div class="v">' + Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0') + '</div>'; }
    if (c.fmt === 'par') return '<div class="v">' + c.valor[0] + ' / ' + c.valor[1] + ' <span class="u">' + esc(c.unidade) + '</span></div>';
    if (c.fmt === 'faixa') return '<div class="v">≈ ' + c.valor[0] + (c.valor[1] !== c.valor[0] ? '–' + c.valor[1] : '') + ' <span class="u">' + esc(c.unidade) + '</span></div>' + (c.aviso ? '<div class="m">' + esc(c.aviso) + '</div>' : '');
    if (c.fmt === 'zonas') {
      const tot = c.valor.reduce((a, b) => a + b, 0) || 1;
      return '<table class="rf-zon">' + c.rotulos.map((r, i) => '<tr><td style="width:46%"><strong>' + esc(r) + '</strong>' + (c.textos ? '<br><span style="color:#999;font-size:.74rem">' + esc(c.textos[i]) + '</span>' : '') + '</td><td><div class="bar" style="width:' + Math.max(2, (c.valor[i] / tot) * 100) + '%;opacity:' + (0.35 + i * 0.13) + '"></div></td><td style="text-align:right;width:22%">' + c.valor[i].toFixed(1).replace('.', ',') + ' min</td></tr>').join('') + '</table><div class="m">Referência das zonas: ' + c.fcMax + ' bpm (' + esc(c.origemMax) + ')</div>';
    }
    return '<div class="v">' + (c.valor === null ? '--' : esc(String(c.valor).replace('.', ','))) + ' <span class="u">' + esc(c.unidade) + '</span></div>' + (c.faixa ? '<div class="m">faixa provável ' + c.faixa[0] + '–' + c.faixa[1] + ' bpm</div>' : '');
  }
  function grafico(s, res) {
    const W = 520, H = 170, pad = 26;
    const pts = s.amostras.filter((a) => Number.isFinite(a[1]));
    if (pts.length < 2) return '';
    const t0 = s.inicio, t1 = Math.max(pts[pts.length - 1][0], s.fim || 0);
    const vmin = Math.min(60, ...pts.map((p) => p[1])) - 5, vmax = Math.max(res.fcMax || 0, ...pts.map((p) => p[1])) + 5;
    const x = (t) => pad + ((t - t0) / (t1 - t0 || 1)) * (W - pad - 6), y = (v) => H - 18 - ((v - vmin) / (vmax - vmin || 1)) * (H - 28);
    let bandas = '';
    if (res.fcMax) [[0.9, '#ff4a4a'], [0.8, '#ff9a3c'], [0.7, '#ffcc00'], [0.6, '#2fbf6b']].forEach(([p, cor]) => { const yy = y(res.fcMax * p); bandas += '<line x1="' + pad + '" x2="' + (W - 6) + '" y1="' + yy + '" y2="' + yy + '" stroke="' + cor + '" stroke-opacity=".35" stroke-dasharray="3 4"/><text x="' + (W - 8) + '" y="' + (yy - 2) + '" fill="' + cor + '" fill-opacity=".75" font-size="9" text-anchor="end">' + Math.round(p * 100) + '% FCmáx</text>'; });
    let d = '', prev = null;
    pts.forEach((p) => { const gap = prev && p[0] - prev[0] > 3000; d += (d && !gap ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1) + ' '; prev = p; });
    const fimL = res && res.janelaExec === 'contagens' ? res.fim : s.fim, fimX = fimL ? x(fimL) : null, fimT = res && res.janelaExec === 'contagens' ? 'última contagem' : 'fim da série', mm = (ms) => Math.floor(ms / 60000) + ':' + String(Math.floor((ms % 60000) / 1000)).padStart(2, '0');
    return '<svg class="rf-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" role="img" aria-label="Curva da frequência cardíaca ao longo da série">' + bandas +
      (fimX ? '<line x1="' + fimX + '" x2="' + fimX + '" y1="6" y2="' + (H - 18) + '" stroke="#888" stroke-dasharray="2 3"/><text x="' + (fimX + 3) + '" y="14" fill="#aaa" font-size="9">' + fimT + '</text>' : '') +
      '<path d="' + d + '" fill="none" stroke="#fff" stroke-width="1.6"/>' +
      '<text x="4" y="' + (y(vmax - 5) + 4) + '" fill="#888" font-size="9">' + Math.round(vmax - 5) + '</text><text x="4" y="' + (y(vmin + 5) + 4) + '" fill="#888" font-size="9">' + Math.round(vmin + 5) + '</text>' +
      '<text x="' + pad + '" y="' + (H - 4) + '" fill="#888" font-size="9">0:00</text><text x="' + (W - 6) + '" y="' + (H - 4) + '" fill="#888" font-size="9" text-anchor="end">' + mm(t1 - t0) + '</text></svg>';
  }
  function html(sessao, perfil, opts) {
    opts = opts || {};
    const s = Object.assign({}, sessao, { amostras: (sessao.amostras || []).map((a) => [a[0], a[1] === null ? NaN : a[1]]) });
    const res = KBMetricas.calcula(s, Object.assign({}, perfil || {}, { pse: sessao.pse }));
    const ess = res.essenciais || [];
    const ordem = res.cards.filter((c) => opts.estimativas || c.nivel !== 'C' || ess.includes(c.id));
    ordem.sort((x, y) => (ess.includes(x.id) ? ess.indexOf(x.id) : 99) - (ess.includes(y.id) ? ess.indexOf(y.id) : 99));
    const cards = ordem.map((c) =>
      '<div class="rf-card' + (c.fmt === 'zonas' || c.nivel === 'D' || c.nivel === 'E' ? ' wide' : '') + '"><div class="t">' + esc(c.titulo) + (c.semFonte ? '<span class="kb-sf" title="Área experimental: hipótese ou cálculo do site, sem validação para este uso" aria-label="Área experimental">i</span>' : '') + '</div><button class="i" type="button" aria-label="Fonte de ' + esc(c.titulo) + '">i</button>' + valor(c) +
      '<span class="rf-sel rf-' + c.nivel + '">' + NIVEL[c.nivel] + '</span>' + (ess.includes(c.id) ? '<span class="rf-ess" title="Métrica mínima pedida pela organização do campeonato">ESSENCIAL</span>' : '') + '<div class="n"><strong>Fonte:</strong> ' + esc(c.ref) + '<br>' + esc(c.nota) +
      (c.metodos ? '<br><strong>Métodos:</strong> ' + c.metodos.map((m) => esc(m.nome) + ': ' + m.kcal + ' kcal').join('; ') : '') +
      (c.removido ? '<br><strong>Método retirado:</strong> ' + esc(c.removido) : '') + (c.semFonte ? '<br><strong style="color:#b47cff">Área experimental:</strong> ' + esc(c.semFonte) : '') + '</div></div>').join('');
    const tab = res.porMin.length ? '<h4>FC × repetições por minuto</h4><table class="rf-tab"><tr><th>Minuto</th><th>FC média</th><th>Repetições</th></tr>' + res.porMin.map((m) => '<tr><td>' + m.minuto + '</td><td>' + (m.fc || '--') + '</td><td>' + m.reps + '</td></tr>').join('') + '</table>' : '';
    return '<div class="rf' + (sessao.simulado ? ' kb-mock' : '') + '">' + (sessao.simulado ? '<div style="color:#ff8c00;font-size:.8rem;font-weight:700;margin-bottom:6px">SESSÃO SIMULADA (MOCK): batimentos fictícios, só para teste.</div>' : '') + (!res.suficiente ? '<div class="rf-warn">Só ' + Math.round(res.pctValidas * 100) + '% das leituras foram válidas (mínimo 80%). As métricas calculadas não foram geradas.</div>' : '') +
      grafico(s, res) + '<div class="rf-cards">' + cards + '</div>' + tab +
      '<p style="font-size:.78rem;color:#999;margin-top:12px">Versão do método: ' + esc(res.versao) + '. Valores para acompanhamento de treino; não é dispositivo médico. Sensor óptico de braço, não validado no kettlebell. Toque em "i" para ver a fonte de cada número.</p></div>';
  }
  function liga(el) { el.querySelectorAll('.rf-card .i').forEach((b) => { b.onclick = () => b.parentElement.classList.toggle('op'); }); }
  // ======================= v21 (18/11): painel em dois níveis =======================
  // Resumo = o que a organização (Jefferson) pediu, em destaque; "+ informações" abre tudo, em grupos. Largo no computador.
  const GRUPOS = [
    ['Qualidade dos dados', ['qualidade', 'duracao', 'duracao_reg']],
    ['Frequência cardíaca', ['fc_media', 'fc_pico', 'pico5', 'fc_min', 'fc_rep', 'ref', 'hrr60']],
    ['Pela idade (estimativas)', ['fcmax_tanaka', 'pct_tanaka', 'pct_fcmax']],
    ['Intensidade e carga', ['zonas', 't90', 'trimp_e', 'pct_fcr', 'trimp_b', 'epoc_ind', 'srpe']],
    ['Batimentos e gasto calórico', ['batimentos', 'bpr', 'kcal_laszlo', 'kcal_prop', 'kcal_farrar', 'kcal_fusi_s', 'kcal_fusi_c', 'kcalref']],
    ['Referências e indisponíveis', ['epoc', 'vo2max', 'hrv']]
  ];
  const css2 = `
  .rfp{--bg:#101318;--card:#181d25;--bd:#2a3240;--tx:#f4f6fa;--mu:#a9b3c2;--am:#ffcc00;color:var(--tx);font:16px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif}
  .rfp-cab{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px;margin-bottom:10px}
  .rfp-cab h2{margin:0;font:800 1.6rem/1.15 system-ui,sans-serif;color:var(--am)} .rfp-cab span{color:var(--mu);font-size:.95rem}
  .rfp-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin:8px 0 14px}
  .rfp-kpi{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:12px 14px;min-width:0}
  .rfp-kpi .t{font:700 .74rem system-ui;letter-spacing:.06em;text-transform:uppercase;color:var(--mu)}
  .rfp-kpi .v{font:800 2.1rem/1.1 system-ui;margin-top:4px;font-variant-numeric:tabular-nums} .rfp-kpi .u{font:600 .95rem system-ui;color:var(--mu);margin-left:3px}
  .rfp-kpi .s{font-size:.8rem;color:var(--mu);margin-top:2px}
  .rfp-kpi.dest{border-color:var(--am);background:#221d08}
  .rfp-kpi.off .v{font-size:1.05rem;color:var(--mu);font-weight:600}
  .rfp-graf{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:10px 12px;margin-bottom:14px}
  .rfp-graf h3,.rfp-gr h3{margin:0 0 6px;font:800 1rem system-ui;letter-spacing:.02em}
  .rf-gw{position:relative;cursor:crosshair;max-width:1040px;margin:0 auto} .rf-gw .rf-chart{height:auto;aspect-ratio:520/170;margin-top:0}   /* proporção fixa: o texto do gráfico não estica */ .rf-cur{position:absolute;top:6px;bottom:6px;width:2px;background:var(--am);box-shadow:0 0 6px var(--am);pointer-events:none}
  .rf-rp{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:10px}
  .rf-rpb{appearance:none;border:0;border-radius:10px;padding:10px 16px;font:700 .95rem system-ui;background:var(--am);color:#000;cursor:pointer}
  .rf-rpv{display:flex;align-items:center;gap:6px;font-size:.9rem;color:var(--mu)} .rf-rpv select{background:#0b0e13;color:#fff;border:1px solid var(--bd);border-radius:8px;padding:6px}
  .rf-rpd{display:flex;gap:22px;margin-left:auto} .rf-rpd span{display:flex;flex-direction:column;align-items:center} .rf-rpd b{font:800 1.8rem/1 system-ui;font-variant-numeric:tabular-nums} .rf-rpd small{color:var(--mu);font-size:.75rem}
  .rf-rpf{color:#ff6b86} .rf-rpr.pulo{animation:rf-pulo .35s ease} @keyframes rf-pulo{0%{transform:scale(1.35);color:var(--am)}100%{transform:scale(1)}}
  .rfp-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px;align-items:start}
  .rfp-gr{background:var(--card);border:1px solid var(--bd);border-radius:14px;padding:12px 14px}
  .rfp-gr .rf-cards{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));margin-top:4px}
  .rfp .rf-card{background:#0f1319;border-color:var(--bd)} .rfp .rf-card .t{color:var(--mu);font-size:.82rem} .rfp .rf-card .v{font-size:1.5rem}
  .rfp-kcal{width:100%;border-collapse:collapse;font-size:.95rem} .rfp-kcal td{padding:6px 4px;border-bottom:1px solid var(--bd)} .rfp-kcal td:last-child{text-align:right;font-weight:800;font-variant-numeric:tabular-nums;white-space:nowrap}
  .rfp-mais{appearance:none;border:2px solid var(--am);background:none;color:var(--am);border-radius:12px;padding:12px 18px;font:800 1rem system-ui;cursor:pointer;margin-top:14px;width:100%}
  .rfp-mais:hover{background:#221d08}
  .rfp .rfp-comp{display:none} .rfp.completo .rfp-comp{display:block} .rfp.completo .rfp-res{display:none}
  .rfp-dados{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px;margin-top:4px}
  .rfp-dados div{background:#0f1319;border:1px solid var(--bd);border-radius:10px;padding:8px 10px} .rfp-dados b{display:block;font-size:1.1rem} .rfp-dados small{color:var(--mu);font-size:.78rem} .rfp-dados .off b{color:var(--mu);font-weight:600;font-size:.95rem}
  .rfp-tgl{display:flex;align-items:center;gap:8px;font-size:.9rem;color:var(--mu);margin:6px 0 10px}
  .rfp-nota{font-size:.8rem;color:var(--mu);margin-top:12px;border-top:1px solid var(--bd);padding-top:10px}
  @media (min-width:1100px){ .rfp-grid{grid-template-columns:repeat(3,minmax(0,1fr))} .rfp-res .rfp-grid{grid-template-columns:1.25fr 1fr 1fr} }
  `;
  const st2 = document.createElement('style'); st2.textContent = css2; document.head.appendChild(st2);
  const card = (c, ess) => '<div class="rf-card' + (c.fmt === 'zonas' || c.nivel === 'D' || c.nivel === 'E' ? ' wide' : '') + '"><div class="t">' + esc(c.titulo) + (c.semFonte ? '<span class="kb-sf" title="Área experimental">i</span>' : '') + '</div><button class="i" type="button" aria-label="Fonte e explicação">i</button>' + valor(c) +
      '<span class="rf-sel rf-' + c.nivel + '">' + NIVEL[c.nivel] + '</span>' + (ess.includes(c.id) ? '<span class="rf-ess" title="Métrica pedida pela organização do campeonato">ESSENCIAL</span>' : '') + '<div class="n"><strong>Fonte:</strong> ' + esc(c.ref) + '<br>' + esc(c.nota) +
      (c.metodos ? '<br><strong>Métodos:</strong> ' + c.metodos.map((m) => esc(m.nome) + ': ' + m.kcal + ' kcal').join('; ') : '') + (c.removido ? '<br><strong>Método retirado:</strong> ' + esc(c.removido) : '') + (c.semFonte ? '<br><strong style="color:#b47cff">Área experimental:</strong> ' + esc(c.semFonte) : '') + '</div></div>';
  function kpi(c, rot, dest) {
    if (!c) return '';
    if (c.nivel === 'E' || c.valor === null || c.valor === undefined || c.insuficiente) return '<div class="rfp-kpi off"><div class="t">' + esc(rot) + '</div><div class="v">' + esc(c.insuficiente ? 'Dados insuficientes' : (c.motivo ? 'Não disponível' : '--')) + '</div>' + (c.motivo ? '<div class="s">' + esc(c.motivo).slice(0, 110) + '</div>' : '') + '</div>';
    let v = c.valor, u = c.unidade || '';
    if (c.fmt === 'tempo') { const s = Math.round(v); v = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); u = 'min'; }
    else if (Array.isArray(v)) v = v[0] + (v[1] !== v[0] ? '–' + v[1] : '');
    else v = String(v).replace('.', ',');
    return '<div class="rfp-kpi' + (dest ? ' dest' : '') + '"><div class="t">' + esc(rot) + '</div><div class="v">' + esc(v) + '<span class="u">' + esc(u) + '</span></div><div class="s">' + NIVEL[c.nivel].toLowerCase() + '</div></div>';
  }
  function replay(s) {
    if (!(s.amostras || []).some((a) => Number.isFinite(a[1]))) return '';
    return '<div class="rf-rp"><button type="button" class="rf-rpb">▶ Replay da prova</button><label class="rf-rpv">Velocidade <select class="rf-rpvs"><option value="1">1×</option><option value="5" selected>5×</option><option value="20">20×</option></select></label>' +
      '<div class="rf-rpd"><span><b class="rf-rpt">0:00</b><small>tempo</small></span><span><b class="rf-rpf">--</b><small>bpm</small></span><span><b class="rf-rpr">0</b><small>repetições</small></span></div></div>';
  }
  function painel(sessao, perfil, opts) {
    opts = opts || {};
    const s = Object.assign({}, sessao, { amostras: (sessao.amostras || []).map((a) => [a[0], a[1] === null ? NaN : a[1]]) });
    const res = KBMetricas.calcula(s, Object.assign({}, perfil || {}, { pse: sessao.pse }));
    const ess = res.essenciais || [], por = new Map(res.cards.map((c) => [c.id, c]));
    const visivel = (c) => c && (opts.estimativas || c.nivel !== 'C' || ess.includes(c.id));
    const d = new Date(sessao.inicio);
    const cab = '<div class="rfp-cab"><h2' + (sessao.simulado ? ' class="kb-mock"' : '') + '>' + esc(sessao.atleta || 'Sem nome') + (sessao.simulado ? '<span class="kb-mock-tag">MOCK</span>' : '') + '</h2><span>' + d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + (sessao.movimento ? ' · ' + esc(sessao.movimento) : '') + (sessao.pista ? ' · Plataforma ' + esc(sessao.pista) : '') + ' · ' + (sessao.score || 0) + ' repetições</span></div>' +
      (sessao.simulado ? '<div class="rf-warn" style="color:#ff8c00">Sessão simulada (mock): batimentos fictícios, só para teste.</div>' : '') +
      (!res.suficiente ? '<div class="rf-warn">Só ' + Math.round(res.pctValidas * 100) + '% das leituras foram válidas (mínimo 80%). As métricas calculadas não foram geradas.</div>' : '') + (opts.aviso || '');
    const kpis = '<div class="rfp-kpis">' + kpi(por.get('fc_pico'), 'Pico de FC', true) + kpi(por.get('fc_media'), 'FC média') + kpi(por.get('ref'), 'Referência (pico do campeonato)') + kpi(por.get('fc_rep'), 'FC sentado 5 min') + kpi(por.get('t90'), 'Tempo ≥ 90%', true) + kpi(por.get('duracao'), 'Duração') + '</div>';
    const graf = '<div class="rfp-graf"><h3>Frequência cardíaca na prova</h3><div class="rf-gw">' + grafico(s, res) + '<div class="rf-cur" hidden></div></div>' + replay(s) + '</div>';
    const kc = ['kcal_laszlo', 'kcal_prop', 'kcal_farrar', 'kcal_fusi_s', 'kcal_fusi_c'].map((id) => por.get(id)).filter((c) => c && c.valor !== null && c.nivel !== 'E');
    const grupoRes = (tit, corpo) => corpo ? '<section class="rfp-gr"><h3>' + tit + '</h3>' + corpo + '</section>' : '';
    const cardsDe = (ids) => { const l = ids.map((id) => por.get(id)).filter(visivel); return l.length ? '<div class="rf-cards">' + l.map((c) => card(c, ess)).join('') + '</div>' : ''; };
    const resumo = '<div class="rfp-res">' + kpis + graf + '<div class="rfp-grid">' +
      grupoRes('Intensidade', cardsDe(['zonas'])) +
      grupoRes('Carga de treino', cardsDe(['trimp_e', 'trimp_b', 'epoc_ind', 'epoc'])) +
      grupoRes('Gasto calórico (estimativa)', kc.length ? '<table class="rfp-kcal">' + kc.map((c) => '<tr><td>' + esc(c.titulo.replace(/^Calorias, cenário /, '')) + '</td><td>' + (Array.isArray(c.valor) ? c.valor[0] + '–' + c.valor[1] : c.valor) + ' kcal</td></tr>').join('') + '</table><div class="s" style="color:#a9b3c2;font-size:.8rem;margin-top:6px">Cinco cenários de estudos diferentes; nenhum é medida direta.</div>' : '<div class="rf-warn">Sem peso ou idade suficientes para estimar.</div>') +
      '</div><button type="button" class="rfp-mais">+ informações</button></div>';
    const dados = (opts.dados || []).length ? '<section class="rfp-gr" style="margin-top:12px"><h3>Dados usados nos cálculos</h3><div class="rfp-dados">' + opts.dados.map((x) => '<div' + (x.off ? ' class="off"' : '') + '><small>' + esc(x.rot) + '</small><b>' + esc(x.val) + '</b><small>' + esc(x.fonte || '') + '</small></div>').join('') + '</div></section>' : '';
    const tab = res.porMin.length ? '<section class="rfp-gr" style="margin-top:12px"><h3>FC × repetições por minuto</h3><table class="rf-tab"><tr><th>Minuto</th><th>FC média</th><th>Repetições</th></tr>' + res.porMin.map((m) => '<tr><td>' + m.minuto + '</td><td>' + (m.fc || '--') + '</td><td>' + m.reps + '</td></tr>').join('') + '</table></section>' : '';
    const completo = '<div class="rfp-comp"><button type="button" class="rfp-mais rfp-menos" style="margin:0 0 12px">← Voltar ao resumo</button>' + graf.replace('class="rf-gw"', 'class="rf-gw rf-gw2"') +
      '<label class="rfp-tgl"><input type="checkbox" class="rfp-est"' + (opts.estimativas ? ' checked' : '') + '> Mostrar todas as estimativas (calorias, FCmáx pela idade)</label>' +
      '<div class="rfp-grid">' + GRUPOS.map(([t, ids]) => grupoRes(t, cardsDe(ids))).join('') + '</div>' + dados + (opts.extra || '') + tab +
      '<p class="rfp-nota">Versão do método: ' + esc(res.versao) + '. O selo de cada cartão mostra a natureza do resultado (medido, calculado, estimativa, referência da literatura ou indisponível). Valores para acompanhamento de treino; não é dispositivo médico. Sensor óptico de braço, não validado no kettlebell. Toque em "i" para ver a fonte.</p></div>';
    return { html: '<div class="rf rfp' + (opts.completo ? ' completo' : '') + '">' + cab + resumo + completo + '</div>', res };
  }
  function ligaPainel(el, sessao, aoMudarEstimativas) {
    liga(el);
    const p = el.querySelector('.rfp'); if (!p) return;
    p.querySelectorAll('.rfp-mais').forEach((b) => { b.onclick = () => { p.classList.toggle('completo', !b.classList.contains('rfp-menos')); const sc = el.closest('[class$="-ov"]') || el; try { sc.scrollTop = 0; } catch (e) {} }; });
    const est = p.querySelector('.rfp-est'); if (est && aoMudarEstimativas) est.onchange = () => aoMudarEstimativas(est.checked);
    p.querySelectorAll('.rf-gw').forEach((gw) => ligaReplay(gw, gw.parentElement, sessao));
  }
  const timersReplay = new Set();
  function pararReplays() { timersReplay.forEach((t) => clearInterval(t)); timersReplay.clear(); }
  function ligaReplay(gw, box, s) {
    const b = box.querySelector('.rf-rpb'); if (!b) return;
    const pts = (s.amostras || []).filter((a) => Number.isFinite(a[1]) || (a[1] !== null && !isNaN(a[1]))).filter((a) => Number.isFinite(+a[1])); if (pts.length < 2) return;
    const W = 520, pad = 26, t0 = s.inicio, t1 = Math.max(pts[pts.length - 1][0], s.fim || 0);
    const reps = (s.reps || []).slice().sort((x, y) => x - y);
    let t = t0, ultimo = 0, timer = null;
    const cur = gw.querySelector('.rf-cur'), q = (c) => box.querySelector(c);
    const desenha = () => {
      if (!document.body.contains(gw)) { clearInterval(timer); timersReplay.delete(timer); return; }
      cur.hidden = false; cur.style.left = ((pad + ((t - t0) / (t1 - t0 || 1)) * (W - pad - 6)) / W * 100) + '%';
      let fc = null; for (const a of pts) { if (a[0] <= t) fc = a[1]; else break; }
      const n = reps.filter((r) => r <= t).length, seg = Math.max(0, Math.round((t - t0) / 1000));
      q('.rf-rpt').textContent = Math.floor(seg / 60) + ':' + String(seg % 60).padStart(2, '0');
      q('.rf-rpf').textContent = fc == null ? '--' : fc; q('.rf-rpr').textContent = n;
      if (n > ultimo) { const e = q('.rf-rpr'); e.classList.remove('pulo'); void e.offsetWidth; e.classList.add('pulo'); } ultimo = n;
    };
    const para = () => { clearInterval(timer); timersReplay.delete(timer); timer = null; };
    b.onclick = () => {
      if (timer) { para(); b.textContent = '▶ Continuar replay'; return; }
      if (t >= t1) { t = t0; ultimo = 0; }
      b.textContent = '❚❚ Pausar';
      timer = setInterval(() => { t = Math.min(t1, t + 100 * (+q('.rf-rpvs').value || 1)); desenha(); if (t >= t1) { para(); b.textContent = '↺ Ver de novo'; } }, 100); timersReplay.add(timer);
    };
    gw.onclick = (e) => { const r = gw.getBoundingClientRect(); const fx = ((e.clientX - r.left) / r.width * W - pad) / (W - pad - 6); t = t0 + Math.max(0, Math.min(1, fx)) * (t1 - t0); desenha(); };
  }
  window.KBRelFC = { html, liga, NIVEL, painel, ligaPainel, pararReplays };
})();
