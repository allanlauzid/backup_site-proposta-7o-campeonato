/* metricas.js — Métricas de frequência cardíaca do Contador KB (CONBRAKS)
 * Cada métrica sai com: valor, natureza do resultado e fonte.
 * Natureza do resultado (não é escala de precisão): A Medido · B Calculado · C Estimativa · D Referência da literatura · E Indisponível
 * Separado disso: cobertura dos dados e área (fundamentada ou experimental, marcada por semFonte).
 * Versão do método: guardada junto com cada relatório (VERSAO).
 * Nada aqui é diagnóstico: valores para acompanhamento de treino.
 */
(function (global) {
  'use strict';
  const VERSAO = 'metricas-1.9.0 (17/11/2026)';
  const MIN_VALIDAS = 0.80;      // regra do site: abaixo disso, B e C ficam "dados insuficientes"
  const POS_PROVA_S = 125;       // segundos gravados depois do fim (recuperação: janela de 120 s vai até 123 s)
  const MIN_LEIT_JANELA = 3;     // regra operacional: leituras válidas mínimas em cada janela de ±3 s da recuperação
  const PRE_PROVA_S = 60;        // segundos guardados antes da 1ª contagem (fase "antes"; fora das métricas da série)

  // ---------- fontes (texto curto do "ⓘ") ----------
  const F = {
    hrs: { ref: 'Bluetooth SIG — Heart Rate Service; Moghaddam et al., 2026; Dawson et al. (resumo ACSM)', nota: 'Valor enviado pelo sensor. Sensor óptico: o erro aumenta com o movimento (Bent et al., 2020, citado por Jeong et al.). Entre as posições testadas, braço e antebraço foram as mais precisas, mas em exercício de corpo inteiro e intenso (burpees) a concordância com a cinta caiu muito (CCC < 0,50; Moghaddam 2026). Sensor de braço foi válido para FC média e máxima em levantamento terra (Dawson). Não validado no kettlebell.' },
    buchheit: { ref: 'Hart, 2015 (J Chiropr Med 14:162); Gonzales et al., 2023 (PLoS One); Buchheit, 2014 (Front Physiol 5:73); Serafim, 2023 (dissertação, UniEVANGÉLICA)', nota: 'Protocolo do site: 5 min sentado e quieto, valor = média do último minuto. A FC de repouso só se estabiliza a partir de 5 min sentado: medida com 1 min, ela ainda sobe ~3 bpm até os 5 min (+1,9 bpm de 1 a 3 min e +1,5 bpm de 3 a 5 min; Hart 2015). Média de 11 mil adultos: sentado 67, deitado 64 e dormindo 57 bpm (Gonzales 2023), por isso compare só medidas na mesma posição. Erro típico de um dia para outro ~10% (Buchheit 2014): use para acompanhar tendência.' },
    martin: { ref: 'Foster et al., 2001; Chan et al., 2020 (J Strength Cond Res); Uth et al., 2004; Martin et al., 2025; Tanaka, Monahan & Seals, 2001', nota: 'Referência das zonas: FC máxima de teste, quando informada; senão, a maior FC média de 5 s registrada no campeonato, que é âncora descritiva e não FC máxima confirmada. As faixas de Edwards usam % do pico de FC de um teste máximo (Foster 2001). No snatch de Girevoy Sport em teste progressivo até a exaustão, o pico chegou a 98 ± 3,4% da FC máxima do remo (Chan 2020); uma série de competição não é teste máximo, então a % pode ficar acima da real se o atleta não chegou perto do máximo. Equações pela idade erram ±18–24 bpm por pessoa (Martin 2025).' },
    karvonen: { ref: 'Karvonen, Kentala & Mustala, 1957 — Ann Med Exp Biol Fenn 35:307–315; Serafim, 2023', nota: 'Fórmula da reserva de FC: (FC − FC de repouso) ÷ (FCmáx − FC de repouso) × 100. No estudo original (6 homens de 20–23 anos), a FC de repouso foi contada de manhã, na cama. Aqui entram a FC sentada antes da prova e a referência das zonas, por isso o nome é índice relativo, não % da reserva clássica.' },
    edwards: { ref: 'Edwards, 1993 (citado por Foster et al., 2001 e Bok, Jukić & Foster, 2022); Norton et al., 2010', nota: 'Faixas fixas de % da FCmáx (50–60, 60–70, 70–80, 80–90 e 90–100%). A mesma % da FCmáx ou da FC de reserva não corresponde ao mesmo esforço em pessoas diferentes (Norton 2010), e a FC não acompanha a % do VO₂máx (Billat et al., 2022).' },
    t90: { ref: 'Chan et al., 2020; Fleckenstein et al., 2025; Billat et al., 2022; Farrar et al., 2010; Fusi et al., 2017', nota: 'Não é o tempo no VO₂máx, que só pode ser medido com analisador de gases, nem um substituto validado dele: no snatch de Girevoy Sport a FC chegou a 98% da máxima enquanto o oxigênio ficou em 83% do VO₂máx (Chan 2020). Ou seja, no kettlebell a FC fica acima do oxigênio e este tempo tende a ser maior que o tempo realmente perto do VO₂máx (Fleckenstein 2025 mediu os dois e eles divergiram).' },
    trimpE: { ref: 'Edwards, 1993 (citado por Foster et al., 2001 e Bok, Jukić & Foster, 2022)', nota: 'Minutos em cada faixa × peso de 1 a 5. Compare só sessões da mesma pessoa.' },
    trimpB: { ref: 'Banister, 1991 (citado por Bok, Jukić & Foster, 2022, que traz a fórmula)', nota: 'minutos × x × A × e^(B × x), com x = (FC média − FC sentada) ÷ (referência − FC sentada); A=0,64/B=1,92 (homens), A=0,86/B=1,67 (mulheres). Banister usa FC de repouso; aqui é a FC sentada antes da prova. No karatê kata, o TRIMP de Banister não teve correlação com o sRPE (r = 0,13; Bok 2022). Compare só sessões da mesma pessoa.' },
    srpe: { ref: 'Foster et al., 2001 (J Strength Cond Res 15:109); Zimerer et al. (kettlebell, mulheres); Bok, Jukić & Foster, 2022', nota: 'Esforço percebido (escala 0–10) × minutos da execução (Foster 2001 perguntou ~30 min depois da sessão inteira). Já usado em programa de kettlebell com mulheres (Zimerer). Em sessões curtas e intermitentes o sRPE não teve correlação com os TRIMP pela FC (karatê kata; Bok 2022) e, no swing, esforço percebido e FC iguais aos da corrida vieram com ~26% menos oxigênio (Hulsey 2012): os dois medem lados diferentes da carga.' },
    hrr: { ref: 'Buchheit, 2014', nota: 'Queda da FC nos 60 s após o fim da execução (última contagem): média dos 5 s antes menos a média entre 57 e 63 s depois, com pelo menos 3 leituras em cada janela. Adaptação: o fim é marcado pela última contagem, não por um protocolo de laboratório. Varia ~25% de um dia para outro: olhe a tendência. Os intervalos de 30 e 120 s do arquivo interno são regra operacional do site.' },
    qual: { ref: 'Regra operacional do site (sem validação científica)', nota: 'Cobertura, não acurácia do sensor. Leitura aceita: 30–230 bpm, sem salto > 30 bpm em até 1,5 s. O mesmo valor por mais de 10 s fica só marcado (não é descartado). Por segundo vale a última leitura recebida; o pedaço final incompleto de segundo fica de fora. Lacunas de até 2 s seguidos são preenchidas por interpolação (contadas à parte); lacunas maiores ficam sem valor e nada é estimado para elas. Mínimo: 80% da execução com valor e 30 s medidos.' },
    tanaka: { ref: 'Tanaka, Monahan & Seals, 2001; Martin et al., 2025', nota: '208 − 0,7 × idade no dia da série (só adultos). É previsão de grupo: em pessoas, a FC máxima real ficou até ~18–24 bpm acima ou abaixo das fórmulas (limites de concordância, Martin 2025). Não é usada como referência das zonas.' },
    kcal: { ref: 'László et al., 2024; Farrar et al., 2010; Fusi et al., 2017; Mitchell et al., 2024; Hulsey et al., 2012; Clayton et al., 2019; Dawson et al.; Argent et al., 2022', nota: 'Cenários experimentais separados, cada um com a condição do estudo de origem. Nenhum é equação validada atleta a atleta no kettlebell sport, e a diferença entre eles não é intervalo de confiança nem faixa que contém o gasto verdadeiro. Oxigênio convertido a 5,04 kcal por litro (21,1 kJ/L, Mitchell 2024). Hulsey (0,189 ml/kg/batimento) e o estudo da ACE ficaram só como referência. Na mesma % da FCmáx, mulheres trabalharam numa % do VO₂máx maior que homens (Clayton 2019). O gasto calculado pelos relógios não é usado (Dawson; Argent 2022).', removido: 'Equações genéricas de calorias pela FC (corrida e bicicleta, como Keytel) foram descartadas: no kettlebell a FC sobe bem mais que o oxigênio (Hulsey 2012; Chan 2020).' },
    kcalref: { ref: 'Farrar et al., 2010; Hulsey et al., 2012; László et al., 2024; Mitchell et al., 2024', nota: 'Valores com oxigênio medido por analisador de gases. Farrar: swing 16 kg, 12 min, FC 165 bpm, ~13,4 kcal/min (cálculo do site: 34,31 ml/kg/min × 77,3 kg = 2,65 L/min × 5,05 kcal/L). Hulsey: swing em intervalos 35/25 s, FC 180 bpm, 12,5 kcal/min. László: long cycle de 10 min, FC 164–185 bpm, ~12,9 kcal/min. O estudo da ACE (snatch, 13,6 kcal/min) não entra: o oxigênio foi estimado pela FC, não medido.' },
    epoc: { ref: 'Sturdy & Astorino, 2024 (Eur J Appl Physiol 124:3755); László et al., 2024/2025; Islam et al., 2018; Panissa et al., 2020; Jiang et al.; Faleiro et al.; Matsuura et al.; Yang et al., 2025 (Sci Rep)', nota: 'Não há fórmula publicada para calcular o EPOC só com a FC. No estudo com kettlebell (Sturdy & Astorino 2024; 11 homens e 10 mulheres; 6 séries de complexos com kettlebell), o EPOC medido em 60 min foi 10,7 ± 4,5 L de O₂ (~55 kcal): 9,2 L nos homens e 12,5 L nas mulheres. Ele teve relação com a FC média da série (r = 0,52), mas FC média + lactato explicaram só 37% da variação e o artigo não publica os coeficientes. No long cycle de 10 min (László), o VO₂ caiu de 35,1 para 6,6 ml/kg/min em 15 min (fase rápida). Valores medidos em estudos, não nesta sessão.' },
    indisp: { ref: '—', nota: '' },
    epocInd: { ref: 'Firstbeat Technologies, 2012 (white paper; Saalasti, 2003); Karvonen, Kentala & Mustala, 1957; Sturdy & Astorino, 2024; Serafim, 2023', nota: 'Hipótese do projeto (área experimental): minutos com a FC acima do ponto médio entre a FC sentada antes da prova e a referência das zonas. O EPOC quase não se acumula abaixo de 30–40% do VO₂máx e se acumula continuamente acima de ~50% (Firstbeat 2012); aqui a FC substitui o VO₂ e a FC sentada substitui o repouso. Não é EPOC medido, nem litros nem kcal.' },
    vo2: { ref: 'Uth et al., 2004; Voutilainen et al., 2021 (World J Mens Health 39:666); Castagna, Krustrup & Póvoas, 2022 (Eur J Appl Physiol 122:1421)', nota: '' },
    hrvF: { ref: 'Task Force ESC/NASPE, 1996; Shaffer & Ginsberg, 2017', nota: '' },
    bpr: { ref: 'Cálculo do site (descritivo, sem validação)', nota: 'Não indica eficiência; serve só para comparar a pessoa com ela mesma no mesmo movimento e carga.' },
    janela: { ref: 'Regra operacional do site', nota: 'Execução = da 1ª à última contagem (válida ou no count); é a janela usada nas métricas da série. A janela registrada vai até o Finalizar; o trecho entre a última contagem e o Finalizar conta como recuperação, nunca nas duas.' },
    pico5: { ref: 'Uth et al., 2004 (maior média de 5 s); Chan et al., 2020', nota: 'Maior média de 5 segundos seguidos, só com segundos medidos (sem interpolação). Resiste a um pico isolado de um segundo.' }
  };

  // Métricas mínimas pedidas pela organização (Jefferson): calorias, FC máxima, FC de repouso, TRIMP, EPOC, tempo no VO₂máx e zonas Z2–Z5
  const ESSENCIAIS = ['ref', 'fc_pico', 'fc_rep', 'zonas', 't90', 'trimp_e', 'trimp_b', 'epoc_ind', 'epoc', 'kcal_laszlo', 'kcal_prop', 'kcal_farrar', 'kcal_fusi_s', 'kcal_fusi_c'];
  const KCAL_L = 5.04;            // 21,1 kJ por litro de O₂ (Mitchell 2024) ÷ 4,184 = 5,043, arredondado
  const MENOR_OCULTO = ['fcmax_tanaka', 'pct_tanaka', 'pct_fcr', 'trimp_b', 'epoc_ind', 'kcal_laszlo', 'kcal_prop', 'kcal_farrar', 'kcal_fusi_s', 'kcal_fusi_c'];

  function card(id, titulo, nivel, valor, unidade, fonte, extra) {
    return Object.assign({ id, titulo, nivel, valor, unidade: unidade || '', ref: fonte.ref, nota: fonte.nota }, extra || {});
  }
  const r0 = (x) => Math.round(x);
  const r1 = (x) => Math.round(x * 10) / 10;

  // ---------- validação das amostras ----------
  // amostras: [[t_ms, bpm], ...] (t absoluto em ms, horário de chegada da notificação)
  // Regra do site (R): aceita de 30 a 230 bpm, sem salto > 30 bpm em até 1,5 s. Valor igual por mais de 10 s fica só MARCADO (rep10), não é descartado.
  function marcaValidas(amostras) {
    const out = [];
    let prev = null, runVal = null, runIni = 0;
    for (let i = 0; i < amostras.length; i++) {
      const [t, b] = amostras[i];
      let ok = Number.isFinite(b) && b >= 30 && b <= 230;
      if (ok && prev && t - prev[0] <= 1500 && Math.abs(b - prev[1]) > 30) ok = false;
      let rep10 = false;
      if (b !== runVal) { runVal = b; runIni = t; }
      else if (t - runIni > 10000) rep10 = true;   // valor parado há mais de 10 s: marcado
      out.push({ t, b, ok, rep10 });
      prev = [t, b];
    }
    return out;
  }

  // Segundos (R): só segundos inteiros a partir de ini; o pedaço final incompleto fica de fora.
  // Mais de uma leitura no mesmo segundo: vale a última. obs = leitura aceita naquele segundo; util = obs + interpolação de até 2 s seguidos.
  function porSegundoDet(marc, ini, fim) {
    const n = Math.max(0, Math.floor((fim - ini) / 1000));
    const obs = new Array(n).fill(null), rep = new Array(n).fill(false);
    for (const a of marc) {
      if (!a.ok || a.t < ini || a.t >= fim) continue;
      const k = Math.floor((a.t - ini) / 1000);
      if (k >= 0 && k < n) { obs[k] = a.b; rep[k] = !!a.rep10; }
    }
    const util = obs.slice();
    for (let i = 0; i < n; i++) {
      if (util[i] !== null) continue;
      let a = i - 1, b = i + 1;
      while (a >= 0 && obs[a] === null && i - a <= 2) a--;
      while (b < n && obs[b] === null && b - i <= 2) b++;
      if (a >= 0 && obs[a] !== null && b < n && obs[b] !== null && b - a <= 3) util[i] = obs[a] + (obs[b] - obs[a]) * (i - a) / (b - a);
    }
    return { obs, util, rep };
  }
  function porSegundo(marc, ini, fim) { return porSegundoDet(marc, ini, fim).util; }   // compatibilidade

  // maior média de 5 s seguidos, só com segundos observados (sem interpolação)
  function maiorMedia5s(obs) {
    let m = null;
    for (let i = 0; i + 5 <= obs.length; i++) {
      const w = obs.slice(i, i + 5); if (w.some((v) => v === null)) continue;
      const v = (w[0] + w[1] + w[2] + w[3] + w[4]) / 5; if (m === null || v > m) m = v;
    }
    return m === null ? null : r1(m);
  }

  // janela de execução: 1ª contagem → última contagem (válida ou no count). Sem contagens: janela registrada (marcada).
  function janelas(sessao) {
    const cx = sessao.contexto || {}, ev = cx.eventos || {};
    const ini = sessao.inicio;
    const fimReg = sessao.fim || ((sessao.amostras || []).length ? sessao.amostras[sessao.amostras.length - 1][0] : ini);
    const reps = sessao.reps || [];
    let ult = Number.isFinite(sessao.ultima_contagem) ? sessao.ultima_contagem : (Number.isFinite(ev.ultima_contagem) ? ev.ultima_contagem : (reps.length ? reps[reps.length - 1] : null));
    if (Number.isFinite(ult) && Number.isFinite(fimReg) && ult > fimReg) ult = fimReg;
    let fimExec, tipo;
    if (!Number.isFinite(ult)) { fimExec = fimReg; tipo = 'registro'; }
    else if (ult > ini) { fimExec = ult; tipo = 'contagens'; }
    else { fimExec = ini; tipo = 'uma_contagem'; }
    return { ini, fimReg, fimExec, tipo, ultimaAoFinalizar: tipo === 'contagens' ? Math.max(0, r0((fimReg - fimExec) / 1000)) : null };
  }

  // ponto de entrada para a referência do campeonato: maior média de 5 s de cada sessão
  function pico5Sessao(sessao) {
    try {
      const j = janelas(sessao);
      const marc = marcaValidas((sessao.amostras || []).filter((a) => a[0] >= j.ini).map((a) => [a[0], a[1] === null ? NaN : a[1]]));
      return maiorMedia5s(porSegundoDet(marc, j.ini, j.fimExec).obs);
    } catch (e) { return null; }
  }
  // maior pico de 5 s entre as sessões da pessoa no campeonato (lista as sessões que deram o valor)
  function picoCampeonato(sessoes) {
    let v = null, ids = [];
    (sessoes || []).forEach((s) => { const p = pico5Sessao(s); if (p === null) return; if (v === null || p > v) { v = p; ids = [s.id]; } else if (p === v) ids.push(s.id); });
    return { valor: v, sessoes: ids };
  }

  // ---------- cálculo principal ----------
  // sessao: { inicio, fim, amostras:[[t,bpm]], reps:[t_ms das válidas], ultima_contagem?, score, atleta, contexto, idade_sessao?, peso_sessao? }
  // perfil: { sexo:'M'|'F', idade, peso, fcRepouso..., fcMaxConhecida, picoHistorico, picoSessoes, pse }
  function calcula(sessao, perfil) {
    perfil = perfil || {};
    { const cx = sessao.contexto || {};   // a medida guardada na sessão (feita antes da série) vale mais que o perfil atual
      if (Number.isFinite(+cx.fc_repouso) && cx.fc_repouso !== null && (cx.fc_repouso_protocolo === '5min' || cx.fc_repouso_protocolo === '1min'))
        perfil = Object.assign({}, perfil, { fcRepouso: +cx.fc_repouso, fcRepousoProtocolo: cx.fc_repouso_protocolo, fcRepousoEm: cx.fc_repouso_em, fcRepousoMomento: cx.fc_repouso_momento || perfil.fcRepousoMomento }); }
    if (Number.isFinite(sessao.idade_sessao)) perfil = Object.assign({}, perfil, { idade: sessao.idade_sessao });   // idade no dia da série (banco)
    if (Number.isFinite(sessao.peso_sessao)) perfil = Object.assign({}, perfil, { peso: sessao.peso_sessao, pesoData: sessao.peso_data });   // pesagem anterior à série (banco)
    const J = janelas(sessao);
    const ini = J.ini, fim = J.fimExec, fimReg = J.fimReg;
    const durS = Math.max(0, (fim - ini) / 1000), durMin = durS / 60, durRegS = Math.max(0, (fimReg - ini) / 1000);
    const marc = marcaValidas((sessao.amostras || []).filter((a) => a[0] >= ini));   // a fase "antes" não influencia a validação da série
    const D = porSegundoDet(marc, ini, fim);
    const seg = D.util, obsArr = D.obs;
    const util = seg.filter((v) => v !== null), obs = obsArr.filter((v) => v !== null);
    const nObs = obs.length, nInt = util.length - nObs, nDesc = seg.length - util.length, nRep10 = D.rep.filter(Boolean).length;
    const recebidas = marc.filter((a) => a.t >= ini && a.t < fim).length, rejeitadas = marc.filter((a) => a.t >= ini && a.t < fim && !a.ok).length;
    const pctValidas = seg.length ? util.length / seg.length : 0;
    const suficiente = pctValidas >= MIN_VALIDAS && nObs >= 30;
    const semLeit = nDesc > 0 ? ' ' + nDesc + ' s sem leitura não entram na conta (nada é estimado para eles).' : '';
    const cards = [];
    const motivoInsuf = J.tipo === 'uma_contagem' ? 'Só uma contagem: não há trecho de execução (1ª → última contagem).' : 'Dados insuficientes: menos de 80% da execução com leitura ou menos de 30 s medidos.';
    const insuf = (id, titulo, fonte) => card(id, titulo, 'X', null, '', fonte, { insuficiente: true, motivo: motivoInsuf });

    // --- medidas e resumos da execução
    const media = util.length ? util.reduce((a, b) => a + b, 0) / util.length : null;
    const pico = obs.length ? Math.max(...obs) : null;
    const minimo = obs.length ? Math.min(...obs) : null;
    const pico5 = maiorMedia5s(obsArr);
    cards.push(card('qualidade', 'Cobertura dos dados', 'R', r0(pctValidas * 100), '% da execução com valor · medidos ' + nObs + ' s, interpolados ' + nInt + ' s, sem leitura ' + nDesc + ' s',
      F.qual, { cobertura: { medidos: nObs, interpolados: nInt, sem_leitura: nDesc, repetidos_10s: nRep10, recebidas, rejeitadas },
        nota: F.qual.nota + ' Nesta série: ' + recebidas + ' leituras recebidas, ' + rejeitadas + ' rejeitadas' + (nRep10 ? ', ' + nRep10 + ' s com o mesmo valor há mais de 10 s (marcados, não descartados)' : '') + '.' }));
    cards.push(card('duracao', 'Duração da execução (1ª → última contagem)', 'B', durS, 's', F.janela, { fmt: 'tempo', nota: (J.tipo === 'registro' ? 'Sem contagens registradas: usa a janela gravada (início → Finalizar). ' : '') + F.janela.nota }));
    cards.push(card('duracao_reg', 'Janela registrada (1ª contagem → Finalizar)', 'B', durRegS, 's', F.janela, { fmt: 'tempo', nota: (J.ultimaAoFinalizar !== null ? 'Da última contagem ao Finalizar: ' + J.ultimaAoFinalizar + ' s (esse trecho conta como recuperação, não como execução). ' : '') + F.janela.nota }));
    cards.push(card('fc_media', 'FC média da execução', 'B', media !== null ? r0(media) : null, 'bpm', F.hrs, { nota: 'Média por segundo (medidos + interpolados).' + semLeit + ' ' + F.hrs.nota }));
    cards.push(card('fc_pico', 'Pico de FC registrado (leitura)', 'B', pico, 'bpm', F.hrs));
    cards.push(card('pico5', 'Maior FC média de 5 s nesta série', 'B', pico5 !== null ? r0(pico5) : null, 'bpm', F.pico5));
    cards.push(card('fc_min', 'FC mínima registrada (não é repouso)', 'B', minimo, 'bpm', F.hrs));

    // --- FC sentado antes da prova (5 min)
    const protRep = perfil.fcRepousoProtocolo || '';
    const emRep = perfil.fcRepousoEm ? Date.parse(perfil.fcRepousoEm) : NaN;
    const depoisDaSerie = Number.isFinite(emRep) && emRep > ini;
    const repOk = Number.isFinite(perfil.fcRepouso) && (protRep === '5min' || protRep === '1min') && Number.isFinite(emRep) && !depoisDaSerie;
    const momRep = perfil.fcRepousoMomento || '';
    const motivoRep = depoisDaSerie ? 'A FC sentada foi medida depois desta série: não é usada nela.' : (Number.isFinite(perfil.fcRepouso) && !repOk ? 'Há um valor de FC sem origem e data registradas: não é usado.' : 'Sem a medida de 5 minutos sentado antes da prova: este cálculo não tem como ser feito.');
    if (Number.isFinite(perfil.fcRepouso) && !repOk) perfil = Object.assign({}, perfil, { fcRepouso: undefined });
    const antesMin = Number.isFinite(emRep) ? Math.max(0, r0((ini - emRep) / 60000)) : null;
    if (Number.isFinite(perfil.fcRepouso)) cards.push(card('fc_rep', 'FC sentado antes da prova (5 min)', 'B', r0(perfil.fcRepouso), 'bpm', F.buchheit, {
      nota: (protRep === '5min' ? 'Média do último minuto de 5 min sentado. ' : 'Medida rápida (1 min sentado). ') +
        (momRep === 'antes_aquecimento' ? 'Medida antes do aquecimento. ' : momRep === 'depois_aquecimento' ? 'Medida depois do aquecimento (fica mais alta). ' : '') +
        (antesMin !== null ? 'Feita ' + antesMin + ' min antes da série. ' : '') + F.buchheit.nota }));
    else cards.push(card('fc_rep', 'FC sentado antes da prova (5 min)', 'E', null, '', F.buchheit, { motivo: motivoRep }));

    // --- referência (FC máxima de teste informada ou maior FC média de 5 s no campeonato)
    let ref = null, refTipo = '', origemMax = '', refSessoes = [];
    const hist = Number.isFinite(perfil.picoHistorico) ? perfil.picoHistorico : null;
    if (Number.isFinite(perfil.fcMaxConhecida)) { ref = perfil.fcMaxConhecida; refTipo = 'teste'; origemMax = 'FC máxima de teste informada'; }
    else if (pico5 !== null || hist !== null) {
      const daqui = pico5 !== null && (hist === null || pico5 >= hist);
      ref = daqui ? pico5 : hist; refTipo = 'campeonato';
      refSessoes = daqui ? [sessao.id].concat((perfil.picoSessoes || []).filter((x) => hist === pico5 && x !== sessao.id)) : (perfil.picoSessoes || []);
      origemMax = 'maior FC média de 5 s registrada no campeonato' + (daqui ? ' (nesta série)' : ' (em outra série)');
    }
    if (ref !== null) cards.push(card('ref', refTipo === 'teste' ? 'FC máxima de teste (referência das zonas)' : 'Maior FC média de 5 s no campeonato (referência das zonas)', refTipo === 'teste' ? 'A' : 'B', r0(ref), 'bpm', F.martin,
      { nota: (refTipo === 'campeonato' ? 'Âncora descritiva, não é FC máxima confirmada. Séries que formaram o valor: ' + (refSessoes.length || 1) + '. ' : 'Valor informado; confira a origem do teste. ') + F.martin.nota }));
    const idade = Number.isFinite(perfil.idade) ? perfil.idade : null;
    const tan = idade !== null && idade >= 18 ? 208 - 0.7 * idade : null;
    if (tan !== null) {
      cards.push(card('fcmax_tanaka', 'FC máxima prevista pela idade (Tanaka)', 'C', r0(tan), 'bpm', F.tanaka, { nota: (pico5 !== null && pico5 > tan ? 'A previsão ficou abaixo do pico medido (' + r0(pico5) + ' bpm): para esta pessoa a fórmula subestima. ' : '') + F.tanaka.nota }));
      if (suficiente) cards.push(card('pct_tanaka', '% da FC máxima prevista pela idade (média / pico)', 'C', [r0(media / tan * 100), r0(pico / tan * 100)], '%', F.tanaka, { fmt: 'par' }));
    }

    // --- zonas, tempo ≥ 90%, TRIMP de Edwards (só segundos com valor; nada estimado nas lacunas)
    const camp = refTipo === 'campeonato';
    const faixas = [[0, 0.5, '< 50%'], [0.5, 0.6, 'Z1 50–60%'], [0.6, 0.7, 'Z2 60–70%'], [0.7, 0.8, 'Z3 70–80%'], [0.8, 0.9, 'Z4 80–90%'], [0.9, 99, 'Z5 ≥ 90%']];
    const textos = [camp ? 'Abaixo de 50% do pico do campeonato' : 'Abaixo de 50% da FCmáx', 'Intensidade muito leve', 'Intensidade leve', 'Intensidade moderada', 'Intensidade alta', camp ? 'Perto do maior pico registrado no campeonato' : 'Intensidade muito alta, perto da sua FC máxima'];
    const tZ = camp ? 'Tempo em cada zona (Edwards adaptado: % do pico do campeonato)' : 'Tempo em cada zona (Edwards)';
    const tP = camp ? '% do pico registrado no campeonato (média / pico)' : '% da FC máxima de teste (média / pico)';
    const tT = camp ? 'Tempo ≥ 90% do pico do campeonato' : 'Tempo ≥ 90% da FC máxima de teste';
    const tE = camp ? 'TRIMP de Edwards (adaptado)' : 'TRIMP de Edwards';
    if (suficiente && ref) {
      const seg_z = faixas.map(() => 0);
      for (const v of util) { const p = v / ref; for (let z = 0; z < faixas.length; z++) if (p >= faixas[z][0] && p < faixas[z][1]) { seg_z[z]++; break; } }
      const minZ = seg_z.map((s) => s / 60);
      const n90 = util.filter((v) => v >= 0.9 * ref).length;
      cards.push(card('zonas', tZ, 'B', minZ.map(r1), 'min', F.edwards, { fmt: 'zonas', rotulos: faixas.map((f) => f[2]), textos, fcMax: r0(ref), origemMax, nota: 'Referência: ' + origemMax + ' (' + r0(ref) + ' bpm).' + semLeit + ' ' + F.edwards.nota }));
      cards.push(card('pct_fcmax', tP, 'B', [r0((media / ref) * 100), r0((pico / ref) * 100)], '%', F.martin, { fmt: 'par', nota: '100 × FC ÷ referência (' + r0(ref) + ' bpm). ' + F.martin.nota }));
      cards.push(card('t90', tT, 'B', r1(n90 / 60), 'min', F.t90, { nota: 'Contagem direta dos segundos com FC ≥ 90% da referência.' + semLeit + ' ' + F.t90.nota }));
      const trimpE = minZ[1] * 1 + minZ[2] * 2 + minZ[3] * 3 + minZ[4] * 4 + minZ[5] * 5;
      cards.push(card('trimp_e', tE, 'B', r0(trimpE), 'pontos', F.trimpE, { nota: F.trimpE.nota + semLeit }));
      // índices com a FC sentada antes da prova (adaptação: no lugar da FC de repouso)
      if (Number.isFinite(perfil.fcRepouso)) {
        const fs = perfil.fcRepouso;
        if (ref > fs) {
          const x = (media - fs) / (ref - fs);
          cards.push(card('pct_fcr', 'Índice relativo à FC sentada pré-prova (% da reserva)', 'C', r0(x * 100), '%', F.karvonen, { nota: '100 × (FC média − FC sentada) ÷ (referência − FC sentada) = 100 × (' + r0(media) + ' − ' + r0(fs) + ') ÷ (' + r0(ref) + ' − ' + r0(fs) + '). ' + F.karvonen.nota }));
          const lim = fs + 0.5 * (ref - fs);
          cards.push(card('epoc_ind', 'EPOC (indicador experimental): tempo acima do ponto médio entre FC sentada e referência', 'C', r1(util.filter((v) => v >= lim).length / 60), 'min', F.epocInd, { limite: r0(lim), nota: 'Ponto médio = ' + r0(lim) + ' bpm.' + semLeit + ' ' + F.epocInd.nota }));
          if (perfil.sexo === 'M' || perfil.sexo === 'F') {
            const A = perfil.sexo === 'M' ? 0.64 : 0.86, B = perfil.sexo === 'M' ? 1.92 : 1.67;
            cards.push(card('trimp_b', 'TRIMP de Banister adaptado à FC sentada pré-prova', 'C', r0(durMin * x * A * Math.exp(B * x)), 'pontos', F.trimpB, { nota: r1(durMin) + ' min × ' + Math.round(x * 100) / 100 + ' × ' + A + ' × e^(' + B + ' × ' + Math.round(x * 100) / 100 + '). ' + F.trimpB.nota }));
          } else cards.push(card('trimp_b', 'TRIMP de Banister adaptado à FC sentada pré-prova', 'E', null, '', F.trimpB, { motivo: 'Falta o sexo do atleta no cadastro (a fórmula muda para homens e mulheres).' }));
        } else ['pct_fcr|Índice relativo à FC sentada pré-prova (% da reserva)|karvonen', 'trimp_b|TRIMP de Banister adaptado à FC sentada pré-prova|trimpB', 'epoc_ind|EPOC (indicador experimental): tempo acima do ponto médio entre FC sentada e referência|epocInd']
          .forEach((s) => { const [id, t, f] = s.split('|'); cards.push(card(id, t, 'X', null, '', F[f], { motivo: 'A referência (' + r0(ref) + ' bpm) não é maior que a FC sentada (' + r0(fs) + ' bpm): o cálculo não faz sentido.' })); });
      } else ['pct_fcr|Índice relativo à FC sentada pré-prova (% da reserva)|karvonen', 'trimp_b|TRIMP de Banister adaptado à FC sentada pré-prova|trimpB', 'epoc_ind|EPOC (indicador experimental): tempo acima do ponto médio entre FC sentada e referência|epocInd']
        .forEach((s) => { const [id, t, f] = s.split('|'); cards.push(card(id, t, 'E', null, '', F[f], { motivo: motivoRep })); });
    } else {
      [['zonas', tZ, 'edwards'], ['pct_fcmax', tP, 'martin'], ['t90', tT, 't90'], ['trimp_e', tE, 'trimpE'], ['pct_fcr', 'Índice relativo à FC sentada pré-prova (% da reserva)', 'karvonen'], ['trimp_b', 'TRIMP de Banister adaptado à FC sentada pré-prova', 'trimpB'], ['epoc_ind', 'EPOC (indicador experimental): tempo acima do ponto médio entre FC sentada e referência', 'epocInd']]
        .forEach(([id, t, f]) => cards.push(insuf(id, t, F[f])));
    }

    // --- carga por PSE (não depende do sensor)
    const q = sessao.questionario || {};
    const atrasoPse = Number.isFinite(q.pse_atraso_s) ? r0(q.pse_atraso_s / 60) : null;
    if (Number.isFinite(perfil.pse)) cards.push(card('srpe', 'Carga por PSE' + (atrasoPse !== null ? ' (coleta ' + atrasoPse + ' min após o fim)' : ''), 'B', r0(perfil.pse * durMin), 'UA', F.srpe, { nota: 'PSE ' + perfil.pse + ' × ' + r1(durMin) + ' min de execução. ' + (atrasoPse !== null && atrasoPse < 30 ? 'Adaptação: Foster perguntou ~30 min depois; aqui a resposta veio ' + atrasoPse + ' min depois. ' : '') + F.srpe.nota }));
    else cards.push(card('srpe', 'Carga por PSE', 'E', null, '', F.srpe, { motivo: 'Sem resposta de esforço percebido no questionário pós-prova.' }));

    // --- recuperação: queda da FC em 60 s após a última contagem
    const fimRef = J.tipo === 'contagens' ? fim : fimReg;
    const tRec = J.tipo === 'contagens' ? 'Queda da FC em 60 s após a última contagem' : 'Queda da FC em 60 s após o Finalizar';
    const rec = marcaValidas(sessao.amostras || []).filter((a) => a.ok);
    const media_em = (t0, t1) => { const v = rec.filter((a) => a.t >= t0 && a.t <= t1).map((a) => a.b); return v.length >= MIN_LEIT_JANELA ? v.reduce((x, y) => x + y, 0) / v.length : null; };
    const fcFim = media_em(fimRef - 5000, fimRef), fc60 = media_em(fimRef + 57000, fimRef + 63000);
    if (fcFim !== null && fc60 !== null) cards.push(card('hrr60', tRec, 'B', r0(fcFim - fc60), 'bpm', F.hrr));
    else cards.push(card('hrr60', tRec, 'E', null, '', F.hrr, { motivo: 'Menos de ' + MIN_LEIT_JANELA + ' leituras válidas nos 5 s antes do fim ou entre 57 e 63 s depois (gravação interrompida, por exemplo pelo próximo atleta, ou sem leitura).' }));

    // --- batimentos estimados (C): soma de FC/60 nos segundos com valor
    const repsT = sessao.reps || [];
    if (suficiente) {
      const bat = util.reduce((a, v) => a + v / 60, 0);
      cards.push(card('batimentos', 'Batimentos estimados na execução', 'C', r0(bat), 'bat', F.bpr, { nota: 'Soma de FC ÷ 60 em cada segundo com valor (não é contagem de batimentos um a um).' + semLeit }));
      const repsUteis = repsT.filter((t) => { const k = Math.floor((t - ini) / 1000); return k >= 0 && k < seg.length && seg[k] !== null; }).length;
      if (repsUteis > 0) cards.push(card('bpr', 'Batimentos estimados por repetição', 'C', r1(bat / repsUteis), 'bat/rep', F.bpr, { nota: 'Batimentos estimados ÷ ' + repsUteis + ' repetições feitas nos mesmos segundos. ' + F.bpr.nota }));
    }

    // --- calorias: cenários experimentais separados (nenhum é intervalo de confiança)
    const kcalSoma = (fn) => { let neg = 0; const k = util.reduce((a, hr) => { const v = fn(hr); if (v < 0) { neg++; return a; } return a + v; }, 0) / 60; return { k, neg }; };
    const cond = (t) => ' Condição do estudo: ' + t + '.' + semLeit;
    if (suficiente) {
      const L = kcalSoma((hr) => hr * 0.01444 * KCAL_L);
      cards.push(card('kcal_laszlo', 'Calorias, cenário László (O₂ por batimento)', 'C', r0(L.k), 'kcal', F.kcal, { nota: 'Σ (FC ÷ 60) × 14,44 ml ÷ 1000 × ' + String(KCAL_L).replace('.', ',') + ' kcal/L.' + cond('long cycle, homens experientes; 14,44 ml/batimento é razão de médias calculada pelo projeto') + ' ' + F.kcal.nota }));
      if (Number.isFinite(perfil.peso)) {
        const pe = perfil.peso, pnota = ' Peso: ' + String(pe).replace('.', ',') + ' kg' + (perfil.pesoData ? ' (pesagem de ' + perfil.pesoData + ')' : '') + '.';
        const P = kcalSoma((hr) => hr * 0.000169 * pe * KCAL_L);
        cards.push(card('kcal_prop', 'Calorias, cenário proporcional à massa (derivado de László)', 'C', r0(P.k), 'kcal', F.kcal, { nota: 'Σ (FC ÷ 60) × 0,169 ml/kg × peso ÷ 1000 × 5,04.' + pnota + cond('mesmas médias de László (14,44 ÷ 85,3 kg); não é evidência independente do cenário László') + ' ' + F.kcal.nota }));
        const Fa = kcalSoma((hr) => hr * 0.000173 * pe * KCAL_L), Fb = kcalSoma((hr) => hr * 0.000208 * pe * KCAL_L);
        cards.push(card('kcal_farrar', 'Calorias, cenário Farrar (0,173 / 0,208 ml/kg/batimento)', 'C', [r0(Fa.k), r0(Fb.k)], 'kcal', F.kcal, { fmt: 'par', nota: 'Dois valores porque o artigo é inconsistente: as médias dão 31,8 L em 12 min (0,208), o total informado é 26,5 L (0,173, reconstrução do projeto). Não são limites do gasto.' + pnota + cond('swing, 16 kg, 12 min, 10 homens') + ' ' + F.kcal.nota }));
        const Sw = kcalSoma((hr) => (0.359 * hr - 29.128) * pe / 1000 * KCAL_L), Cl = kcalSoma((hr) => (0.3283 * hr - 25.141) * pe / 1000 * KCAL_L);
        const negN = (o, lim) => o.neg ? ' ' + o.neg + ' s com FC abaixo de ' + lim + ' bpm deram valor negativo na equação e não foram somados.' : '';
        cards.push(card('kcal_fusi_s', 'Calorias, cenário Fusi (regressão do swing)', 'C', r0(Sw.k), 'kcal', F.kcal, { nota: 'VO₂ (ml/kg/min) = 0,359 × FC − 29,128.' + negN(Sw, 81) + pnota + cond('swing, 12 kg, 5 min, 11 mulheres treinadas com FC medida') + ' ' + F.kcal.nota }));
        cards.push(card('kcal_fusi_c', 'Calorias, cenário Fusi (regressão do clean)', 'C', r0(Cl.k), 'kcal', F.kcal, { nota: 'VO₂ (ml/kg/min) = 0,3283 × FC − 25,141.' + negN(Cl, 77) + pnota + cond('clean, 12 kg, 5 min, 8 mulheres treinadas com FC medida') + ' ' + F.kcal.nota }));
      } else [['kcal_prop', 'Calorias, cenário proporcional à massa (derivado de László)'], ['kcal_farrar', 'Calorias, cenário Farrar (0,173 / 0,208 ml/kg/batimento)'], ['kcal_fusi_s', 'Calorias, cenário Fusi (regressão do swing)'], ['kcal_fusi_c', 'Calorias, cenário Fusi (regressão do clean)']]
        .forEach(([id, t]) => cards.push(card(id, t, 'E', null, '', F.kcal, { motivo: 'Sem peso da pesagem anterior à série: os cenários por kg não são calculados.' })));
    } else [['kcal_laszlo', 'Calorias, cenário László (O₂ por batimento)'], ['kcal_prop', 'Calorias, cenário proporcional à massa (derivado de László)'], ['kcal_farrar', 'Calorias, cenário Farrar (0,173 / 0,208 ml/kg/batimento)'], ['kcal_fusi_s', 'Calorias, cenário Fusi (regressão do swing)'], ['kcal_fusi_c', 'Calorias, cenário Fusi (regressão do clean)']]
      .forEach(([id, t]) => cards.push(insuf(id, t, F.kcal)));

    // --- D e E
    { const mins = durS / 60;
      cards.push(card('kcalref', 'Gasto medido em laboratório (referência)', 'D', null, '', F.kcalref, { referencia: 'Estudos com swing e long cycle mediram ~12,5 a 13,4 kcal por minuto, com FC média de 165 a 180 bpm. Projetado para ' + String(r1(mins)).replace('.', ',') + ' min, isso daria ~' + r0(12.5 * mins) + ' a ' + r0(13.4 * mins) + ' kcal: é projeção da taxa publicada, não gasto medido nesta sessão.' })); }
    cards.push(card('epoc', 'EPOC (referência de estudo)', 'D', null, '', F.epoc, { referencia: 'Depois de séries com kettlebell, um estudo mediu ~10,7 L de O₂ a mais na hora seguinte (~55 kcal; homens ~9 L, mulheres ~12,5 L), com o protocolo do estudo. Não é o EPOC deste atleta: não existe fórmula publicada que use só a FC.' }));
    cards.push(card('vo2max', 'VO₂máx', 'E', null, '', F.vo2, { motivo: 'O método da razão FCmáx ÷ FC de repouso (Uth 2004) só foi testado em homens: o fator vai de ~15 (Uth) a 14,6 (Castagna 2022, repouso deitado após 15 min) e cai com a idade, de 12,8 a 12,0 (Voutilainen 2021). Sem estudos em mulheres nem no kettlebell, e a FC do site é medida sentada, no dia da prova (Uth mediu deitado, na cama, ao acordar).' }));
    cards.push(card('hrv', 'Variabilidade da FC (HRV)', 'E', null, '', F.hrvF, { motivo: 'A HRV exige os intervalos entre batimentos (RR) gravados por pelo menos 5 min (Task Force 1996; Shaffer & Ginsberg 2017). Este sensor envia só a FC, sem intervalos RR.' }));

    // --- por minuto (FC média e repetições lado a lado)
    const porMin = [];
    const nMin = Math.ceil(durS / 60);
    for (let m = 0; m < nMin; m++) {
      const fatia = seg.slice(m * 60, (m + 1) * 60).filter((v) => v !== null);
      const t0 = ini + m * 60000, t1 = t0 + 60000;
      porMin.push({ minuto: m + 1, fc: fatia.length ? r0(fatia.reduce((a, b) => a + b, 0) / fatia.length) : null, reps: repsT.filter((t) => t >= t0 && t < t1).length });
    }

    // ---------- área experimental ("i" pontilhado roxo): hipótese, adaptação ou cálculo do site
    const SEM = { qualidade: 'Limites de qualidade definidos pelo site; nenhum artigo valida estes cortes para sensor óptico a 1 leitura por segundo.',
      bpr: 'Cálculo descritivo do site; nenhum artigo usa batimentos por repetição. Não indica eficiência.',
      batimentos: 'Cálculo descritivo do site a partir da FC média de cada segundo.',
      duracao: 'Regra do site: a execução vai da 1ª à última contagem.',
      pico5: 'Regra do site: média de 5 s, como no teste máximo de Uth (2004), aplicada a uma série de competição.',
      kcal_laszlo: 'Área experimental: nenhum método foi validado atleta a atleta no kettlebell sport.', kcal_prop: 'Área experimental: cálculo do site a partir de médias de László.',
      kcal_farrar: 'Área experimental: coeficientes reconstruídos pelo projeto a partir de médias de Farrar.', kcal_fusi_s: 'Área experimental: equação de outro grupo (mulheres, 12 kg, swing) transferida para este atleta e movimento.',
      kcal_fusi_c: 'Área experimental: equação de outro grupo (mulheres, 12 kg, clean) transferida para este atleta e movimento.' };
    if (camp) ['zonas', 'pct_fcmax', 't90', 'trimp_e'].forEach((id) => { SEM[id] = 'Adaptação: a referência é o maior pico do campeonato, não uma FC máxima de teste. As faixas de Edwards foram feitas com o pico de um teste máximo (Foster 2001); Chan (2020) achou o pico do snatch perto da FC máxima, mas em teste progressivo até a exaustão.'; });
    if (Number.isFinite(perfil.fcRepouso)) {
      const base = 'Adaptação: usa a FC sentada antes da prova (' + r0(perfil.fcRepouso) + ' bpm) no lugar da FC de repouso dos estudos. No dia da competição, mesmo antes do aquecimento, ela fica mais alta: 86 ± 12 contra 73 ± 9 bpm dois dias antes (Serafim 2023). Isso tende a reduzir este valor.';
      const dep = momRep === 'depois_aquecimento' ? ' Medida DEPOIS do aquecimento: os valores não estão totalmente alinhados com os estudos, que usam FC de repouso.' : '';
      ['pct_fcr', 'trimp_b', 'epoc_ind'].forEach((id) => { SEM[id] = (id === 'epoc_ind' ? 'Hipótese do projeto: o corte de 50% foi definido em % do VO₂máx (Firstbeat) e aqui é aplicado ao ponto médio entre FC sentada e referência; não é EPOC medido. ' : '') + base + dep; });
      if (momRep === 'depois_aquecimento') SEM.fc_rep = 'Medida depois do aquecimento: fica mais alta que a FC sentada antes do aquecimento.';
    }
    if (protRep === '1min') SEM.fc_rep = 'Medida rápida de 1 min: a FC ainda não estabilizou (Hart 2015 indica 5 min).';
    cards.forEach((c) => { if (SEM[c.id]) c.semFonte = SEM[c.id]; });
    // ---------- menores de 18 anos: sem estimativas fisiológicas (não há estudos em adolescentes no kettlebell)
    let saida = cards;
    if (idade !== null && idade < 18) {
      saida = cards.filter((c) => !MENOR_OCULTO.includes(c.id));
      saida.push(card('menor', 'Estimativas', 'E', null, '', { ref: 'Papadopoulou et al., 2019 (FC máxima em adolescentes ativas); Melo et al., 2023 (FC no swing em ginastas de 13 ± 2 anos)', nota: 'Há estudo de FC no kettlebell com adolescentes (Melo), mas não de gasto energético calculado pela FC em menores de 18 anos.' }, { motivo: 'Calorias, FC máxima pela idade e os índices com a FC sentada não são mostrados para menores de 18 anos. As zonas usam o próprio pico (descritivo).' }));
    }
    return { versao: VERSAO, pctValidas, suficiente, fcMax: ref, refTipo, refSessoes, origemMax, cards: saida, porMin, picoValido: pico, pico5, essenciais: ESSENCIAIS, seg, obs: obsArr, ini, fim, fimReg, janelaExec: J.tipo, ultimaAoFinalizar: J.ultimaAoFinalizar, durS, durRegS, media, minimo, fimRec: fimRef };
  }


  // ---------- ANALYTICS: registro completo para estudo (1 linha por sessão + tabelas por minuto e por segundo) ----------
  // Prioridade é o registro do campeonato; o estudo é consequência. Sem nome, contato ou data de nascimento:
  // o atleta entra só por um código (pseudônimo) gerado fora daqui.
  // ctx: { sessao_id, atleta_codigo, sexo, idade, peso, altura, movimento, carga_kg, categoria, plataforma, sensor_nome,
  //        sensor_posicao, fc_repouso_protocolo, score, no_counts, simulado }
  const DICIONARIO = [
    ['versao_metricas', 'Versão do método de cálculo', '', 'R', 'Site'],
    ['sessao_id', 'Identificador da sessão de FC', '', 'R', 'Site'],
    ['atleta_codigo', 'Código do atleta (pseudônimo, sem nome)', '', 'R', 'Site'],
    ['simulado', '1 = sessão simulada (mock, não usar no estudo)', '', 'R', 'Site'],
    ['sexo', 'Sexo informado na inscrição', 'M/F', 'A', 'Cadastro'],
    ['idade', 'Idade no dia da série', 'anos', 'A', 'Cadastro'],
    ['peso_kg', 'Peso da pesagem oficial mais próxima antes da série', 'kg', 'A', 'Pesagem'],
    ['altura_cm', 'Altura da última pesagem', 'cm', 'A', 'Pesagem'],
    ['imc', 'Índice de massa corporal', 'kg/m²', 'B', 'peso ÷ altura²'],
    ['movimento', 'Movimento da prova (jerk, snatch, long cycle…)', '', 'A', 'Contador'],
    ['carga_kg', 'Carga do kettlebell da inscrição', 'kg', 'A', 'Inscrição'],
    ['categoria', 'Categoria da inscrição', '', 'A', 'Inscrição'],
    ['plataforma', 'Plataforma (pista)', '', 'A', 'Contador'],
    ['data', 'Data da série (horário de Recife)', 'AAAA-MM-DD', 'A', 'Contador'],
    ['hora_inicio', 'Hora de início (o horário do dia pode influenciar a resposta cardiovascular: Sevilla-Lorente et al., 2023)', 'HH:MM', 'A', 'Contador'],
    ['duracao_s', 'Duração da execução (1ª → última contagem)', 's', 'B', 'Regra operacional do site'],
    ['janela_reg_s', 'Janela registrada (1ª contagem → Finalizar)', 's', 'B', 'Contador'],
    ['ultima_ao_finalizar_s', 'Segundos entre a última contagem e o Finalizar (contam como recuperação)', 's', 'B', 'Contador'],
    ['janela_exec', 'contagens = 1ª → última contagem; registro = sem contagens (início → Finalizar); uma_contagem = sem trecho de execução', '', 'R', 'Regra operacional do site'],
    ['reps_validas', 'Repetições válidas', 'rep', 'A', 'Contador'],
    ['no_counts', 'Repetições não contadas (no count)', 'rep', 'A', 'Contador'],
    ['cadencia_rpm', 'Ritmo médio', 'rep/min', 'B', 'reps ÷ minutos'],
    ['pse', 'Esforço percebido da prova (0–10; questionário pós-prova)', '', 'A', 'Foster et al., 2001'],
    ['sensacao_fs', 'Escala de sensação depois da prova (−5 muito ruim a +5 muito bom)', '', 'A', 'Nunes et al., 2022'],
    ['sensacao_atraso_s', 'Segundos entre o fim (última contagem) e a resposta de sensação', 's', 'B', 'Contador'],
    ['pse_atraso_s', 'Segundos entre o fim (última contagem) e a resposta de esforço (Foster: ~30 min)', 's', 'B', 'Contador'],
    ['consent_estudo', 'Uso em estudo autorizado (hoje sempre 0: a inscrição autoriza só a gravação e o relatório)', '', 'R', 'Decisão da organização (17/11); Lei 13.709/2018, art. 11'],
    ['janela', 'Início da série: primeira_contagem (placar 0→1) ou sem_contagem (início do cronômetro)', '', 'R', 'Regra operacional do site'],
    ['srpe', 'Carga por PSE = PSE × minutos da execução (adaptação: Foster usa a sessão inteira e pergunta ~30 min depois)', 'UA', 'B', 'Foster et al., 2001'],
    ['sensor_nome', 'Nome do sensor Bluetooth', '', 'A', 'Sensor'],
    ['sensor_posicao', 'Onde o sensor estava (braço, antebraço, pulso)', '', 'A', 'Moghaddam et al., 2026'],
    ['n_amostras', 'Leituras recebidas do sensor', '', 'A', 'Sensor'],
    ['pct_validas', 'Cobertura: % da execução com valor (medidos + interpolados)', '%', 'R', 'Regra operacional do site'],
    ['seg_repetidos_10s', 'Segundos com o mesmo valor há mais de 10 s (marcados, não descartados)', 's', 'R', 'Regra operacional do site'],
    ['leituras_rejeitadas', 'Leituras recebidas na execução e rejeitadas pela regra de qualidade', '', 'R', 'Regra operacional do site'],
    ['seg_medidos', 'Segundos da série com leitura do sensor', 's', 'A', 'Sensor'],
    ['seg_interpolados', 'Segundos preenchidos por interpolação (buracos de até 2 s)', 's', 'R', 'Regra operacional do site'],
    ['seg_sem_leitura', 'Segundos da série sem leitura válida', 's', 'A', 'Sensor'],
    ['pre_obtido_s', 'Segundos guardados antes da 1ª contagem (0 a 60)', 's', 'A', 'Sensor'],
    ['rec_disponivel_s', 'Segundos gravados depois do Finalizar', 's', 'A', 'Sensor'],
    ['rec_motivo_fim', 'Por que a gravação da recuperação terminou (tempo_completo, proximo_atleta, pagina_recarregada)', '', 'R', 'Contador'],
    ['consent_origem', 'Origem da autorização operacional (inscricao, termo, nao_identificado)', '', 'R', 'Decisão da organização (17/11)'],
    ['maior_buraco_s', 'Maior trecho seguido sem leitura válida', 's', 'R', 'Regra do site'],
    ['fc_repouso', 'FC sentado antes da prova (5 min; média do último minuto)', 'bpm', 'B', 'Hart, 2015; Gonzales et al., 2023; Serafim, 2023'],
    ['fc_repouso_protocolo', '5min = 5 min sentado (média do último minuto); 1min = medida rápida; manual = digitada', '', 'R', 'Hart, 2015'],
    ['fc_repouso_momento', 'Quando a FC sentada foi medida: antes_aquecimento ou depois_aquecimento (no dia da prova)', '', 'R', 'Serafim, 2023'],
    ['fcmax_ref', 'Referência das zonas (FC máxima de teste ou maior FC média de 5 s no campeonato)', 'bpm', 'B', 'Foster et al., 2001; Chan et al., 2020; Uth et al., 2004'],
    ['fcmax_origem', 'De onde veio a referência (teste ou campeonato)', '', 'R', 'Site'],
    ['fcref_sessoes', 'Sessões que formaram a referência do campeonato', '', 'R', 'Site'],
    ['fc_pico5', 'Maior FC média de 5 s nesta série (só segundos medidos)', 'bpm', 'B', 'Uth et al., 2004 (regra do site)'],
    ['fcmax_tanaka', 'FC máxima pela idade (208 − 0,7 × idade)', 'bpm', 'C', 'Tanaka, Monahan & Seals, 2001'],
    ['fc_media', 'FC média da execução (1ª → última contagem)', 'bpm', 'B', 'Sensor'],
    ['fc_mediana', 'FC mediana na série', 'bpm', 'B', 'Descritivo (sem artigo)'],
    ['fc_dp', 'Desvio-padrão da FC na série', 'bpm', 'B', 'Descritivo (sem artigo)'],
    ['fc_min', 'FC mínima na série (não é repouso)', 'bpm', 'B', 'Sensor'],
    ['fc_pico', 'Maior leitura aceita na série', 'bpm', 'B', 'Sensor'],
    ['fc_p5', 'Percentil 5 da FC', 'bpm', 'B', 'Descritivo (sem artigo)'],
    ['fc_p95', 'Percentil 95 da FC', 'bpm', 'B', 'Descritivo (sem artigo)'],
    ['tempo_ate_pico_s', 'Segundos do início até o pico', 's', 'B', 'Descritivo (sem artigo)'],
    ['fc_inicio_30s', 'FC média dos primeiros 30 s', 'bpm', 'B', 'Sensor'],
    ['fc_fim_30s', 'FC média dos últimos 30 s', 'bpm', 'B', 'Sensor'],
    ['fc_1a_metade', 'FC média da 1ª metade', 'bpm', 'B', 'Sensor'],
    ['fc_2a_metade', 'FC média da 2ª metade', 'bpm', 'B', 'Sensor'],
    ['deriva_bpm_min', 'Inclinação da FC ao longo da série (reta de mínimos quadrados)', 'bpm/min', 'B', 'Descritivo (sem artigo)'],
    ['pct_fcmax_media', '100 × FC média ÷ referência', '%', 'B', 'Foster et al., 2001'],
    ['pct_fcmax_pico', '100 × maior leitura ÷ referência', '%', 'B', 'Foster et al., 2001'],
    ['pct_tanaka_media', '100 × FC média ÷ FC máxima prevista pela idade (adultos)', '%', 'C', 'Tanaka, Monahan & Seals, 2001'],
    ['pct_fcr_media', 'Índice relativo à FC sentada pré-prova (% da reserva; adaptação)', '%', 'C', 'Karvonen, Kentala & Mustala, 1957 (adaptado); Serafim, 2023'],
    ['min_z0', 'Minutos abaixo de 50% da FCmáx', 'min', 'B', 'Edwards, 1993'],
    ['min_z1', 'Minutos em 50–60% da FCmáx', 'min', 'B', 'Edwards, 1993'],
    ['min_z2', 'Minutos em 60–70% da FCmáx', 'min', 'B', 'Edwards, 1993'],
    ['min_z3', 'Minutos em 70–80% da FCmáx', 'min', 'B', 'Edwards, 1993'],
    ['min_z4', 'Minutos em 80–90% da FCmáx', 'min', 'B', 'Edwards, 1993'],
    ['min_z5', 'Minutos em 90% ou mais da FC máxima de referência (não é tempo no VO₂máx)', 'min', 'B', 'Edwards, 1993; Chan et al., 2020'],
    ['min_ge95', 'Minutos em 95% ou mais da FCmáx', 'min', 'B', 'Descritivo (sem artigo)'],
    ['min_epoc50', 'EPOC (indicador experimental): minutos acima do ponto médio entre FC sentada e referência', 'min', 'C', 'Firstbeat, 2012 (adaptado)'],
    ['trimp_edwards', 'TRIMP de Edwards (adaptado quando a referência é o pico do campeonato)', 'pontos', 'B', 'Edwards, 1993'],
    ['trimp_banister', 'TRIMP de Banister adaptado à FC sentada pré-prova', 'pontos', 'C', 'Banister, 1991 (via Bok et al., 2022)'],
    ['hrr30', 'Queda da FC 30 s após a última contagem', 'bpm', 'B', 'Regra operacional do site (Buchheit, 2014 sustenta os 60 s)'],
    ['hrr60', 'Queda da FC 60 s após a última contagem', 'bpm', 'B', 'Buchheit, 2014 (adaptado)'],
    ['hrr120', 'Queda da FC 120 s após a última contagem', 'bpm', 'B', 'Regra operacional do site (Buchheit, 2014 sustenta os 60 s)'],
    ['batimentos_serie', 'Batimentos estimados na execução (Σ FC ÷ 60 nos segundos com valor)', 'bat', 'C', 'Descritivo (sem artigo)'],
    ['bat_por_rep', 'Batimentos estimados por repetição nos mesmos segundos (não indica eficiência)', 'bat/rep', 'C', 'Site (descritivo, sem artigo)'],
    ['corr_fc_reps_min', 'Correlação (Pearson) entre FC e repetições minuto a minuto', 'r', 'B', 'Descritivo (sem artigo)'],
    ['kcal_laszlo', 'Calorias, cenário László: O₂ por batimento (14,44 ml, razão de médias calculada pelo projeto)', 'kcal', 'C', 'László et al., 2024; 5,04 kcal/L (Mitchell et al., 2024)'],
    ['kcal_prop_0169', 'Calorias, cenário proporcional à massa: 0,169 ml/kg/batimento (14,44 ÷ 85,3)', 'kcal', 'C', 'Cálculo do site com László et al., 2024'],
    ['kcal_farrar_0173', 'Calorias, cenário Farrar: 0,173 ml/kg/batimento (total de 26,5 L; reconstrução do projeto)', 'kcal', 'C', 'Farrar et al., 2010'],
    ['kcal_farrar_0208', 'Calorias, cenário Farrar: 0,208 ml/kg/batimento (médias 34,31 ml/kg/min ÷ 165 bpm)', 'kcal', 'C', 'Farrar et al., 2010'],
    ['kcal_fusi_swing', 'Calorias, cenário Fusi: regressão do swing (11 mulheres; valores negativos não somados)', 'kcal', 'C', 'Fusi et al., 2017'],
    ['kcal_fusi_clean', 'Calorias, cenário Fusi: regressão do clean (8 mulheres; valores negativos não somados)', 'kcal', 'C', 'Fusi et al., 2017']
  ];
  const DIC_MIN = [['sessao_id', 'Sessão'], ['minuto', 'Minuto da série (1, 2, 3…)'], ['fc_media', 'FC média do minuto (bpm)'], ['fc_max', 'Maior FC do minuto (bpm)'], ['reps', 'Repetições válidas no minuto'], ['pct_validas', '% de segundos válidos no minuto']];
  const DIC_SEG = [['sessao_id', 'Sessão'], ['t_s', 'Segundos desde o início da série (negativo = antes; maior que a duração = recuperação)'], ['fase', 'antes, serie (1ª → última contagem) ou recuperacao (depois da última contagem)'], ['bpm', 'FC lida (vazio se não houve leitura)'], ['valida', '1 = passou na regra de qualidade'], ['repetido_10s', '1 = mesmo valor há mais de 10 s (marcado)'], ['rep', 'Repetições válidas registradas naquele segundo']];

  function analytics(sessao, perfil, ctx) {
    perfil = perfil || {}; ctx = ctx || {};
    const res = calcula(sessao, perfil);
    const C = {}; res.cards.forEach((c) => { C[c.id] = c; });
    const ini = res.ini, fim = res.fimRec, durS = res.durS, seg = res.seg;
    const val = seg.filter((v) => v !== null);
    const ord = val.slice().sort((a, b) => a - b);
    const q = (p) => ord.length ? ord[Math.min(ord.length - 1, Math.max(0, Math.round(p * (ord.length - 1))))] : null;
    const med = (a) => a.length ? a.reduce((x, y) => x + y, 0) / a.length : null;
    const sd = (a) => { if (a.length < 2) return null; const m = med(a); return Math.sqrt(a.reduce((x, y) => x + (y - m) * (y - m), 0) / (a.length - 1)); };
    const fatia = (a, b) => seg.slice(a, b).filter((v) => v !== null);
    const half = Math.floor(seg.length / 2);
    let tPico = null; if (val.length) { const mx = Math.max(...val); tPico = seg.indexOf(mx); }
    // deriva: mínimos quadrados bpm × minuto
    let deriva = null; { const xs = [], ys = []; seg.forEach((v, i) => { if (v !== null) { xs.push(i / 60); ys.push(v); } });
      if (xs.length > 10) { const mx = med(xs), my = med(ys); let n = 0, d = 0; for (let i = 0; i < xs.length; i++) { n += (xs[i] - mx) * (ys[i] - my); d += (xs[i] - mx) * (xs[i] - mx); } deriva = d ? n / d : null; } }
    // maior buraco
    let buraco = 0, cur = 0; seg.forEach((v) => { if (v === null) { cur++; buraco = Math.max(buraco, cur); } else cur = 0; });
    // recuperação 30/60/120 s
    const ok = marcaValidas(sessao.amostras || []).filter((a) => a.ok);
    const em = (t0, t1) => { const v = ok.filter((a) => a.t >= t0 && a.t <= t1).map((a) => a.b); return v.length >= MIN_LEIT_JANELA ? med(v) : null; };
    const fcFim = em(fim - 5000, fim);
    const hrr = (s) => { const v = em(fim + (s - 3) * 1000, fim + (s + 3) * 1000); return fcFim !== null && v !== null ? Math.round(fcFim - v) : null; };
    // zonas
    const z = C.zonas && Array.isArray(C.zonas.valor) ? C.zonas.valor : [null, null, null, null, null, null];
    const min95 = res.fcMax && res.suficiente ? r1(val.filter((v) => v >= 0.95 * res.fcMax).length / 60) : null;
    const cv = (id) => (C[id] && (C[id].nivel === 'C' || C[id].nivel === 'B') ? C[id].valor : null);
    // por minuto + correlação FC × reps
    const reps = sessao.reps || [];
    const minutos = res.porMin.map((m, i) => { const f = seg.slice(i * 60, (i + 1) * 60); const v = f.filter((x) => x !== null);
      return { sessao_id: ctx.sessao_id || sessao.id || '', minuto: m.minuto, fc_media: m.fc, fc_max: v.length ? Math.max(...v) : null, reps: m.reps, pct_validas: f.length ? Math.round(v.length / f.length * 100) : null }; });
    let corr = null; { const pts = minutos.filter((m) => m.fc !== null && m.minuto * 60 <= durS + 1); if (pts.length >= 3) {
      const a = pts.map((m) => m.fc), b = pts.map((m) => m.reps), ma = med(a), mb = med(b); let n = 0, da = 0, db = 0;
      for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } corr = da && db ? Math.round(n / Math.sqrt(da * db) * 100) / 100 : null; } }
    // série por segundo (inclui antes do início e a recuperação gravada)
    const segundos = []; { const porS = new Map(); for (const a of marcaValidas(sessao.amostras || [])) { const k = Math.floor((a.t - ini) / 1000); if (!porS.has(k) || a.ok) porS.set(k, a); }   // mesmo segundo: vale a última aceita
      const repS = new Map(); reps.forEach((t) => { const k = Math.floor((t - ini) / 1000); repS.set(k, (repS.get(k) || 0) + 1); });
      const ks = [...new Set([...porS.keys(), ...repS.keys()])].sort((a, b) => a - b);
      ks.forEach((k) => { const a = porS.get(k); segundos.push({ sessao_id: ctx.sessao_id || sessao.id || '', t_s: k, fase: k < 0 ? 'antes' : (k < durS ? 'serie' : 'recuperacao'), bpm: a && Number.isFinite(a.b) ? a.b : null, valida: a && a.ok ? 1 : 0, repetido_10s: a && a.rep10 ? 1 : 0, rep: repS.get(k) || 0 }); }); }
    const dt = new Date(ini); const loc = new Date(dt.getTime() - 3 * 3600000);   // Recife, UTC−3 sem horário de verão
    const two = (n) => String(n).padStart(2, '0');
    const nRep = reps.length || ctx.score || sessao.score || 0;
    const alt = Number.isFinite(+ctx.altura) && +ctx.altura > 0 ? +ctx.altura : null, pes = Number.isFinite(sessao.peso_sessao) ? sessao.peso_sessao : (Number.isFinite(+perfil.peso) ? +perfil.peso : null);
    const linha = {
      versao_metricas: VERSAO, sessao_id: ctx.sessao_id || sessao.id || '', atleta_codigo: ctx.atleta_codigo || '', simulado: (ctx.simulado || sessao.simulado) ? 1 : 0,
      sexo: perfil.sexo || '', idade: Number.isFinite(sessao.idade_sessao) ? sessao.idade_sessao : (Number.isFinite(perfil.idade) ? perfil.idade : null), peso_kg: pes, altura_cm: alt, imc: pes && alt ? r1(pes / ((alt / 100) ** 2)) : null,
      movimento: ctx.movimento || sessao.movimento || '', carga_kg: ctx.carga_kg != null ? ctx.carga_kg : null, categoria: ctx.categoria || '', plataforma: ctx.plataforma || sessao.pista || '',
      data: loc.getUTCFullYear() + '-' + two(loc.getUTCMonth() + 1) + '-' + two(loc.getUTCDate()), hora_inicio: two(loc.getUTCHours()) + ':' + two(loc.getUTCMinutes()),
      duracao_s: Math.round(durS), janela_reg_s: Math.round(res.durRegS), ultima_ao_finalizar_s: res.ultimaAoFinalizar, janela_exec: res.janelaExec, reps_validas: nRep, no_counts: ctx.no_counts != null ? ctx.no_counts : null, cadencia_rpm: durS > 0 ? r1(nRep / (durS / 60)) : null,
      pse: Number.isFinite(perfil.pse) ? perfil.pse : null, srpe: C.srpe && C.srpe.nivel === 'B' ? C.srpe.valor : null,
      sensacao_fs: sessao.questionario && Number.isFinite(sessao.questionario.fs) ? sessao.questionario.fs : null,
      sensacao_atraso_s: sessao.questionario && Number.isFinite(sessao.questionario.fs_atraso_s) ? sessao.questionario.fs_atraso_s : null,
      pse_atraso_s: sessao.questionario && Number.isFinite(sessao.questionario.pse_atraso_s) ? sessao.questionario.pse_atraso_s : null,
      consent_estudo: sessao.contexto && sessao.contexto.consentimento ? (sessao.contexto.consentimento.estudo ? 1 : 0) : null,
      janela: (sessao.contexto && sessao.contexto.janela) || '',
      sensor_nome: ctx.sensor_nome || sessao.sensor_nome || '', sensor_posicao: ctx.sensor_posicao || '', n_amostras: (sessao.amostras || []).length,
      pct_validas: Math.round(res.pctValidas * 100), maior_buraco_s: buraco, seg_repetidos_10s: C.qualidade && C.qualidade.cobertura ? C.qualidade.cobertura.repetidos_10s : null, leituras_rejeitadas: C.qualidade && C.qualidade.cobertura ? C.qualidade.cobertura.rejeitadas : null,
      seg_medidos: C.qualidade && C.qualidade.cobertura ? C.qualidade.cobertura.medidos : null, seg_interpolados: C.qualidade && C.qualidade.cobertura ? C.qualidade.cobertura.interpolados : null, seg_sem_leitura: C.qualidade && C.qualidade.cobertura ? C.qualidade.cobertura.sem_leitura : null,
      pre_obtido_s: sessao.contexto && Number.isFinite(sessao.contexto.pre_obtido_s) ? sessao.contexto.pre_obtido_s : null,
      rec_disponivel_s: sessao.contexto && Number.isFinite(sessao.contexto.rec_disponivel_s) ? sessao.contexto.rec_disponivel_s : null,
      rec_motivo_fim: (sessao.contexto && sessao.contexto.rec_motivo_fim) || '',
      consent_origem: sessao.contexto && sessao.contexto.consentimento ? (sessao.contexto.consentimento.origem || '') : '',
      fc_repouso: Number.isFinite(perfil.fcRepouso) ? perfil.fcRepouso : null, fc_repouso_protocolo: Number.isFinite(perfil.fcRepouso) ? (perfil.fcRepousoProtocolo || 'manual') : '', fc_repouso_momento: ((sessao.contexto || {}).fc_repouso_momento) || '',
      fcmax_ref: res.fcMax || null, fcmax_origem: res.refTipo || '', fcref_sessoes: (res.refSessoes || []).join(' '), fc_pico5: res.pico5, fcmax_tanaka: C.fcmax_tanaka ? C.fcmax_tanaka.valor : null,
      fc_media: res.media !== null ? r1(res.media) : null, fc_mediana: q(0.5), fc_dp: sd(val) !== null ? r1(sd(val)) : null, fc_min: res.minimo, fc_pico: res.picoValido,
      fc_p5: q(0.05), fc_p95: q(0.95), tempo_ate_pico_s: tPico, fc_inicio_30s: med(fatia(0, 30)) !== null ? r1(med(fatia(0, 30))) : null,
      fc_fim_30s: med(fatia(Math.max(0, seg.length - 30), seg.length)) !== null ? r1(med(fatia(Math.max(0, seg.length - 30), seg.length))) : null,
      fc_1a_metade: med(fatia(0, half)) !== null ? r1(med(fatia(0, half))) : null, fc_2a_metade: med(fatia(half, seg.length)) !== null ? r1(med(fatia(half, seg.length))) : null,
      deriva_bpm_min: deriva !== null ? Math.round(deriva * 100) / 100 : null,
      pct_fcmax_media: C.pct_fcmax && C.pct_fcmax.valor ? C.pct_fcmax.valor[0] : null, pct_fcmax_pico: C.pct_fcmax && C.pct_fcmax.valor ? C.pct_fcmax.valor[1] : null,
      pct_tanaka_media: C.pct_tanaka ? C.pct_tanaka.valor[0] : null, pct_fcr_media: cv('pct_fcr'),
      min_z0: z[0], min_z1: z[1], min_z2: z[2], min_z3: z[3], min_z4: z[4], min_z5: z[5], min_ge95: min95,
      min_epoc50: cv('epoc_ind'),
      trimp_edwards: C.trimp_e && C.trimp_e.nivel === 'B' ? C.trimp_e.valor : null, trimp_banister: cv('trimp_b'),
      hrr30: hrr(30), hrr60: hrr(60), hrr120: hrr(120),
      batimentos_serie: cv('batimentos'), bat_por_rep: C.bpr ? C.bpr.valor : null, corr_fc_reps_min: corr,
      kcal_laszlo: cv('kcal_laszlo'), kcal_prop_0169: cv('kcal_prop'), kcal_farrar_0173: cv('kcal_farrar') ? cv('kcal_farrar')[0] : null, kcal_farrar_0208: cv('kcal_farrar') ? cv('kcal_farrar')[1] : null,
      kcal_fusi_swing: cv('kcal_fusi_s'), kcal_fusi_clean: cv('kcal_fusi_c')
    };
    return { linha, minutos, segundos };
  }
  function csv(linhas, colunas) {
    const c = colunas || (linhas[0] ? Object.keys(linhas[0]) : []);
    const f = (v) => { if (v === null || v === undefined) return ''; const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + [c.join(';')].concat(linhas.map((l) => c.map((k) => f(l[k])).join(';'))).join('\r\n');
  }

  global.KBMetricas = { calcula, analytics, csv, marcaValidas, pico5Sessao, picoCampeonato, janelas, KCAL_L, VERSAO, POS_PROVA_S, PRE_PROVA_S, MIN_LEIT_JANELA, MIN_VALIDAS, FONTES: F, ESSENCIAIS, DICIONARIO, DIC_MIN, DIC_SEG };
})(typeof window !== 'undefined' ? window : globalThis);
