/* questionarios.js — Termo de consentimento, questionário pós-prova e avaliação do sistema (SUS) do Contador KB (CONBRAKS)
 * Carregado junto com o sensor cardíaco (h1.js) e pelo item "Avaliação do sistema" do menu.
 * Tudo fica guardado no aparelho; a avaliação SUS também é enviada ao banco quando há rede.
 * Fontes:
 *  - Termo: LGPD (Lei 13.709/2018), art. 5º II, art. 11 I e art. 14; Resolução CNS 466/2012.
 *  - Escala de sensação (−5 a +5) e PSE (0–10) depois da sessão: Nunes et al., 2022 (kettlebell); Foster et al., 2001 (PSE ~30 min depois).
 *  - SUS: Lourenço et al., 2022 (versão brasileira, itens e cálculo do escore).
 * Qualquer erro aqui não afeta o contador.
 */
(function () {
  'use strict';
  if (window.kbQuest) return;

  const VERSAO_TERMO = 'termo-3 (consulta, 17/11/2026)';
  const K_TERMO = 'kb_q_termos_v1', K_SUS = 'kb_q_sus_v1';
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normNome = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
  const toast = (m, k) => { try { if (typeof showToast === 'function') showToast(m, k); } catch (e) {} };
  const uuid = () => { try { if (typeof novoUUID === 'function') return novoUUID(); } catch (e) {} return 'q-' + Date.now() + '-' + Math.random().toString(16).slice(2); };
  const dispositivo = () => { try { return typeof deviceId === 'function' ? deviceId() : null; } catch (e) { return null; } };

  // ---------- estilos (mesma linguagem visual do sensor) ----------
  const css = `
  .q-ov{position:fixed;inset:0;z-index:450;background:rgba(0,0,0,.78);display:none;align-items:flex-start;justify-content:center;overflow:auto;padding:max(16px,env(safe-area-inset-top)) 12px 24px}
  .q-box{position:relative;background:#141414;color:#eee;border:1px solid #333;border-radius:16px;max-width:560px;width:100%;padding:18px 16px 16px;font:15px/1.45 system-ui,sans-serif;box-shadow:0 10px 40px rgba(0,0,0,.6)}
  .q-box h2{margin:0 0 4px;padding-right:100px;font-size:1.2rem;color:#ffcc00} .q-box h3{margin:16px 0 6px;font-size:1rem}
  .q-sub{color:#aaa;font-size:.88rem;margin:0 0 10px}
  .q-st{background:#1d1d1d;border:1px solid #333;border-radius:10px;padding:10px 12px;margin:8px 0}
  .q-ok{border-color:#2f7d4f;background:#12261a} .q-warn{border-color:#8a6d1a;background:#2a220c} .q-err{border-color:#7a2a2a;background:#2a1212}
  .q-rasc{display:inline-block;margin-left:6px;padding:1px 6px;border-radius:6px;background:#3a2a00;color:#ffcc00;font:700 .7rem system-ui;vertical-align:middle}
  .q-btns{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
  .q-btn{appearance:none;border:0;border-radius:10px;padding:10px 14px;font:600 .95rem system-ui,sans-serif;cursor:pointer;background:#ffcc00;color:#000}
  .q-btn.sec{background:#2a2a2a;color:#eee;border:1px solid #444} .q-btn.dan{background:#3a1515;color:#ffb3b3;border:1px solid #6a2a2a}
  .q-btn:disabled{opacity:.45;cursor:default}
  .q-x{position:absolute;top:10px;right:10px;width:36px;height:36px;border-radius:50%;border:1px solid #555;background:#222;color:#eee;font:400 24px/1 system-ui;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0 0 3px;z-index:2}
  .q-box > h2{padding-right:44px}
  .q-tf{display:flex;flex-direction:column;min-height:min(440px,calc(100dvh - 120px));justify-content:center;gap:10px;text-align:center}
  .q-tf h2{padding:0 40px;margin:0} .q-tf .q-pq{font:600 1.25rem/1.35 system-ui,sans-serif;margin:4px 0 6px}
  .q-tf .q-sub{margin:0}
  .q-prog{height:4px;background:#2a2a2a;border-radius:2px;overflow:hidden;margin:0 40px 6px 0} .q-prog i{display:block;height:100%;background:#ffcc00;transition:width .25s}
  .q-ops{display:flex;flex-direction:column;gap:8px;width:100%;max-width:380px;margin:0 auto}
  .q-op{appearance:none;border:1px solid #444;background:#1d1d1d;color:#eee;border-radius:12px;padding:12px 14px;font:600 1rem system-ui,sans-serif;cursor:pointer}
  .q-op[aria-pressed="true"],.q-op:hover{border-color:#ffcc00} .q-op[aria-pressed="true"]{background:#ffcc00;color:#000}
  .q-tf .q-lik{max-width:380px;margin:4px auto 0;width:100%} .q-tf .q-lik button{padding:14px 0;font-size:1.15rem}
  .q-tf .q-anc{max-width:380px;margin:0 auto;width:100%}
  .q-nav{display:flex;justify-content:space-between;gap:8px;margin-top:6px}
  .q-num{color:#aaa;font-size:.82rem}
  .q-ajuda{position:absolute;top:12px;right:56px;appearance:none;border:1px solid #444;background:#222;color:#eee;border-radius:999px;padding:4px 10px;font:600 .8rem system-ui;cursor:pointer}
  .q-in{width:100%;box-sizing:border-box;background:#0d0d0d;color:#eee;border:1px solid #444;border-radius:8px;padding:9px 10px;font:inherit}
  .q-chk{display:flex;gap:8px;align-items:flex-start;margin:8px 0} .q-chk input{margin-top:3px;width:18px;height:18px;flex:none}
  .q-termo{max-height:42vh;overflow:auto;background:#0d0d0d;border:1px solid #333;border-radius:10px;padding:10px 12px;font-size:.9rem}
  .q-termo h4{margin:10px 0 4px;color:#ffcc00;font-size:.92rem} .q-termo p,.q-termo li{margin:4px 0} .q-termo ul{padding-left:20px;margin:4px 0}
  .q-escala{display:grid;grid-template-columns:repeat(11,1fr);gap:4px;margin:6px 0}
  .q-escala button{appearance:none;border:1px solid #444;background:#1d1d1d;color:#eee;border-radius:8px;padding:10px 0;font:700 .95rem system-ui;cursor:pointer;min-width:0}
  .q-escala button[aria-pressed="true"]{background:#ffcc00;color:#000;border-color:#ffcc00}
  .q-anc{display:flex;justify-content:space-between;color:#aaa;font-size:.78rem;gap:8px}
  .q-lik{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:6px 0 2px}
  .q-lik button{appearance:none;border:1px solid #444;background:#1d1d1d;color:#eee;border-radius:8px;padding:10px 0;font:700 1rem system-ui;cursor:pointer}
  .q-lik button[aria-pressed="true"]{background:#ffcc00;color:#000;border-color:#ffcc00}
  .q-item{border-top:1px solid #2a2a2a;padding:10px 0}
  .q-list{display:flex;flex-direction:column;gap:6px} .q-li{display:flex;justify-content:space-between;gap:8px;align-items:center;background:#1d1d1d;border:1px solid #333;border-radius:10px;padding:8px 10px}
  .q-li.sel{border-color:#ffcc00}
  .q-tut ol{padding-left:20px;margin:6px 0} .q-tut li{margin:6px 0}
  .q-pse{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:center}
  .q-pse button{appearance:none;border:1px solid #444;background:#1d1d1d;color:#eee;border-radius:8px;padding:6px 12px;font:700 .95rem system-ui;cursor:pointer}
  .q-pse button[aria-pressed="true"]{background:#ffcc00;color:#000;border-color:#ffcc00}
  .q-pse span{color:#ccc;font-size:.88rem}
  @media print{body>*:not(.q-ov){display:none!important}.q-ov{position:static;background:#fff;display:block!important;padding:0}.q-box{background:#fff;color:#000;border:0;box-shadow:none;max-width:none}.q-box h2,.q-termo h4{color:#000}.q-termo{max-height:none;background:#fff;color:#000;border:0}.q-noprint{display:none!important}}
  `;
  const st = document.createElement('style'); st.id = 'q-css'; st.textContent = css; document.head.appendChild(st);
  const ov = document.createElement('div'); ov.className = 'q-ov'; ov.id = 'q-ov'; document.body.appendChild(ov);
  const $ = (id) => document.getElementById(id);
  let voltar = null;
  function mostra(html, ajuda) {
    ov.innerHTML = '<div class="q-box" role="dialog" aria-modal="true"><button class="q-x q-noprint" type="button" id="q-xx" aria-label="Fechar" title="Fechar">×</button>' + (ajuda ? '<button class="q-ajuda q-noprint" type="button" id="q-ajuda">Como usar</button>' : '') + html + '</div>';
    ov.style.display = 'flex'; ov.scrollTop = 0;
    $('q-xx').onclick = () => { voltar = null; fecha(); };
    if (ajuda) $('q-ajuda').onclick = () => tutorial(ajuda, () => ajudaVolta && ajudaVolta());
  }
  let ajudaVolta = null;
  function fecha() { ov.style.display = 'none'; ov.innerHTML = ''; const v = voltar; voltar = null; if (typeof v === 'function') { try { v(); } catch (e) {} } }

  // ---------- lista de atletas do contador (só nomes, já embutidos na página) ----------
  function nomesAtletas() {
    try { const el = document.getElementById('kb-atletas'); const d = JSON.parse(el.textContent); return (d.atletas || []).map((a) => a.nome).filter(Boolean).sort((a, b) => a.localeCompare(b, 'pt-BR')); } catch (e) { return []; }
  }

  // =====================================================================================
  // 1) TERMO DE CONSENTIMENTO
  // =====================================================================================
  const TEXTO_TERMO = `
  <p><strong>Quem participa do campeonato concorda com o registro da frequência cardíaca durante a prova e com o relatório.</strong> Essa concordância está na inscrição no 7º Campeonato Brasileiro de Kettlebell Sport (CONBRAKS 2026). Esta tela é só para consulta: não é preciso registrar nada.</p>
  <h4>Quem trata os dados</h4>
  <p>Organização do campeonato: CONBRAKS e FPEKSPORT. Dúvidas e pedidos: WhatsApp de suporte (81) 99648-4250.</p>
  <h4>O que é registrado</h4>
  <ul><li>A frequência cardíaca (1 valor por segundo), de até 1 minuto antes da 1ª repetição até cerca de 2 minutos depois do fim da prova.</li>
  <li>Os dados da prova que o contador já registra (repetições, movimento, categoria, plataforma, horário).</li>
  <li>Se o atleta quiser, as respostas a duas perguntas depois da prova (como se sente e quanto esforço fez).</li></ul>
  <p>A frequência cardíaca é um dado pessoal sensível (dado referente à saúde, Lei 13.709/2018, art. 5º, II).</p>
  <h4>Para que serve</h4>
  <p>Gerar o relatório da prova para o atleta, com a fonte de cada cálculo, e apoiar a organização do campeonato. <strong>Os dados não são usados em estudo científico</strong>: isso exigiria uma nova autorização do atleta e a aprovação de um comitê de ética.</p>
  <h4>Onde os dados ficam e quem acessa</h4>
  <p>No aparelho do contador e no banco de dados do campeonato (Supabase). Acessam: o próprio atleta, pela área do atleta, e a organização.</p>
  <h4>Riscos e cuidados</h4>
  <p>Desconforto da braçadeira; exposição de um dado de saúde em caso de acesso indevido; identificação indireta pelos resultados públicos. O sensor não é aparelho médico e as métricas não servem para diagnóstico. Se sentir qualquer incômodo, peça para retirar o sensor; recusar o sensor não muda nada na prova.</p>
  <h4>Direitos</h4>
  <p>O atleta pode pedir acesso, correção ou exclusão dos seus dados (Lei 13.709/2018, art. 18) pelo WhatsApp de suporte.</p>
  <h4>Menores de 18 anos</h4>
  <p>Valem a autorização e a inscrição feitas pelo responsável legal.</p>`;

  // Autorização operacional: pela inscrição (decisão da organização, 17/11). Estudo: só pelo termo, escolha separada.
  function inscrito(nome) { const k = normNome(nome); return !!k && nomesAtletas().some((n) => normNome(n) === k); }
  function consentimentoDe(nome) {   // decisão de 17/11: a inscrição autoriza gravação e relatório; nada vai para estudo
    return inscrito(nome) ? { origem: 'inscricao', gravacao: true, estudo: false, versao: 'inscrição no campeonato' } : { origem: 'nao_identificado', gravacao: false, estudo: false, versao: null };
  }


  function termo(opts) {
    opts = opts || {}; voltar = opts.voltar || null; ajudaVolta = () => termo(opts);
    const nomes = nomesAtletas();
    mostra('<h2>Termo de participação</h2><p class="q-sub">Consulta. Versão: ' + esc(VERSAO_TERMO) + '.</p>' +
      '<div class="q-termo" id="q-txt" style="max-height:none">' + TEXTO_TERMO + '</div>' +
      '<div class="q-noprint"><h3>Conferir um atleta</h3><input class="q-in" id="q-at" list="q-dl-at" autocomplete="off" value="' + esc(opts.atleta || '') + '" placeholder="Nome do atleta"><datalist id="q-dl-at">' + nomes.map((n) => '<option value="' + esc(n) + '">').join('') + '</datalist>' +
      '<div class="q-st" id="q-insc"></div>' +
      '<div class="q-btns"><button class="q-btn sec" type="button" id="q-imp">Imprimir</button><button class="q-btn" type="button" id="q-vt">Voltar</button></div></div>', 'termo');
    const insc = () => { const n = $('q-at').value.trim(); $('q-insc').textContent = !n ? 'Escreva o nome para conferir se está na lista de inscritos.' : (inscrito(n) ? 'Inscrito no campeonato: a gravação e o relatório estão autorizados.' : 'Nome não encontrado na lista de inscritos: confira a grafia. Sem inscrição, a FC fica só neste aparelho e não vai ao banco.'); };
    $('q-at').oninput = insc; insc();
    $('q-imp').onclick = () => { try { window.print(); } catch (e) {} };
    $('q-vt').onclick = fecha;
  }

  // =====================================================================================
  // 2) QUESTIONÁRIO PÓS-PROVA (escala de sensação + esforço percebido)
  // =====================================================================================
  const PSE_ANC = { 0: 'Repouso', 1: 'Muito, muito fácil', 2: 'Fácil', 3: 'Moderado', 4: 'Um pouco difícil', 5: 'Difícil', 6: '', 7: 'Muito difícil', 8: '', 9: '', 10: 'Máximo' };

  function posProva(opts) {
    opts = opts || {}; voltar = opts.voltar || null; ajudaVolta = () => posProva(opts);
    const api = window.kbH1;
    const L = api && api.listaSessoes ? api.listaSessoes() : [];
    if (!L.length) { mostra('<h2>Questionário pós-prova</h2><div class="q-st">Nenhuma prova gravada com o sensor neste aparelho.</div><div class="q-btns"><button class="q-btn sec" type="button" id="q-vt">Voltar</button></div>', 'pos'); $('q-vt').onclick = fecha; return; }
    const sel = L.find((s) => s.id === opts.sessaoId) || L[0];
    const q0 = sel.questionario || {};
    let fs = null, pse = null;   // só o que for marcado agora; o que já foi respondido fica guardado
    const fimRef = (s0) => { const ev = (s0.contexto && s0.contexto.eventos) || {}; const u = Number.isFinite(s0.ultima_contagem) ? s0.ultima_contagem : (Number.isFinite(ev.ultima_contagem) ? ev.ultima_contagem : null); return u !== null && (!s0.fim || u <= s0.fim) ? { t: u, ref: 'ultima_contagem' } : { t: s0.fim, ref: 'finalizar' }; };
    const fr0 = fimRef(sel), agora0 = Date.now(), seg = fr0.t ? Math.max(0, Math.round((agora0 - fr0.t) / 1000)) : null, min = seg !== null ? Math.floor(seg / 60) : null;
    const opcoes = L.slice(0, 20).map((s) => '<option value="' + esc(s.id) + '"' + (s.id === sel.id ? ' selected' : '') + '>' + esc((s.atleta || 'Sem nome') + ' · ' + new Date(s.inicio).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + (s.movimento ? ' · ' + s.movimento : '') + (s.questionario ? ' · já respondido' : '')) + '</option>').join('');
    const ja = (v) => (Number.isFinite(v) ? ' <small>(já respondido: ' + (v > 0 && v <= 5 && v === q0.fs ? '+' + v : v) + ')</small>' : '');
    const avisoFs = seg !== null && seg < 300 ? '<div class="q-st q-warn">Sensação: os estudos perguntaram a partir de 5 min depois do fim (Nunes et al., 2022).</div>' : '';
    const avisoPse = seg !== null && seg < 1500 ? '<div class="q-st q-warn">Esforço da prova: o ideal é perguntar perto de 30 min depois do fim (Foster et al., 2001). Se der, deixe esta pergunta para mais tarde.</div>' : '';
    mostra('<h2>Questionário pós-prova</h2><p class="q-sub">Opcional. O atleta responde sozinho, sem ver a frequência cardíaca. Pode responder uma pergunta agora e a outra depois.</p>' +
      '<label>Prova<select class="q-in" id="q-ses">' + opcoes + '</select></label>' +
      (min !== null ? '<div class="q-st">Fim da prova (Finalizar) há ' + min + ' min.</div>' : '') +
      '<h3>1. Como você está se sentindo agora?' + ja(q0.fs) + '</h3>' + avisoFs + '<div class="q-escala" id="q-fs">' + [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((v) => '<button type="button" data-v="' + v + '" aria-pressed="false">' + (v > 0 ? '+' + v : v) + '</button>').join('') + '</div>' +
      '<div class="q-anc"><span>−5 muito ruim</span><span>+5 muito bom</span></div>' +
      '<h3>2. Como foi a sua prova? (esforço de 0 a 10)' + ja(q0.pse) + '</h3>' + avisoPse + '<div class="q-pse" id="q-ps">' + Object.keys(PSE_ANC).map((k) => '<button type="button" data-v="' + k + '" aria-pressed="false">' + k + '</button><span>' + esc(PSE_ANC[k]) + '</span>').join('') + '</div>' +
      '<div id="q-msg"></div><div class="q-btns"><button class="q-btn" type="button" id="q-sal">Salvar respostas</button><button class="q-btn sec" type="button" id="q-vt">Voltar</button></div>' +
      '<p class="q-sub" style="margin-top:10px">Escala de sensação de −5 a +5 (Nunes et al., 2022, que cita a versão em português da escala; texto da pergunta traduzido pelo site) e esforço de 0 a 10 com as âncoras de Foster et al. (2001), traduzidas pelo site. Os avisos de 5 e 25 min são escolha do projeto, não critério de validade. O esforço entra na carga sRPE com a duração da série analisada (adaptação).</p>', 'pos');
    $('q-ses').onchange = (e) => posProva(Object.assign({}, opts, { sessaoId: e.target.value }));
    ov.querySelectorAll('#q-fs button').forEach((b) => { b.onclick = () => { fs = +b.dataset.v; ov.querySelectorAll('#q-fs button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }; });
    ov.querySelectorAll('#q-ps button').forEach((b) => { b.onclick = () => { pse = +b.dataset.v; ov.querySelectorAll('#q-ps button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }; });
    $('q-vt').onclick = fecha;
    $('q-sal').onclick = () => {
      if (fs === null && pse === null) { $('q-msg').innerHTML = '<div class="q-st q-err">Marque pelo menos uma das duas respostas.</div>'; return; }
      const fr = fimRef(sel), agora = Date.now(), atraso = fr.t ? Math.round((agora - fr.t) / 1000) : null, em = new Date(agora).toISOString();
      const hist = (q0.historico || []).slice();
      if (fs !== null && Number.isFinite(q0.fs)) hist.push({ item: 'fs', valor: q0.fs, em: q0.fs_em, atraso_s: q0.fs_atraso_s });
      if (pse !== null && Number.isFinite(q0.pse)) hist.push({ item: 'pse', valor: q0.pse, em: q0.pse_em, atraso_s: q0.pse_atraso_s });
      const q = Object.assign({}, q0, { versao: 'quest-pos-3', fim_ref: fr.ref, historico: hist });
      if (fs !== null) Object.assign(q, { fs, fs_em: em, fs_atraso_s: atraso });
      if (pse !== null) Object.assign(q, { pse, pse_em: em, pse_atraso_s: atraso });
      q.respondido_em = em; q.min_apos_fim = atraso !== null ? Math.round(atraso / 60) : null;   // compatibilidade com a 1.7
      if (api && api.salvaQuestionario && api.salvaQuestionario(sel.id, q)) { toast('Respostas salvas', 'ok'); fecha(); }
      else $('q-msg').innerHTML = '<div class="q-st q-err">Não foi possível salvar neste aparelho.</div>';
    };
  }

  // =====================================================================================
  // 3) AVALIAÇÃO DO SISTEMA PELOS ÁRBITROS (SUS, versão brasileira)
  // =====================================================================================
  const SUS_ITENS = [
    'Eu acho que gostaria de usar esse sistema frequentemente.',
    'Eu achei esse sistema desnecessariamente complexo.',
    'Eu achei esse sistema fácil de usar.',
    'Eu achei que precisaria de ajuda de uma pessoa técnica para ser capaz de usar esse sistema.',
    'Eu achei que as várias funções desse sistema foram bem integradas.',
    'Eu acho que o sistema apresenta muita inconsistência.',
    'Eu imagino que a maioria das pessoas pode aprender a usar esse sistema rapidamente.',
    'Eu achei esse sistema muito pesado para usar.',
    'Eu me senti muito seguro usando o sistema.',
    'Eu precisei aprender muitas coisas antes que pudesse utilizar esse sistema.'
  ];
  // escore: ímpares (1,3,5,7,9) = nota − 1; pares (2,4,6,8,10) = 5 − nota; soma × 2,5 (Lourenço et al., 2022)
  function escoreSUS(r) {
    if (!Array.isArray(r) || r.length !== 10 || r.some((v) => !(v >= 1 && v <= 5))) return null;
    return r.reduce((s, v, i) => s + (i % 2 === 0 ? v - 1 : 5 - v), 0) * 2.5;
  }

  // 18/11: estilo "uma pergunta por tela", sem rolagem. Só para árbitros, anônima. Sem exportar respostas.
  function sus(opts) {
    opts = opts || {}; voltar = null;
    const sai = () => { if (typeof opts.voltar === 'function') { ov.style.display = 'none'; ov.innerHTML = ''; opts.voltar(); } else fecha(); };
    ajudaVolta = () => sus(opts);
    const R = { primeira_vez: null, exposicao: null, com_sensor: null, resp: new Array(10).fill(null) };
    // telas: 0 intro · 1 é árbitro? · 2 aviso · 3 primeira vez · 4 provas · 5 sensor · 6..15 itens SUS
    const TOTAL = 13;
    const tela = (n) => {
      const prog = (k) => '<div class="q-prog" aria-hidden="true"><i style="width:' + Math.round(100 * k / TOTAL) + '%"></i></div>';
      const nav = (volta, rot) => '<div class="q-nav"><button class="q-btn sec" type="button" id="q-vt">' + (rot || 'Voltar') + '</button></div>';
      const ops = (lista, atual) => '<div class="q-ops">' + lista.map((o) => '<button type="button" class="q-op" data-v="' + esc(o[0]) + '" aria-pressed="' + (atual === o[0]) + '">' + esc(o[1]) + '</button>').join('') + '</div>';
      const liga = (fn) => ov.querySelectorAll('.q-op').forEach((b) => { b.onclick = () => { ov.querySelectorAll('.q-op').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); setTimeout(() => fn(b.dataset.v), 180); }; });
      if (n === 0) {
        mostra('<div class="q-tf"><h2>Avaliação do sistema</h2><p class="q-pq">Como foi usar o contador do campeonato?</p><p class="q-sub">Inclui o sensor cardíaco, se você usou. São 13 perguntas rápidas, uma por tela (cerca de 2 minutos).</p><div class="q-ops"><button class="q-btn" type="button" id="q-ok">Começar</button></div>' + nav(null) + '</div>', 'sus');
        $('q-ok').onclick = () => tela(1); $('q-vt').onclick = sai; return;
      }
      if (n === 1) {
        mostra('<div class="q-tf"><p class="q-pq">Você é árbitro neste campeonato?</p>' + ops([['sim', 'Sim, sou árbitro'], ['nao', 'Não']], null) + nav() + '</div>');
        liga((v) => tela(v === 'sim' ? 2 : -1)); $('q-vt').onclick = () => tela(0); return;
      }
      if (n === -1) {
        mostra('<div class="q-tf"><h2>Obrigado!</h2><p class="q-pq">Esta avaliação é só para os árbitros.</p><div class="q-ops"><button class="q-btn" type="button" id="q-ok">Fechar</button></div>' + nav() + '</div>');
        $('q-ok').onclick = sai; $('q-vt').onclick = () => tela(1); return;
      }
      if (n === 2) {
        mostra('<div class="q-tf"><h2>Antes de começar</h2><p class="q-pq">A avaliação é <strong>anônima</strong>: seu nome não é pedido.</p><p class="q-sub">Responda com sinceridade, pela primeira impressão. Não existe resposta certa.</p><div class="q-ops"><button class="q-btn" type="button" id="q-ok">Continuar</button></div>' + nav() + '</div>');
        $('q-ok').onclick = () => tela(3); $('q-vt').onclick = () => tela(1); return;
      }
      if (n === 3) {
        mostra('<div class="q-tf">' + prog(1) + '<div class="q-num">1 de ' + TOTAL + '</div><p class="q-pq">É a primeira vez que você responde esta avaliação no campeonato?</p>' + ops([['sim', 'Sim'], ['nao', 'Não, já respondi']], R.primeira_vez === null ? null : (R.primeira_vez ? 'sim' : 'nao')) + nav() + '</div>');
        liga((v) => { R.primeira_vez = v === 'sim'; tela(4); }); $('q-vt').onclick = () => tela(2); return;
      }
      if (n === 4) {
        mostra('<div class="q-tf">' + prog(2) + '<div class="q-num">2 de ' + TOTAL + '</div><p class="q-pq">Quantas provas você acompanhou com o contador até agora?</p>' + ops([['0', 'Nenhuma'], ['1-5', '1 a 5'], ['6+', '6 ou mais']], R.exposicao) + nav() + '</div>');
        liga((v) => { R.exposicao = v; tela(5); }); $('q-vt').onclick = () => tela(3); return;
      }
      if (n === 5) {
        mostra('<div class="q-tf">' + prog(3) + '<div class="q-num">3 de ' + TOTAL + '</div><p class="q-pq">Pelo menos uma dessas provas foi com o sensor cardíaco?</p>' + ops([['sim', 'Sim'], ['nao', 'Não']], R.com_sensor === null ? null : (R.com_sensor ? 'sim' : 'nao')) + nav() + '</div>');
        liga((v) => { R.com_sensor = v === 'sim'; tela(6); }); $('q-vt').onclick = () => tela(4); return;
      }
      if (n >= 6 && n <= 15) {
        const i = n - 6, k = i + 4;
        mostra('<div class="q-tf">' + prog(k) + '<div class="q-num">' + k + ' de ' + TOTAL + '</div><p class="q-pq">' + esc(SUS_ITENS[i]) + '</p>' +
          '<div class="q-lik" data-i="' + i + '">' + [1, 2, 3, 4, 5].map((v) => '<button type="button" data-v="' + v + '" aria-pressed="' + (R.resp[i] === v) + '">' + v + '</button>').join('') + '</div>' +
          '<div class="q-anc"><span>1 = discordo fortemente</span><span>5 = concordo fortemente</span></div>' + nav() + '</div>');
        ov.querySelectorAll('.q-lik button').forEach((b) => { b.onclick = () => { R.resp[i] = +b.dataset.v; ov.querySelectorAll('.q-lik button').forEach((x) => x.setAttribute('aria-pressed', String(x === b))); setTimeout(() => (i < 9 ? tela(n + 1) : envia()), 200); }; });
        $('q-vt').onclick = () => tela(n - 1); return;
      }
    };
    const envia = () => {
      const agora = new Date();
      const r = { id: uuid(), em: agora.toISOString(), funcao: 'arbitro', primeira_vez: R.primeira_vez, exposicao: R.exposicao, com_sensor: !!R.com_sensor, respostas: R.resp.slice(), escore: escoreSUS(R.resp), dispositivo: dispositivo(), versao: 'sus-ptbr-3', enviado: false };
      const L = lsGet(K_SUS, []); L.push(r); lsSet(K_SUS, L); enviaSUS();
      mostra('<div class="q-tf"><h2>Obrigado!</h2><p class="q-pq">Avaliação registrada.</p><div class="q-ops"><button class="q-btn" type="button" id="q-ok">Concluir</button><button class="q-btn sec" type="button" id="q-nova">Nova avaliação (outro árbitro)</button></div></div>');
      $('q-ok').onclick = sai; $('q-nova').onclick = () => sus(opts);
    };
    tela(0);
  }
  let enviandoSUS = false;
  async function enviaSUS() {
    if (enviandoSUS || !navigator.onLine) return;
    let nuvem = null; try { nuvem = NUVEM; } catch (e) { return; }
    if (!nuvem || !nuvem.url || !nuvem.key) return;
    const L = lsGet(K_SUS, []); if (!L.some((r) => !r.enviado)) return;
    enviandoSUS = true; const ok = [];
    try {
      for (const r of L) {
        if (r.enviado) continue;
        try {
          const x = await fetch(nuvem.url + '/rest/v1/rpc/sus_registrar', { method: 'POST', headers: { apikey: nuvem.key, 'Content-Type': 'application/json' },
            body: JSON.stringify({ r: { id: r.id, em: r.em, funcao: r.funcao, primeira_vez: r.primeira_vez, exposicao: r.exposicao, com_sensor: r.com_sensor, respostas: r.respostas, dispositivo: r.dispositivo, versao: r.versao } }) });
          if (x.ok) ok.push(r.id);
        } catch (e) {}
      }
      const L2 = lsGet(K_SUS, []); L2.forEach((r) => { if (ok.includes(r.id)) r.enviado = true; }); lsSet(K_SUS, L2);   // relê: não perde respostas salvas durante o envio
    } finally { enviandoSUS = false; }
  }
  setInterval(enviaSUS, 60000); window.addEventListener('online', enviaSUS); setTimeout(enviaSUS, 5000);

  // =====================================================================================
  // 4) TUTORIAIS
  // =====================================================================================
  const TUT = {
    termo: ['Termo de participação: como usar', [
      'É só consulta. Quem participa do campeonato concorda, pela inscrição, com a gravação da FC e com o relatório. Não é preciso registrar nada.',
      'Se o atleta perguntar, abra <strong>Sensor cardíaco</strong> → <strong>Termo</strong> (canto de cima) e mostre o texto, ou imprima.',
      'Para conferir se o nome está na lista de inscritos, escreva o nome. Sem inscrição, a FC fica só no aparelho e não vai ao banco.',
      'Os dados não são usados em estudo científico. Isso exigiria nova autorização do atleta e aprovação de um comitê de ética.',
      'Se o atleta não quiser usar o sensor, basta não colocar: nada muda na prova.'
    ], 'Pedidos de acesso, correção ou exclusão dos dados: WhatsApp de suporte da organização.'],
    pos: ['Questionário pós-prova: como usar', [
      'É opcional: se não der tempo, não tem problema.',
      'Depois da prova, abra <strong>Sensor cardíaco</strong> → <strong>Questionário pós-prova</strong>, ou abra o relatório da prova e toque em <strong>Questionário pós-prova</strong>. É a única forma de registrar o esforço.',
      'Confira se a prova escolhida é a do atleta que vai responder.',
      'Mostre a tela ao atleta, que responde sozinho e sem ver a frequência cardíaca: como está se sentindo (−5 a +5) e quanto esforço fez na prova (0 a 10).',
      'Momento: a sensação, a partir de 5 minutos depois do fim; o esforço da prova, perto de 30 minutos depois. Dá para responder uma agora e a outra depois. O aparelho anota quantos segundos se passaram em cada resposta.',
      'Toque em <strong>Salvar respostas</strong>. O esforço entra no relatório como carga sRPE (esforço × minutos).'
    ], 'As respostas ficam neste aparelho e vão ao banco junto com a prova.'],
    sus: ['Avaliação do sistema (SUS): como usar', [
      'Quem responde: árbitros, mesários e organização que usaram o contador.',
      'Quando: <strong>uma vez por pessoa no campeonato</strong>, de preferência no último dia em que ela trabalhar com o contador.',
      'Abra o menu do contador e toque em <strong>Avaliação do sistema</strong>.',
      'Escolha a função, diga se é a primeira vez que responde e quantas provas acompanhou. Só as respostas de primeira vez entram na análise.',
      'Para cada uma das 10 frases, toque de 1 (discordo fortemente) a 5 (concordo fortemente). Responda pela primeira impressão.',
      'Toque em <strong>Enviar avaliação</strong>. Não pede nome. Para a próxima pessoa, toque em <strong>Nova avaliação</strong>.',
      'A organização baixa todas as respostas deste aparelho em <strong>Exportar respostas</strong>. Com internet, elas também vão ao banco.'
    ], 'Escala SUS, versão brasileira de Lourenço et al. (2022). O escore vai de 0 a 100 e não é mostrado a quem responde.']
  };
  function tutorial(tipo, depois) {
    const t = TUT[tipo]; if (!t) return;
    const v0 = voltar;
    mostra('<h2>' + esc(t[0]) + '</h2><div class="q-tut"><ol>' + t[1].map((x) => '<li>' + x + '</li>').join('') + '</ol></div><div class="q-st">' + esc(t[2]) + '</div><div class="q-btns"><button class="q-btn" type="button" id="q-ok">Entendi</button></div>');
    $('q-ok').onclick = () => { voltar = v0; if (typeof depois === 'function') depois(); else fecha(); };
  }

  window.kbQuest = { termo, consentimentoDe, posProva, sus, tutorial, escoreSUS, VERSAO_TERMO, _SUS_ITENS: SUS_ITENS };
})();
