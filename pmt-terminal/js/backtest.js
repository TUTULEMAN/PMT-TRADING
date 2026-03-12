// ════════════════════════════════════
//  BACKTEST — engine, strategies, UI
// ════════════════════════════════════

// ── INIT (no date range — live data only) ───────────────
function initBacktestDates() {
  // Date inputs removed; strategy uses live stream from Charts.
}

// ── STRATEGY TABS ────────────────────
function ss(name, btn) {
  curStrat = name;
  document.querySelectorAll('.st').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  document.querySelectorAll('.pb').forEach(b => b.classList.remove('vis'));
  document.getElementById('p-' + name)?.classList.add('vis');
}

// ── FETCH CANDLES FOR BACKTEST ────────
async function fetchBTCandles(sym, res, from, to) {
  if (!KEY) throw new Error('No API key — launch terminal first');
  const ns = normSym(sym);
  const ep = ns.type === 'crypto' ? 'crypto/candle'
           : ns.type === 'forex'  ? 'forex/candle'
           : 'stock/candle';
  const url = `${FH}/${ep}?symbol=${encodeURIComponent(ns.finnhub)}&resolution=${res}&from=${from}&to=${to}&token=${encodeURIComponent(KEY)}`;
  const r = await fetch(url);
  const j = await r.json();
  if (j.s === 'error') throw new Error(j.errmsg || 'Finnhub error');
  if (j.s !== 'ok' || !j.t?.length) throw new Error('No data returned. Check symbol & date range.');
  return j.t.map((t, i) => ({
    time: t, open: j.o[i], high: j.h[i], low: j.l[i], close: j.c[i], volume: j.v[i] || 0
  }));
}

// ── PRE-COMPUTE ALL INDICATORS ────────
function preInd(data) {
  const cl = data.map(d => d.close), n = data.length;
  const ind = Array.from({ length: n }, () => ({}));

  // SMA helpers (for custom scripts)
  if (n >= 5) {
    let sum5 = 0;
    for (let i = 0; i < 5; i++) sum5 += cl[i];
    ind[4].sma5 = sum5 / 5;
    for (let i = 5; i < n; i++) { sum5 += cl[i] - cl[i - 5]; ind[i].sma5 = sum5 / 5; }
  }
  if (n >= 10) {
    let sum10 = 0;
    for (let i = 0; i < 10; i++) sum10 += cl[i];
    ind[9].sma10 = sum10 / 10;
    for (let i = 10; i < n; i++) { sum10 += cl[i] - cl[i - 10]; ind[i].sma10 = sum10 / 10; }
  }

  // RSI(14) — needs at least 15 bars
  if (n >= 15) {
    let ag = 0, al = 0;
    for (let i = 1; i <= 14; i++) {
      const d = cl[i] - cl[i-1];
      if (d > 0) ag += d; else al -= d;
    }
    ag /= 14; al /= 14;
    ind[14].rsi14 = al === 0 ? 100 : 100 - 100/(1 + ag/al);
    for (let i = 15; i < n; i++) {
      const d = cl[i] - cl[i-1];
      ag = (ag*13 + (d > 0 ? d : 0)) / 14;
      al = (al*13 + (d < 0 ? -d : 0)) / 14;
      ind[i].rsi14 = al === 0 ? 100 : 100 - 100/(1 + ag/al);
    }
  }

  // MACD(12,26,9) — needs at least 35 bars to produce signal line
  if (n >= 26) {
    const eArr = p => {
      const m = 2/(p+1), r = new Array(n).fill(null); let s = 0;
      for (let i = 0; i < p; i++) s += cl[i];
      r[p-1] = s/p;
      for (let i = p; i < n; i++) r[i] = cl[i]*m + r[i-1]*(1-m);
      return r;
    };
    const f12 = eArr(12), s26 = eArr(26);
    const mv = new Array(n).fill(null), sa = new Array(n).fill(null);
    for (let i = 0; i < n; i++) if (f12[i] !== null && s26[i] !== null) mv[i] = f12[i] - s26[i];
    const sk = 2/10; let sc = 0, ss2 = 0;
    for (let i = 0; i < n; i++) {
      if (mv[i] === null) continue;
      if (sc < 9) { ss2 += mv[i]; sc++; if (sc === 9) sa[i] = ss2/9; }
      else sa[i] = mv[i]*sk + sa[i-1]*(1-sk);
    }
    for (let i = 0; i < n; i++) {
      if (mv[i] !== null) ind[i].macd = mv[i];
      if (sa[i] !== null) ind[i].macdSignal = sa[i];
    }
  }
  return ind;
}

// ── SIGNAL GENERATION ────────────────
function genSigs(data, ind) {
  const n = data.length, sigs = new Array(n).fill(null);

  if (curStrat === 'rsi') {
    const os = +document.getElementById('ros').value;
    const ob = +document.getElementById('rob').value;
    let wo = false, wb = false;
    for (let i = 0; i < n; i++) {
      const r = ind[i].rsi14;
      if (r == null) continue;
      if (r < os) wo = true;
      if (r > ob) wb = true;
      if (wo && r > os + 3) { sigs[i] = 'buy';  wo = false; }
      if (wb && r < ob - 3) { sigs[i] = 'sell'; wb = false; }
    }
  } else if (curStrat === 'macd') {
    for (let i = 1; i < n; i++) {
      const p = ind[i-1], c = ind[i];
      if (p.macd == null || c.macd == null) continue;
      if (p.macd < p.macdSignal && c.macd > c.macdSignal) sigs[i] = 'buy';
      if (p.macd > p.macdSignal && c.macd < c.macdSignal) sigs[i] = 'sell';
    }
  } else if (curStrat === 'custom') {
    try {
      const fn = new Function('i', 'data', 'ind',
        `"use strict";\n${document.getElementById('ce-editor').value}\nreturn signal(i,data,ind);`
      );
      for (let i = 1; i < n; i++) {
        try { sigs[i] = fn(i, data, ind); } catch (e) {}
      }
    } catch (e) { throw new Error('Custom error: ' + e.message); }
  }
  return sigs;
}

// ── SIMULATE TRADES ──────────────────
function simulate(data, sigs, cap, psz, com) {
  const n = data.length;
  const eq = [{ time: data[0].time, value: cap }];
  const trades = [];
  let cash = cap, inPos = false, ep2 = 0, et = 0, sh = 0;

  for (let i = 1; i < n; i++) {
    const sig = sigs[i], pr = data[i].close;
    if (!inPos && sig === 'buy') {
      const c = cash * (psz/100) * (com/100);
      sh = (cash * (psz/100) - c) / pr;
      cash -= sh * pr + c;
      ep2 = pr; et = data[i].time; inPos = true;
    } else if (inPos && sig === 'sell') {
      const c = sh * pr * (com/100);
      const pnl = (pr - ep2) * sh - c - ep2 * sh * (com/100);
      cash += sh * pr - c;
      trades.push({ entryTime: et, entryPrice: ep2, exitTime: data[i].time, exitPrice: pr, pnl, ret: (pr/ep2 - 1) * 100 });
      sh = 0; inPos = false;
    }
    eq.push({ time: data[i].time, value: cash + (inPos ? sh * pr : 0) });
  }
  // Close open position at end
  if (inPos) {
    const pr = data[n-1].close;
    trades.push({
      entryTime: et, entryPrice: ep2,
      exitTime: data[n-1].time, exitPrice: pr,
      pnl: (pr - ep2) * sh, ret: (pr/ep2 - 1) * 100, open: true
    });
  }
  return { eq, trades };
}

// ── COMPUTE ANALYTICS ────────────────
function cAnalytics(eq, trades, cap) {
  const v = eq.map(e => e.value), n = v.length, fv = v[n-1];
  const tr   = (fv/cap - 1) * 100;
  const days = (eq[n-1].time - eq[0].time) / 86400;
  const yr   = days / 365.25;
  const cagr = yr > 0 ? ((fv/cap) ** (1/yr) - 1) * 100 : 0;

  let peak = v[0], mdd = 0, mdda = 0;
  const dds = eq.map(e => {
    if (e.value > peak) peak = e.value;
    const d = (e.value - peak) / peak * 100;
    if (d < mdd) { mdd = d; mdda = e.value - peak; }
    return { time: e.time, value: d };
  });

  const rets = [];
  for (let i = 1; i < n; i++) rets.push(v[i]/v[i-1] - 1);
  const mr = rets.reduce((a, b) => a+b, 0) / rets.length;
  const sr = Math.sqrt(rets.reduce((a, b) => a+(b-mr)**2, 0) / rets.length);
  const sharpe  = sr > 0 ? (mr/sr) * Math.sqrt(252) : 0;
  const ds2  = rets.filter(r => r < 0);
  const dsr  = Math.sqrt(ds2.reduce((a, b) => a+b*b, 0) / (ds2.length || 1));
  const sortino = dsr > 0 ? (mr/dsr) * Math.sqrt(252) : 0;

  const wins   = trades.filter(t => t.pnl > 0);
  const losses = trades.filter(t => t.pnl <= 0);
  const wr  = trades.length > 0 ? wins.length / trades.length * 100 : 0;
  const aw  = wins.length   > 0 ? wins.reduce((a, t) => a+t.ret, 0) / wins.length : 0;
  const al2 = losses.length > 0 ? losses.reduce((a, t) => a+t.ret, 0) / losses.length : 0;
  const gp  = wins.reduce((a, t) => a+t.pnl, 0);
  const gl  = Math.abs(losses.reduce((a, t) => a+t.pnl, 0));
  const pf  = gl > 0 ? gp/gl : gp > 0 ? Infinity : 0;
  const calmar = mdd !== 0 ? cagr / Math.abs(mdd) : 0;

  // Monthly returns
  const mo = {};
  eq.forEach((e, i) => {
    if (!i) return;
    const d = new Date(e.time * 1000);
    const k = `${d.getFullYear()}-${d.getMonth()}`;
    if (!mo[k]) mo[k] = { yr: d.getFullYear(), mn: d.getMonth(), st: v[i-1] };
    mo[k].en = e.value;
  });
  const monthly = Object.values(mo)
    .filter(m => m.st && m.en)
    .map(m => ({ yr: m.yr, mn: m.mn, ret: (m.en/m.st - 1) * 100 }));

  return { tr, cagr, mdd, mdda, sharpe, sortino, wr, aw, al: al2, pf, calmar, dds, yr, fv, monthly, rets };
}

// ── MAIN RUN (uses live data from chart when available) ─────────────────────────
async function runBacktest() {
  const btn = document.getElementById('rbtn');
  const st  = document.getElementById('rst');
  btn.disabled = true;
  btn.innerHTML = '<span class="spin"></span>';
  st.textContent = 'Running…';
  try {
    const sym  = document.getElementById('bs').value.trim().toUpperCase();
    const cap   = +document.getElementById('bc').value;
    const psz   = +document.getElementById('pps').value;
    const com   = +document.getElementById('pcom').value;

    if (!sym) throw new Error('Enter a symbol');

    let data, dataSrcLabel = 'Unknown';
    console.log(`[Backtest] Starting data fetch for ${sym}`);

    const MIN_BARS = 15;
    const HIST_DAYS = 90;
    const delay = ms => new Promise(r => setTimeout(r, ms));

    // 1) If the symbol is already loaded in the chart with enough bars, use that
    if (typeof rawData !== 'undefined' && rawData && rawData.length >= MIN_BARS && curSym === sym) {
      data = rawData.slice();
      dataSrcLabel = 'Live';
      st.textContent = 'Using live data…';
      console.log(`[Backtest] Using live chart data: ${data.length} bars`);
    }

    // 2) Try EODHD first (most reliable for free-tier historical EOD)
    if (!data || data.length < MIN_BARS) {
      if (typeof fetchEODHDHistory === 'function' && typeof EODHD_KEY !== 'undefined' && EODHD_KEY) {
        st.textContent = 'Fetching history from EODHD…';
        console.log(`[Backtest] Trying EODHD history for ${sym}…`);
        try {
          const eodData = await fetchEODHDHistory(sym, HIST_DAYS);
          if (eodData && eodData.length >= MIN_BARS) {
            data = eodData;
            dataSrcLabel = 'EODHD History';
            console.log(`[Backtest] EODHD returned ${data.length} bars`);
          } else {
            console.log(`[Backtest] EODHD returned insufficient data: ${eodData ? eodData.length : 0} bars`);
          }
        } catch (e) { console.warn('[Backtest] EODHD error:', e.message); }
      }
    }

    // 3) Try Massive history
    if (!data || data.length < MIN_BARS) {
      await delay(300);
      if (typeof fetchMassiveHistory === 'function' && typeof MASSIVE_KEY !== 'undefined' && MASSIVE_KEY) {
        st.textContent = 'Fetching history from Massive…';
        console.log(`[Backtest] Trying Massive history for ${sym}…`);
        try {
          const mvData = await fetchMassiveHistory(sym, HIST_DAYS);
          if (mvData && mvData.length >= MIN_BARS) {
            data = mvData;
            dataSrcLabel = 'Massive History';
            console.log(`[Backtest] Massive returned ${data.length} bars`);
          } else {
            console.log(`[Backtest] Massive returned insufficient data: ${mvData ? mvData.length : 0} bars`);
          }
        } catch (e) { console.warn('[Backtest] Massive error:', e.message); }
      }
    }

    // 4) Try Finnhub historical candles as last resort
    if (!data || data.length < MIN_BARS) {
      await delay(300);
      if (typeof fetchFinnhubCandles === 'function' && typeof KEY !== 'undefined' && KEY) {
        st.textContent = 'Fetching candles from Finnhub…';
        console.log(`[Backtest] Trying Finnhub candles for ${sym}…`);
        try {
          const fhData = await fetchFinnhubCandles(sym, HIST_DAYS);
          if (fhData && fhData.length >= MIN_BARS) {
            data = fhData;
            dataSrcLabel = 'Finnhub Daily';
            console.log(`[Backtest] Finnhub returned ${data.length} bars`);
          } else {
            console.log(`[Backtest] Finnhub returned insufficient data: ${fhData ? fhData.length : 0} bars`);
          }
        } catch (e) { console.warn('[Backtest] Finnhub error:', e.message); }
      }
    }

    // 5) Still no data — error with actionable guidance
    if (!data || data.length < MIN_BARS) {
      console.error(`[Backtest] All data sources failed for ${sym}`);
      st.textContent = `⚠ Not enough data for ${sym}. APIs may be rate-limited — wait 30s and retry. Check F12 console.`;
      btn.disabled = false;
      btn.innerHTML = '▶ Run strategy';
      return;
    }

    st.textContent = 'Computing indicators…';
    const ind = preInd(data);

    st.textContent = 'Generating signals…';
    const sigs = genSigs(data, ind);

    st.textContent = 'Simulating…';
    const { eq, trades } = simulate(data, sigs, cap, psz, com);
    const bhs = data[0].close;
    eq.forEach((e, i) => { e.bh = cap * (data[i]?.close || bhs) / bhs; });

    st.textContent = 'Computing analytics…';
    const a = cAnalytics(eq, trades, cap);
    lastBT = { eq, trades, analytics: a, cap, sym, strat: curStrat, from2: dataSrcLabel, to2: dataSrcLabel };
    st.textContent = `${dataSrcLabel} · ${data.length} bars · ${trades.length} trades`;
    renderBT(eq, a.dds, trades, a, cap);
    renderAnalytics();
  } catch (e) {
    st.textContent = '⚠ ' + e.message;
  }
  btn.disabled = false;
  btn.innerHTML = '▶ Run strategy';
}

// ── RENDER RESULTS ───────────────────
function renderBT(eq, dds, trades, a, cap) {
  document.getElementById('empty').style.display = 'none';
  const rc = document.getElementById('rc');
  rc.style.display = 'flex';

  const { tr, cagr, mdd, mdda, sharpe, wr, aw, al: al2, pf, fv, yr } = a;
  const pct = v => (v >= 0 ? '+' : '') + v.toFixed(2) + '%';
  const mn  = v => (v >= 0 ? '+$' : '-$') + Math.abs(v).toFixed(0);

  sc('sr',  pct(tr),  tr >= 0 ? 'pos' : 'neg');  document.getElementById('sra').textContent = mn(fv - cap);
  sc('ssh', sharpe.toFixed(2), sharpe >= 1 ? 'pos' : sharpe >= 0 ? 'neu' : 'neg');
  sc('smd', pct(mdd), 'neg');                     document.getElementById('smda').textContent = mn(mdda);
  sc('sc2', pct(cagr), cagr >= 0 ? 'pos' : 'neg'); document.getElementById('sy').textContent = yr.toFixed(1) + ' years';
  sc('st2', trades.length, 'neu');
  sc('swr', wr.toFixed(1) + '%', wr >= 50 ? 'pos' : 'neg');
  sc('saw', '+' + aw.toFixed(2) + '%', 'pos');
  sc('sal', al2.toFixed(2) + '%', 'neg');
  sc('spf', isFinite(pf) ? pf.toFixed(2) : '∞', pf >= 1.5 ? 'pos' : pf >= 1 ? 'neu' : 'neg');

  // Defer chart creation by one frame so the flex layout has settled
  // and el.clientWidth / el.clientHeight return real pixel values.
  setTimeout(() => {
    buildEqChart(eq, cap);
    buildDDChart(dds);
  }, 50);

  const tb = document.getElementById('tbody');
  tb.innerHTML = '';
  document.getElementById('tcnt').textContent = `${trades.length} trades`;
  trades.forEach((t, i) => {
    const tr2 = document.createElement('tr');
    tr2.innerHTML = `
      <td>${i+1}</td>
      <td style="color:${t.open ? 'var(--b)' : 'var(--dim)'}">${t.open ? 'OPEN' : 'ROUND'}</td>
      <td>${fDate(t.entryTime)}</td>
      <td>$${t.entryPrice.toFixed(2)}</td>
      <td>${fDate(t.exitTime)}</td>
      <td>$${t.exitPrice.toFixed(2)}</td>
      <td class="tp ${t.ret >= 0 ? 'pos' : 'neg'}">${t.ret >= 0 ? '+' : ''}${t.ret.toFixed(2)}%</td>
      <td class="tp ${t.pnl >= 0 ? 'pos' : 'neg'}">${t.pnl >= 0 ? '+$' : '-$'}${Math.abs(t.pnl).toFixed(2)}</td>`;
    tb.appendChild(tr2);
  });
}

function sc(id, v, cls) {
  const el = document.getElementById(id);
  el.textContent = v;
  el.className = 'sv ' + cls;
  if (['st2','swr','saw','sal','spf'].includes(id)) el.style.fontSize = '13px';
}

// ── CHART BUILDERS ───────────────────
function buildEqChart(eq, cap) {
  const el = document.getElementById('ep');
  if (eqC) { try { eqC.remove(); } catch (e) {} }
  eqC = LightweightCharts.createChart(el, { ...BCO, width: el.clientWidth, height: el.clientHeight });

  // Buy & hold reference
  bhS = eqC.addLineSeries({ color: '#252b38', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
  bhS.setData(eq.map(e => ({ time: e.time, value: e.bh ?? e.value })));

  // Capital baseline
  eqC.addLineSeries({ color: '#252b3860', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false })
     .setData([{ time: eq[0].time, value: cap }, { time: eq[eq.length-1].time, value: cap }]);

  // Strategy equity
  eqS = eqC.addLineSeries({ color: '#00e5a0', lineWidth: 2, priceLineVisible: false });
  eqS.setData(eq);
  eqC.subscribeCrosshairMove(p => {
    if (!p.time) return;
    const d = p.seriesData.get(eqS);
    if (d) document.getElementById('eqv').textContent = '  $' + d.value.toFixed(0);
  });
  eqC.timeScale().fitContent();
  new ResizeObserver(() => {
    if (eqC) eqC.applyOptions({ width: el.clientWidth, height: el.clientHeight });
  }).observe(el);
}

function buildDDChart(dds) {
  const el = document.getElementById('dp');
  if (ddC) { try { ddC.remove(); } catch (e) {} }
  ddC = LightweightCharts.createChart(el, {
    ...BCO, width: el.clientWidth, height: el.clientHeight,
    timeScale: { visible: false, borderColor: '#181c24' }
  });
  ddS2 = ddC.addAreaSeries({ lineColor: '#ff3d5a', topColor: '#ff3d5a15', bottomColor: '#ff3d5a00', lineWidth: 1.5, priceLineVisible: false });
  ddS2.setData(dds);
  ddC.timeScale().fitContent();
  eqC.timeScale().subscribeVisibleLogicalRangeChange(r => { if (r && ddC) ddC.timeScale().setVisibleLogicalRange(r); });
  ddC.subscribeCrosshairMove(p => {
    if (!p.time) return;
    const d = p.seriesData.get(ddS2);
    if (d) document.getElementById('ddv').textContent = '  ' + d.value.toFixed(2) + '%';
  });
  new ResizeObserver(() => {
    if (ddC) ddC.applyOptions({ width: el.clientWidth, height: el.clientHeight });
  }).observe(el);
}

// ── EXPORT CSV ───────────────────────
function exportCSV() {
  if (!lastBT) return;
  const { trades, sym } = lastBT;
  const rows = [['#','Type','Entry Date','Entry $','Exit Date','Exit $','Return %','P&L $']];
  trades.forEach((t, i) => rows.push([
    i+1, t.open ? 'OPEN' : 'ROUND',
    fDate(t.entryTime), t.entryPrice.toFixed(2),
    fDate(t.exitTime),  t.exitPrice.toFixed(2),
    t.ret.toFixed(2),   t.pnl.toFixed(2)
  ]));
  const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${sym}_backtest.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
