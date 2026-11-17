/* relatorio-fc.js — desenha o relatório de uma sessão de FC (curva, cards com nível e fonte, tabela por minuto).
 * Usado pela área da organização (atletas-org.js) e pela área do atleta (atleta.html). Depende de metricas.js.
 * KBRelFC.html(sessao, perfil, {estimativas}) → string · KBRelFC.liga(elemento) liga os botões "i".
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
  window.KBRelFC = { html, liga, NIVEL };
})();
