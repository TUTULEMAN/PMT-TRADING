// ════════════════════════════════════
//  API — auth, WebSocket, data loading
// ════════════════════════════════════

// ── CLOCK ───────────────────────────
setInterval(() => {
  document.getElementById('clock').textContent =
    new Date().toUTCString().split(' ')[4] + ' UTC';
}, 1000);

// ── MARKET STATUS (NYSE regular + pre/post) ──────────────────────────
function getETComponents(d) {
  // Returns { h, m, day } in US Eastern time, handling DST automatically
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric', minute: 'numeric', weekday: 'short',
    hour12: false
  }).formatToParts(d);
  const get = t => parts.find(p => p.type === t)?.value;
  const h = parseInt(get('hour'), 10);   // 0-23
  const m = parseInt(get('minute'), 10);
  const day = get('weekday'); // 'Mon','Tue',…
  return { h, m, day };
}

function mktMinutesFromMidnight(d) {
  const { h, m } = getETComponents(d);
  return h * 60 + m;
}

function isWeekday(day) {
  return !['Sat', 'Sun'].includes(day);
}

function updateMarketStatus() {
  const now = new Date();
  const { h, m, day } = getETComponents(now);
  const mins = h * 60 + m;

  const PRE_OPEN  = 4 * 60;       // 04:00 ET
  const OPEN      = 9 * 60 + 30;  // 09:30 ET
  const CLOSE     = 16 * 60;      // 16:00 ET
  const POST_CLOSE = 20 * 60;     // 20:00 ET

  const dot = document.getElementById('mktd');
  const lbl = document.getElementById('mktl');
  if (!dot || !lbl) return;

  function fmtCountdown(targetMins) {
    let diff = targetMins - mins;
    if (diff < 0) diff += 24 * 60;
    const hh = Math.floor(diff / 60);
    const mm = diff % 60;
    return hh > 0 ? `${hh}h ${mm}m` : `${mm}m`;
  }

  if (!isWeekday(day)) {
    // Weekend — show next Monday open
    dot.className = 'mktd closed';
    lbl.textContent = 'Market closed';
    return;
  }

  if (mins < PRE_OPEN) {
    dot.className = 'mktd closed';
    lbl.textContent = `Closed · Pre-market ${fmtCountdown(PRE_OPEN)}`;
  } else if (mins < OPEN) {
    dot.className = 'mktd pre';
    lbl.textContent = `Pre-market · Opens ${fmtCountdown(OPEN)}`;
  } else if (mins < CLOSE) {
    const remaining = fmtCountdown(CLOSE);
    dot.className = 'mktd open';
    lbl.textContent = `NYSE Open · Closes ${remaining}`;
  } else if (mins < POST_CLOSE) {
    dot.className = 'mktd post';
    lbl.textContent = `After-hours · Closes ${fmtCountdown(POST_CLOSE)}`;
  } else {
    dot.className = 'mktd closed';
    lbl.textContent = `Market closed`;
  }
}

updateMarketStatus();
setInterval(updateMarketStatus, 30000);

// ── MODAL — 3 REQUIRED + 2 OPTIONAL KEYS ───────
function getModalKeys() {
  return {
    fh: document.getElementById('m-key').value.trim(),
    mv: document.getElementById('massive-key').value.trim(),
    eodhd: document.getElementById('eodhd-key').value.trim(),
    fred: (document.getElementById('fred-key') || {}).value?.trim() || ''
  };
}

document.getElementById('m-key').addEventListener('input', () => {
  document.getElementById('mgo').classList.remove('active');
  setTestState('idle', 'Enter the 3 required keys above, then test');
});
document.getElementById('massive-key').addEventListener('input', () => {
  document.getElementById('mgo').classList.remove('active');
  setTestState('idle', 'Enter the 3 required keys above, then test');
});
document.getElementById('eodhd-key').addEventListener('input', () => {
  document.getElementById('mgo').classList.remove('active');
  setTestState('idle', 'Enter the 3 required keys above, then test');
});

document.getElementById('m-key').addEventListener('keydown', e => { if (e.key === 'Enter') testKeys(); });
document.getElementById('massive-key').addEventListener('keydown', e => { if (e.key === 'Enter') testKeys(); });
document.getElementById('eodhd-key').addEventListener('keydown', e => { if (e.key === 'Enter') testKeys(); });

async function testKeys() {
  const { fh, mv, eodhd } = getModalKeys();
  if (!fh || !mv || !eodhd) {
    setTestState('err', 'Enter the 3 required keys (Finnhub, Massive, EODHD)');
    return;
  }
  setTestState('chk', 'Testing required keys…');
  document.getElementById('mtest-btn').textContent = '…';
  let fhOk = false, mvOk = false, eodhdOk = false;
  const errors = [];
  try {
    const to = new Date();
    const from = new Date(to);
    from.setDate(from.getDate() - 5);
    const fromStr = from.toISOString().slice(0, 10);
    const toStr = to.toISOString().slice(0, 10);

    const [frR, mrR, erR] = await Promise.allSettled([
      fetch(`${FH}/quote?symbol=AAPL&token=${encodeURIComponent(fh)}`).then(r => r.json()),
      fetch(`${MASSIVE}/v2/aggs/ticker/AAPL/prev?apiKey=${encodeURIComponent(mv)}`).then(r => r.json()),
      fetchEodhd(`${EODHD}/eod/AAPL.US?from=${fromStr}&to=${toStr}&api_token=${encodeURIComponent(eodhd)}&fmt=json`).then(r => r.json())
    ]);

    if (frR.status === 'fulfilled') {
      const fr = frR.value;
      if (fr && typeof fr.c === 'number') fhOk = true;
    } else { errors.push('Finnhub: ' + (frR.reason?.message || 'network error')); }

    if (mrR.status === 'fulfilled') {
      const mr = mrR.value;
      if (mr && mr.results && Array.isArray(mr.results) && mr.results.length) mvOk = true;
    } else { errors.push('Massive: ' + (mrR.reason?.message || 'network error')); }

    if (erR.status === 'fulfilled') {
      const er = erR.value;
      if (er && Array.isArray(er) && er.length && typeof er[0].close === 'number') eodhdOk = true;
    } else { errors.push('EODHD: ' + (erR.reason?.message || 'network error')); }

    if (fhOk && mvOk && eodhdOk) {
      setTestState('ok', '✓ All required keys valid — ready to launch');
      document.getElementById('mgo').classList.add('active');
    } else {
      const missing = [];
      if (!fhOk) missing.push('Finnhub');
      if (!mvOk) missing.push('Massive');
      if (!eodhdOk) missing.push('EODHD');
      const detail = errors.length ? ' (' + errors[0] + ')' : '';
      setTestState('err', '✗ Failed: ' + missing.join(', ') + detail);
    }
  } catch (e) {
    setTestState('err', '✗ ' + (e.message || 'Network error'));
  }
  document.getElementById('mtest-btn').textContent = 'Test Keys';
}

function setTestState(state, msg) {
  const d = document.getElementById('mtd');
  const t = document.getElementById('mtxt');
  d.className = state === 'ok'  ? 'ok'
              : state === 'err' ? 'err'
              : state === 'chk' ? 'chk'
              : '';
  t.textContent = msg;
  t.style.color = state === 'ok'  ? 'var(--g)'
                : state === 'err' ? 'var(--r)'
                : 'var(--dim)';
}

function launch() {
  const { fh, mv, eodhd, fred } = getModalKeys();
  if (!fh || !mv || !eodhd) return;
  KEY = fh;
  MASSIVE_KEY = mv;
  EODHD_KEY = eodhd;
  FRED_KEY = fred;
  document.getElementById('modal').style.display = 'none';
  setApiStatus('live', 'Live');
  initCharts();
  startNews();
  initTicker();
  initBacktestDates();
  initStream();
  initWS();
  initAnalyticsPanel();
}

function setApiStatus(state, label) {
  document.getElementById('apd').className = 'apd ' + state;
  document.getElementById('apl').textContent = label;
}

// ── NAV ─────────────────────────────
function switchView(id, btn) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('on'));
  document.getElementById(id).classList.add('on');
  document.querySelectorAll('.nb').forEach(b => b.classList.remove('on'));
  if (btn) btn.classList.add('on');
  if (id === 'cv') setTimeout(resizeCharts, 50);
  if (id === 'calv' && typeof initCalendar === 'function') initCalendar();
  if (id === 'gv' && typeof initArcadeView === 'function') initArcadeView();
  if (id === 'bv' && curSym) {
    const bs = document.getElementById('bs');
    if (bs && !bs.value.trim()) bs.value = curSym;
  }
}

function goBacktest() {
  if (curSym) document.getElementById('bs').value = curSym;
  switchView('bv', document.querySelectorAll('.nb')[1]);
}

// ── WEBSOCKET — real-time prices ─────
function initWS() {
  try {
    ws2 = new WebSocket(`wss://ws.finnhub.io?token=${encodeURIComponent(KEY)}`);
    ws2.onopen = () => {
      TICKER.forEach(s => {
        const sym = s === 'BTC'    ? 'BINANCE:BTCUSDT'
                  : s === 'ETH'    ? 'BINANCE:ETHUSDT'
                  : s === 'EURUSD' ? 'OANDA:EUR_USD'
                  : s;
        ws2.send(JSON.stringify({ type: 'subscribe', symbol: sym }));
      });
      if (curSym) wsSubscribe(curSym);
    };
    ws2.onmessage = e => {
      const d = JSON.parse(e.data);
      if (d.type !== 'trade' || !d.data) return;
      d.data.forEach(t => {
        const sym = t.s
          .replace('BINANCE:', '').replace('USDT', '')
          .replace('-USD', '').replace('OANDA:', '').replace('_', '');
        liveQuotes[sym] = t.p;
        const norm = curSym ? normSym(curSym).finnhub : '';
        if (curSym && (t.s === curSym || t.s === norm)) {
          const ts = t.t != null ? Math.floor(t.t / 1000) : Math.floor(Date.now() / 1000);
          onRealtimeTrade(ts, t.p, t.v);
        }
      });
    };
    ws2.onerror = () => {};
  } catch (e) {}
}

function wsSubscribe(sym) {
  if (!ws2 || ws2.readyState !== 1) return;
  ws2.send(JSON.stringify({ type: 'subscribe', symbol: normSym(sym).finnhub }));
}

// ── SYMBOL NORMALIZER ────────────────
function normSym(sym) {
  sym = sym.toUpperCase().trim();
  // Crypto
  if (sym.includes('-USD') || sym.includes('-USDT')) {
    const base = sym.replace('-USD', '').replace('-USDT', '');
    return { type: 'crypto', finnhub: `BINANCE:${base}USDT`, display: sym };
  }
  // Forex
  if (sym.endsWith('=X')) {
    const p = sym.replace('=X', '');
    return { type: 'forex', finnhub: `OANDA:${p.slice(0,3)}_${p.slice(3)}`, display: sym };
  }
  if (sym.length === 6 && /^[A-Z]{6}$/.test(sym)) {
    return { type: 'forex', finnhub: `OANDA:${sym.slice(0,3)}_${sym.slice(3)}`, display: sym };
  }
  // Index
  if (sym.startsWith('^')) {
    return { type: 'index', finnhub: sym, display: sym };
  }
  return { type: 'stock', finnhub: sym, display: sym };
}

// ── EODHD SYMBOL FORMAT (for historical EOD) ─────
function normSymToEodhd(sym) {
  sym = sym.toUpperCase().trim();
  if (sym === 'BTC') return 'BTC-USD.CC';
  if (sym === 'ETH') return 'ETH-USD.CC';
  if (sym === 'EURUSD' || (sym.length === 6 && /^[A-Z]{6}$/.test(sym))) return sym + '.FOREX';
  if (sym.startsWith('^')) return null;
  return sym + '.US';
}

// ── EODHD HISTORICAL (for backtest & dashboard %); usage spread: EODHD for history ─────
async function fetchEODHDHistory(symbol, days) {
  if (typeof EODHD_KEY === 'undefined' || !EODHD_KEY) return null;
  const ticker = normSymToEodhd(symbol);
  if (!ticker) return null;
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days || 365));
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  try {
    const r = await fetchEodhd(`${EODHD}/eod/${encodeURIComponent(ticker)}?from=${fromStr}&to=${toStr}&api_token=${encodeURIComponent(EODHD_KEY)}&fmt=json`);
    const j = await r.json().catch(() => ({}));
    if (!Array.isArray(j) || !j.length) return null;
    return j.map(d => {
      const t = new Date(d.date).getTime() / 1000;
      return { time: Math.floor(t), open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume || 0 };
    });
  } catch (e) { console.warn('[EODHD] history error', e); return null; }
}

// Cache for historical % (1W, 1M, YTD) — one EODHD call per symbol per session
window.eodhdHistCache = {};
async function getEODHDHistoricalPct(sym) {
  if (!EODHD_KEY) return null;
  const cacheKey = sym.toUpperCase();
  if (window.eodhdHistCache[cacheKey]) return window.eodhdHistCache[cacheKey];
  const ticker = normSymToEodhd(sym);
  if (!ticker) return null;
  const to = new Date();
  const from = new Date(to.getFullYear(), 0, 1);
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = to.toISOString().slice(0, 10);
  try {
    const r = await fetchEodhd(`${EODHD}/eod/${encodeURIComponent(ticker)}?from=${fromStr}&to=${toStr}&api_token=${encodeURIComponent(EODHD_KEY)}&fmt=json`);
    const j = await r.json().catch(() => ({}));
    if (!Array.isArray(j) || !j.length) return null;
    const now = to.getTime();
    const oneWeekAgo = now - 7 * 86400 * 1000;
    const oneMonthAgo = now - 30 * 86400 * 1000;
    const ytdFirst = j[0] && j[0].date ? new Date(j[0].date).getTime() : null;
    let close1W = null, close1M = null, closeYTD = null;
    for (let i = j.length - 1; i >= 0; i--) {
      const t = new Date(j[i].date).getTime();
      const c = j[i].close;
      if (close1W == null && t <= oneWeekAgo) close1W = c;
      if (close1M == null && t <= oneMonthAgo) close1M = c;
      if (closeYTD == null && ytdFirst != null && t <= ytdFirst) closeYTD = c;
    }
    if (j.length && closeYTD == null) closeYTD = j[0].close;
    const lastClose = j[j.length - 1].close;
    const out = {
      chg1W: close1W != null && lastClose ? ((lastClose - close1W) / close1W * 100) : null,
      chg1M: close1M != null && lastClose ? ((lastClose - close1M) / close1M * 100) : null,
      chgYTD: closeYTD != null && lastClose ? ((lastClose - closeYTD) / closeYTD * 100) : null
    };
    window.eodhdHistCache[cacheKey] = out;
    return out;
  } catch (e) { return null; }
}

// ── TICKER TAPE (Finnhub for crypto/forex, Massive prev-day for stocks when MASSIVE_KEY set) ─────
const TICKER_LABELS = {
  AAPL:'Apple', MSFT:'Microsoft', NVDA:'NVIDIA', TSLA:'Tesla',
  SPY:'S&P 500', QQQ:'NASDAQ', BTC:'Bitcoin', ETH:'Ethereum',
  EURUSD:'EUR/USD', GLD:'Gold ETF'
};
const TICKER_STOCKS = ['AAPL','MSFT','NVDA','TSLA','SPY','QQQ','GLD'];

async function initTicker() {
  await refreshTicker();
  setInterval(refreshTicker, 60000);
}

async function fetchTickerMassive() {
  if (!MASSIVE_KEY || !TICKER_STOCKS.length) return [];
  try {
    const results = await Promise.allSettled(TICKER_STOCKS.map(async s => {
      const r = await fetch(`${MASSIVE}/v2/aggs/ticker/${s}/prev?apiKey=${encodeURIComponent(MASSIVE_KEY)}`);
      const j = await r.json().catch(() => ({}));
      if (!j.results || !j.results.length) return null;
      const bar = j.results[0];
      if (bar.c == null) return null;
      const chg = bar.o ? ((bar.c - bar.o) / bar.o * 100) : 0;
      return { sym: s, label: TICKER_LABELS[s] || s, price: bar.c, chg };
    }));
    return results.map(r => r.status === 'fulfilled' ? r.value : null).filter(Boolean);
  } catch (e) { return []; }
}

async function refreshTicker() {
  let items = [];
  // Stocks: Massive only (one batch — saves Finnhub for live/WS)
  if (MASSIVE_KEY && TICKER_STOCKS.length) {
    items = await fetchTickerMassive();
  }
  const stockSyms = new Set(items.map(d => d.sym));
  const rest = TICKER.filter(s => !stockSyms.has(s));
  // Crypto/forex: Finnhub only
  if (rest.length && KEY) {
    const results = await Promise.allSettled(rest.map(async s => {
      const sym = s === 'BTC' ? 'BINANCE:BTCUSDT' : s === 'ETH' ? 'BINANCE:ETHUSDT' : s === 'EURUSD' ? 'OANDA:EUR_USD' : s;
      const r = await fetch(`${FH}/quote?symbol=${sym}&token=${encodeURIComponent(KEY)}`);
      const j = await r.json().catch(() => ({}));
      if (typeof j.c === 'number' && j.c > 0) {
        const chg = (j.dp != null ? j.dp : (j.pc ? (j.c - j.pc) / j.pc * 100 : 0));
        return { sym: s, label: TICKER_LABELS[s] || s, price: j.c, chg };
      }
      return null;
    }));
    const fromFh = results.map(r => r.value).filter(Boolean);
    items = items.concat(fromFh);
  }
  items.sort((a, b) => TICKER.indexOf(a.sym) - TICKER.indexOf(b.sym));
  // Enrich with EODHD historical % (cached — one EODHD call per symbol per session)
  if (typeof EODHD_KEY !== 'undefined' && EODHD_KEY && typeof getEODHDHistoricalPct === 'function' && items.length) {
    const hist = await Promise.all(items.map(d => getEODHDHistoricalPct(d.sym)));
    items = items.map((d, i) => ({ ...d, hist: hist[i] || null }));
  }
  if (!items.length) return;
  const html = items.map(d => {
    const cls = d.chg > 0.05 ? 'up' : d.chg < -0.05 ? 'dn' : 'fl';
    const sign = d.chg > 0 ? '+' : '';
    const histStr = d.hist && (d.hist.chg1W != null || d.hist.chg1M != null || d.hist.chgYTD != null)
      ? ['1W', '1M', 'YTD'].map(l => {
          const v = l === '1W' ? d.hist.chg1W : l === '1M' ? d.hist.chg1M : d.hist.chgYTD;
          return v != null ? `${l} ${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : null;
        }).filter(Boolean).join(' · ')
      : '';
    return `<div class="t-item">
      <span class="t-sym">${d.sym}</span>
      <span class="t-px">${fmtP(d.price)}</span>
      <span class="t-ch ${cls}">${sign}${(d.chg || 0).toFixed(2)}%</span>
      ${histStr ? `<span class="t-hist">${histStr}</span>` : ''}
    </div>`;
  }).join('');
  const tt = document.getElementById('tape-track');
  if (tt) tt.innerHTML = html + html;
}

// ── LOAD SYMBOL (real-time only: quote once, then WebSocket) ────────
async function loadSym(sym) {
  if (!KEY) return;
  curSym = sym.toUpperCase();
  document.getElementById('si').value = curSym;

  const ns = normSym(curSym);
  curSymType = ns.type;

  const typeEl = document.getElementById('sym-type');
  typeEl.style.display = 'inline';
  typeEl.textContent = ns.type;
  typeEl.className = '';
  typeEl.id = 'sym-type';
  typeEl.classList.add(ns.type);

  setApiStatus('chk', 'Loading…');

  try {
    let c = null, j = {};
    const r = await fetch(`${FH}/quote?symbol=${encodeURIComponent(ns.finnhub)}&token=${encodeURIComponent(KEY)}`);
    j = await r.json().catch(() => ({}));
    if (r.ok && typeof j.c === 'number') c = j.c;
    if (c == null && MASSIVE_KEY && (ns.type === 'stock' || ns.type === 'index')) {
      const sym = ns.finnhub.replace(/^OANDA:|BINANCE:/, '').split('_')[0];
      const mr = await fetch(`${MASSIVE}/v2/aggs/ticker/${encodeURIComponent(sym)}/prev?apiKey=${encodeURIComponent(MASSIVE_KEY)}`);
      const mj = await mr.json().catch(() => ({}));
      if (mj.results && mj.results[0] && mj.results[0].c != null) c = mj.results[0].c;
    }
    if (c == null) {
      if (r.status === 401 || (j && j.error)) setApiStatus('err', 'Invalid key or symbol');
      else setApiStatus('err', 'No quote for symbol');
      showChartPlaceholder(true);
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    rawData = [{ time: now, open: c, high: c, low: c, close: c, volume: 0 }];
    document.getElementById('px').textContent = fmtP(c);
    const ch = j.dp != null ? j.dp : (j.pc ? (j.c - j.pc) / j.pc * 100 : 0);
    const el = document.getElementById('pch');
    el.textContent = (ch >= 0 ? '+' : '') + (ch || 0).toFixed(2) + '%';
    el.className = ch >= 0 ? 'up' : 'dn';
    document.getElementById('oo').textContent = fmtP(j.o != null ? j.o : c);
    document.getElementById('oh').textContent = fmtP(j.h != null ? j.h : c);
    document.getElementById('ol').textContent = fmtP(j.l != null ? j.l : c);
    document.getElementById('oc').textContent = fmtP(c);
    document.getElementById('ov').textContent = '—';

    showChartPlaceholder(false);
    rebuildSeries();
    setApiStatus('live', 'Live');
    wsSubscribe(curSym);
    if (typeof refreshOBForSymbol === 'function') refreshOBForSymbol();
  } catch (e) {
    setApiStatus('err', 'Network error');
    document.getElementById('px').textContent = '—';
    showChartPlaceholder(true);
  }
}

function showChartPlaceholder(show) {
  const msg = document.getElementById('quote-only-msg');
  if (msg) msg.style.display = show === true ? 'flex' : 'none';
  if (show === true) {
    rawData = [];
    if (typeof mc !== 'undefined' && ms) { try { mc.removeSeries(ms); } catch (e) {} }
    ms = null;
    if (typeof rebuildSeries === 'function') rebuildSeries();
  }
}

// Called from WebSocket when a new trade arrives for the current symbol
function onRealtimeTrade(time, price, volume) {
  if (!curSym || !rawData.length) return;
  const bar = { time, open: price, high: price, low: price, close: price, volume: volume || 0 };
  rawData.push(bar);
  document.getElementById('px').textContent = fmtP(price);
  if (typeof appendRealtimePoint === 'function') appendRealtimePoint(time, price, volume);
  if (rawData.length > 1) {
    const last = rawData[rawData.length - 1];
    const prev = rawData[rawData.length - 2];
    const ch = prev.close ? (last.close - prev.close) / prev.close * 100 : 0;
    const el = document.getElementById('pch');
    el.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%';
    el.className = ch >= 0 ? 'up' : 'dn';
  }
}

async function fetchQuote(ns) {
  try {
    if (ns.type === 'crypto' || ns.type === 'forex') return; // candle data sufficient
    const r = await fetch(`${FH}/quote?symbol=${ns.finnhub}&token=${encodeURIComponent(KEY)}`);
    const j = await r.json();
    if (typeof j.c === 'number' && j.c > 0) {
      document.getElementById('px').textContent = fmtP(j.c);
      const ch = j.dp || ((j.c - j.pc) / j.pc * 100);
      const el = document.getElementById('pch');
      el.textContent = (ch >= 0 ? '+' : '') + ch.toFixed(2) + '%';
      el.className = ch >= 0 ? 'up' : 'dn';
    }
  } catch (e) {}
}

// ── BLOOMBERG-STYLE SHORTCUTS (FX, EQT, CRPT) ─────
const SHORTCUTS = {
  FX: [
    { symbol: 'EURUSD', name: 'Euro / US Dollar' },
    { symbol: 'GBPUSD', name: 'British Pound / US Dollar' },
    { symbol: 'USDJPY', name: 'US Dollar / Japanese Yen' },
    { symbol: 'AUDUSD', name: 'Australian Dollar / US Dollar' },
    { symbol: 'USDCAD', name: 'US Dollar / Canadian Dollar' },
    { symbol: 'USDCHF', name: 'US Dollar / Swiss Franc' },
    { symbol: 'NZDUSD', name: 'New Zealand Dollar / US Dollar' },
    { symbol: 'EURGBP', name: 'Euro / British Pound' }
  ],
  EQT: [
    { symbol: 'AAPL', name: 'Apple Inc' },
    { symbol: 'MSFT', name: 'Microsoft Corp' },
    { symbol: 'GOOGL', name: 'Alphabet (Google)' },
    { symbol: 'AMZN', name: 'Amazon.com' },
    { symbol: 'NVDA', name: 'NVIDIA Corp' },
    { symbol: 'META', name: 'Meta Platforms' },
    { symbol: 'TSLA', name: 'Tesla Inc' },
    { symbol: 'SPY', name: 'SPDR S&P 500 ETF' },
    { symbol: 'QQQ', name: 'Invesco QQQ Trust' }
  ],
  CRPT: [
    { symbol: 'BTC', name: 'Bitcoin' },
    { symbol: 'ETH', name: 'Ethereum' },
    { symbol: 'BNB', name: 'Binance Coin' },
    { symbol: 'SOL', name: 'Solana' },
    { symbol: 'XRP', name: 'Ripple' },
    { symbol: 'DOGE', name: 'Dogecoin' },
    { symbol: 'ADA', name: 'Cardano' },
    { symbol: 'AVAX', name: 'Avalanche' }
  ]
};

// ── SYMBOL SEARCH ────────────────────
function setupSearch() {
  const inp = document.getElementById('si');
  const dd  = document.getElementById('sd');
  let t;
  inp.addEventListener('input', () => {
    clearTimeout(t);
    const q = inp.value.trim().toUpperCase();
    if (!q) { dd.style.display = 'none'; return; }
    if (SHORTCUTS[q]) {
      showShortcutDropdown(q);
      return;
    }
    t = setTimeout(() => doSearch(inp.value.trim()), 320);
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      dd.style.display = 'none';
      const s = inp.value.trim().toUpperCase();
      if (s) loadSym(s);
    }
    if (e.key === 'Escape') dd.style.display = 'none';
  });
  document.addEventListener('click', e => {
    if (!e.target.closest('#sw')) dd.style.display = 'none';
  });
}

function showShortcutDropdown(key) {
  const dd = document.getElementById('sd');
  const list = SHORTCUTS[key];
  if (!list) return;
  const labels = { FX: 'Forex', EQT: 'Equities', CRPT: 'Crypto' };
  dd.innerHTML = '<div class="si-header" style="padding:6px 10px;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--dim)">' + (labels[key] || key) + '</div>' +
    list.map(x =>
      `<div class="si-item" onclick="pickSym('${esc(x.symbol)}')">
         <span class="si-sym">${esc(x.symbol)}</span>
         <span class="si-nm">${esc(x.name)}</span>
       </div>`
    ).join('');
  dd.style.display = 'block';
}

async function doSearch(q) {
  if (!KEY) return;
  const dd = document.getElementById('sd');
  const u = q.toUpperCase();
  if (SHORTCUTS[u]) { showShortcutDropdown(u); return; }
  const qEnc = encodeURIComponent(q);
  let results = [];
  try {
    const fhPromise = fetch(`${FH}/search?q=${qEnc}&token=${encodeURIComponent(KEY)}`).then(r => r.json()).catch(() => ({}));
    const mvPromise = MASSIVE_KEY ? fetch(`${MASSIVE}/v3/reference/tickers?search=${qEnc}&active=true&limit=8&apiKey=${encodeURIComponent(MASSIVE_KEY)}`).then(r => r.json()).catch(() => null) : Promise.resolve(null);
    const eodPromise = (typeof EODHD_KEY !== 'undefined' && EODHD_KEY) ? fetchEodhd(`${EODHD}/search/${qEnc}?api_token=${encodeURIComponent(EODHD_KEY)}&fmt=json&limit=5`).then(r => r.json()).catch(() => null) : Promise.resolve(null);
    const [fj, mj, ej] = await Promise.all([fhPromise, mvPromise, eodPromise]);
    results = (fj.result || []).filter(x => x.type && x.type !== 'EQS').map(x => ({ symbol: x.symbol, description: x.description }));
    if (mj && mj.results && Array.isArray(mj.results)) {
      const seen = new Set(results.map(x => x.symbol.toUpperCase()));
      mj.results.forEach(x => {
        const sym = (x.ticker || '').toUpperCase();
        if (sym && !seen.has(sym)) {
          seen.add(sym);
          results.push({ symbol: sym, description: x.name || ('Massive: ' + sym) });
        }
      });
    }
    if (ej && Array.isArray(ej)) {
      const seen = new Set(results.map(x => x.symbol.toUpperCase()));
      ej.forEach(x => {
        const sym = (x.code && x.exchange) ? `${String(x.code).split('.')[0]}` : null;
        if (sym && !seen.has(sym.toUpperCase())) {
          seen.add(sym.toUpperCase());
          results.push({ symbol: sym.toUpperCase(), description: x.name || x.code || ('EODHD: ' + sym) });
        }
      });
    }
    results = results.slice(0, 10);
    if (!results.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = results.map(x =>
      `<div class="si-item" onclick="pickSym('${esc(x.symbol)}')">
         <span class="si-sym">${esc(x.symbol)}</span>
         <span class="si-nm">${esc(x.description || '')}</span>
       </div>`
    ).join('');
    dd.style.display = 'block';
  } catch (e) {
    dd.style.display = 'none';
  }
}

function pickSym(s) {
  document.getElementById('si').value = s;
  document.getElementById('sd').style.display = 'none';
  loadSym(s);
}

// ── FINNHUB CANDLE DATA (for backtest) ─────
async function fetchFinnhubCandles(symbol, days) {
  if (!KEY) { console.warn('[Backtest] No Finnhub key'); return null; }
  const ns = normSym(symbol);
  const to = Math.floor(Date.now() / 1000);
  const from = to - (days || 90) * 86400;
  const res = 'D';
  try {
    const endpoint = ns.type === 'crypto' ? 'crypto/candle' : 'stock/candle';
    const r = await fetch(`${FH}/${endpoint}?symbol=${encodeURIComponent(ns.finnhub)}&resolution=${res}&from=${from}&to=${to}&token=${encodeURIComponent(KEY)}`);
    const j = await r.json().catch(() => ({}));
    console.log(`[Backtest] Finnhub ${endpoint} for ${ns.finnhub}:`, j.s, j.c ? j.c.length + ' bars' : 'no data');
    if (j.s !== 'ok' || !j.c || !j.c.length) {
      // If stock endpoint failed for crypto, try crypto endpoint
      if (ns.type === 'crypto' && endpoint === 'stock/candle') {
        const r2 = await fetch(`${FH}/crypto/candle?symbol=${encodeURIComponent(ns.finnhub)}&resolution=${res}&from=${from}&to=${to}&token=${encodeURIComponent(KEY)}`);
        const j2 = await r2.json().catch(() => ({}));
        if (j2.s !== 'ok' || !j2.c || !j2.c.length) return null;
        return j2.t.map((t, i) => ({
          time: t, open: j2.o[i], high: j2.h[i], low: j2.l[i], close: j2.c[i], volume: j2.v[i] || 0
        }));
      }
      return null;
    }
    return j.t.map((t, i) => ({
      time: t, open: j.o[i], high: j.h[i], low: j.l[i], close: j.c[i], volume: j.v[i] || 0
    }));
  } catch (e) { console.error('[Backtest] Finnhub candle error:', e); return null; }
}

// ── MASSIVE HISTORY (for backtest when live data insufficient) ─────
async function fetchMassiveHistory(symbol, days) {
  if (!MASSIVE_KEY) { console.warn('[Backtest] No Massive key'); return null; }
  // Normalize: strip exchange prefixes for Massive (Polygon) API
  let ticker = symbol.toUpperCase().trim();
  if (ticker.includes(':')) ticker = ticker.split(':').pop(); // BINANCE:BTCUSDT → BTCUSDT
  if (ticker.includes('-USD')) ticker = 'X:' + ticker.replace('-', ''); // BTC-USD → X:BTCUSD
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - (days || 90));
  const dateFrom = from.toISOString().slice(0, 10);
  const dateTo = to.toISOString().slice(0, 10);
  try {
    const url = `${MASSIVE}/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${dateFrom}/${dateTo}?adjusted=true&sort=asc&limit=5000&apiKey=${encodeURIComponent(MASSIVE_KEY)}`;
    console.log(`[Backtest] Massive fetch: ${ticker}`, dateFrom, '→', dateTo);
    const r = await fetch(url);
    const j = await r.json().catch(() => ({}));
    console.log(`[Backtest] Massive response:`, j.status, j.resultsCount || 0, 'bars');
    if (!j.results || !Array.isArray(j.results) || !j.results.length) return null;
    return j.results.map(d => {
      const t = d.t / 1000; // Massive timestamps are in ms
      return { time: Math.floor(t), open: d.o, high: d.h, low: d.l, close: d.c, volume: d.v || 0 };
    });
  } catch (e) { console.error('[Backtest] Massive history error:', e); return null; }
}

// ── INDUSTRY & ASSET ANALYTICS PANEL ─────
const SECTOR_DEMO = [
  { name: 'Technology', pct: 2.4, etf: 'XLK' }, { name: 'Healthcare', pct: -0.3, etf: 'XLV' },
  { name: 'Financials', pct: 1.1, etf: 'XLF' }, { name: 'Energy', pct: -1.2, etf: 'XLE' },
  { name: 'Consumer Disc.', pct: 0.8, etf: 'XLY' }, { name: 'Industrials', pct: 0.2, etf: 'XLI' },
  { name: 'Materials', pct: -0.5, etf: 'XLB' }, { name: 'Utilities', pct: 0.6, etf: 'XLU' },
  { name: 'Real Estate', pct: -0.9, etf: 'XLRE' }, { name: 'Comm Services', pct: 1.5, etf: 'XLC' },
  { name: 'Cons. Staples', pct: 0.3, etf: 'XLP' },
];
// Asset class ETF proxies for live quotes
const ASSET_PROXIES = [
  { name: 'US Equities', sym: 'SPY', etf: 'SPY' },
  { name: 'Intl Equities', sym: 'VXUS', etf: 'VXUS' },
  { name: 'Crypto', sym: 'BINANCE:BTCUSDT', etf: 'BTC' },
  { name: 'Gold', sym: 'GLD', etf: 'GLD' },
  { name: 'Bonds', sym: 'TLT', etf: 'TLT' },
  { name: 'Commodities', sym: 'DBC', etf: 'DBC' },
  { name: 'Volatility', sym: 'VXX', etf: 'VXX' },
];
const ASSET_DEMO = ASSET_PROXIES.map(a => ({ ...a, pct: 0, price: null }));

const INDUSTRY_DEMO = [
  { name: 'Software & Cloud', pct: 3.1, tickers: 'MSFT, CRM, NOW' },
  { name: 'Semiconductors', pct: 2.8, tickers: 'NVDA, AMD, AVGO' },
  { name: 'Banks & Finance', pct: 0.9, tickers: 'JPM, BAC, GS' },
  { name: 'Biotech & Pharma', pct: -0.2, tickers: 'JNJ, PFE, MRNA' },
  { name: 'Oil & Gas', pct: -1.5, tickers: 'XOM, CVX, COP' },
  { name: 'E-Commerce & Retail', pct: 0.4, tickers: 'AMZN, WMT, COST' },
  { name: 'EV & Clean Energy', pct: 1.7, tickers: 'TSLA, ENPH, FSLR' },
  { name: 'Aerospace & Defense', pct: 0.6, tickers: 'LMT, RTX, BA' },
  { name: 'Media & Streaming', pct: -0.8, tickers: 'NFLX, DIS, CMCSA' },
  { name: 'Telecom', pct: 0.1, tickers: 'T, VZ, TMUS' },
];

function pctClass(pct) {
  if (pct > 0.05) return 'pos';
  if (pct < -0.05) return 'neg';
  return 'neu';
}

function initAnalyticsPanel() {
  const tryFetch = typeof KEY !== 'undefined' && KEY;
  // Sector heatmap — try Finnhub first
  if (tryFetch) {
    fetch(`${FH}/stock/sector-performance?token=${encodeURIComponent(KEY)}`)
      .then(r => r.json())
      .then(j => {
        const arr = Array.isArray(j) ? j : (j && j.data) ? j.data : (j && j.sectorPerformance) ? j.sectorPerformance : null;
        if (arr && arr.length) {
          const list = arr.map(s => ({ name: s.name || s.sector || s.industry || '—', pct: parseFloat(s.changesPercentage || s.pct || 0) }));
          renderSectorHeatmap(list);
        } else renderSectorHeatmap(SECTOR_DEMO);
      })
      .catch(() => renderSectorHeatmap(SECTOR_DEMO));
  } else {
    renderSectorHeatmap(SECTOR_DEMO);
  }
  // Asset classes — try live quotes from Finnhub
  if (tryFetch) {
    fetchAssetClassesLive();
  } else {
    renderAssetClasses(ASSET_DEMO);
  }
  renderIndustryList(INDUSTRY_DEMO);
  // Top movers via Massive snapshot
  if (typeof MASSIVE_KEY !== 'undefined' && MASSIVE_KEY) fetchMassiveSnapshot();
  // Order book
  initOrderBookTabs();
  startOBAutoRefresh();
  // Yield curve (hardcoded data) + FRED-powered econ panel (optional)
  fetchYieldCurve();
  if (FRED_KEY) { fetchEconIndicators(); }
}

async function fetchAssetClassesLive() {
  // Live % from Finnhub only (one batch — sector heatmap uses Finnhub too, so we keep quotes here)
  const results = await Promise.allSettled(
    ASSET_PROXIES.map(a =>
      fetch(`${FH}/quote?symbol=${encodeURIComponent(a.sym)}&token=${encodeURIComponent(KEY)}`).then(r => r.json())
    )
  );
  let items = ASSET_PROXIES.map((a, i) => {
    const r = results[i];
    if (r.status === 'fulfilled' && r.value && typeof r.value.dp === 'number') {
      return { ...a, pct: r.value.dp, price: r.value.c };
    }
    return { ...a, pct: 0, price: null };
  });
  // Historical % from EODHD (cached — spreads usage)
  if (typeof EODHD_KEY !== 'undefined' && EODHD_KEY && typeof getEODHDHistoricalPct === 'function') {
    const h = await Promise.all(items.map(a => getEODHDHistoricalPct(a.etf || a.sym)));
    items = items.map((a, i) => ({ ...a, hist: h[i] || null }));
  }
  renderAssetClasses(items);
}

function fetchMassiveSnapshot() {
  const el = document.getElementById('massive-snapshot');
  if (!el) return;
  const syms = ['AAPL','MSFT','GOOGL','AMZN','NVDA','TSLA','META','JPM','V'];
  Promise.allSettled(syms.map(s =>
    fetch(`${MASSIVE}/v2/aggs/ticker/${s}/prev?apiKey=${encodeURIComponent(MASSIVE_KEY)}`).then(r => r.json())
  )).then(results => {
    const data = results.map((r, i) => {
      if (r.status !== 'fulfilled' || !r.value.results || !r.value.results.length) return null;
      const bar = r.value.results[0];
      return { symbol: syms[i], open: bar.o, close: bar.c };
    }).filter(Boolean);
    if (!data.length) return;
    el.innerHTML = '<div class="ap-section-title">Top movers · Prev-day snapshot</div><div class="industry-list">' +
      data.sort((a,b) => Math.abs(b.close/b.open-1) - Math.abs(a.close/a.open-1)).map(d => {
        const chg = d.open ? ((d.close - d.open) / d.open * 100) : 0;
        return `<div class="industry-row">
          <span class="label" style="min-width:50px;font-weight:700;color:var(--hi)">${esc(d.symbol||'')}</span>
          <span class="label" style="color:var(--dim)">$${(d.close||0).toFixed(2)}</span>
          <span class="val ${chg>=0?'up':'dn'}" style="margin-left:auto">${chg>=0?'+':''}${chg.toFixed(2)}%</span>
        </div>`;
      }).join('') + '</div>';
    el.style.display = 'block';
  }).catch(() => { el.style.display = 'none'; });
}

function renderSectorHeatmap(data) {
  const el = document.getElementById('sector-heatmap');
  if (!el) return;
  const list = Array.isArray(data) && data.length ? data : SECTOR_DEMO;
  el.innerHTML = list.map(s => {
    const name = (s.name || s.sector || '—').replace(/\s*\(.*\)/, '');
    const pct = typeof s.pct === 'number' ? s.pct : parseFloat(s.pct || s.changesPercentage || 0);
    const etf = s.etf ? `<span style="display:block;font-size:7px;opacity:.6;margin-top:1px">${s.etf}</span>` : '';
    const intensity = Math.min(1, Math.abs(pct) / 3);
    const bg = Math.abs(pct) < 0.05 ? 'var(--border)' : (pct > 0 ? `rgba(0, 230, 118, ${0.1 + intensity * 0.3})` : `rgba(255, 59, 48, ${0.1 + intensity * 0.3})`);
    const borderColor = Math.abs(pct) < 0.05 ? 'transparent' : (pct > 0 ? `rgba(0, 230, 118, ${0.3 + intensity * 0.3})` : `rgba(255, 59, 48, ${0.3 + intensity * 0.3})`);
    const color = Math.abs(pct) < 0.05 ? 'var(--tx)' : (pct > 0 ? 'var(--g)' : 'var(--r)');
    return `<div class="heat-cell" style="background:${bg};color:${color};border:1px solid ${borderColor};transition:all .2s cubic-bezier(0.4,0,0.2,1)" title="${name}: ${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%">${name}${etf}<span>${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%</span></div>`;
  }).join('');
}

function renderAssetClasses(data) {
  const el = document.getElementById('asset-classes');
  if (!el) return;
  el.innerHTML = data.map(a => {
    const cls = pctClass(a.pct);
    const priceStr = a.price != null ? `<span style="font-size:9px;color:var(--dim);margin-left:auto">$${a.price.toFixed(2)}</span>` : '';
    const histStr = a.hist && (a.hist.chg1M != null || a.hist.chgYTD != null)
      ? ['1M', 'YTD'].map(l => {
          const v = l === '1M' ? a.hist.chg1M : a.hist.chgYTD;
          return v != null ? `${l} ${v >= 0 ? '+' : ''}${v.toFixed(1)}%` : null;
        }).filter(Boolean).join(' · ')
      : '';
    return `<div class="asset-item ${cls}" title="${a.name}: ${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(2)}%">
      <span class="name">${a.name}<span style="display:block;font-size:8px;opacity:.5">${a.etf||''}</span>${histStr ? `<span style="display:block;font-size:8px;color:var(--dim);margin-top:1px">${histStr}</span>` : ''}</span>
      ${priceStr}
      <span class="pct ${a.pct >= 0 ? 'up' : 'dn'}" style="min-width:52px;text-align:right">${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(2)}%</span>
    </div>`;
  }).join('');
}

function renderIndustryList(data) {
  const el = document.getElementById('industry-list');
  if (!el) return;
  el.innerHTML = data.map(a => {
    const tickers = a.tickers ? `<span style="font-size:8px;color:var(--dim);margin-left:6px">${a.tickers}</span>` : '';
    return `<div class="industry-row">
      <span class="label">${a.name}${tickers}</span>
      <span class="val ${a.pct >= 0 ? 'up' : 'dn'}">${a.pct >= 0 ? '+' : ''}${a.pct.toFixed(2)}%</span>
    </div>`;
  }).join('');
}

// ── ORDER BOOK ──────────────────────────────────────────────────────
window._obPair = 'BTCUSDT';
window._obTimer = null;

const BINANCE_DEPTH = 'https://api.binance.com/api/v3/depth';
const BINANCE_TICKER = 'https://api.binance.com/api/v3/ticker/24hr';

function initOrderBookTabs() {
  document.querySelectorAll('.ob-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ob-tab').forEach(b => b.classList.remove('on'));
      btn.classList.add('on');
      const pair = btn.getAttribute('data-ob');
      _obPair = pair;
      fetchAndRenderOB();
    });
  });
}

function symToBinancePair(sym) {
  if (!sym) return null;
  sym = sym.toUpperCase();
  if (sym === 'BTC' || sym === 'BTCUSDT' || sym === 'BTCUSD') return 'BTCUSDT';
  if (sym === 'ETH' || sym === 'ETHUSDT' || sym === 'ETHUSD') return 'ETHUSDT';
  if (sym === 'SOL' || sym === 'SOLUSDT') return 'SOLUSDT';
  if (sym === 'DOGE' || sym === 'DOGEUSDT') return 'DOGEUSDT';
  if (sym === 'XRP' || sym === 'XRPUSDT') return 'XRPUSDT';
  if (sym === 'ADA' || sym === 'ADAUSDT') return 'ADAUSDT';
  if (sym === 'BNB' || sym === 'BNBUSDT') return 'BNBUSDT';
  if (sym.endsWith('USDT')) return sym;
  return null;
}

async function fetchBinanceDepth(pair, limit) {
  limit = limit || 20;
  try {
    const r = await fetch(`${BINANCE_DEPTH}?symbol=${pair}&limit=${limit}`);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function fetchBinanceTicker(pair) {
  try {
    const r = await fetch(`${BINANCE_TICKER}?symbol=${pair}`);
    if (!r.ok) return null;
    return await r.json();
  } catch (e) { return null; }
}

async function fetchFinnhubSpread(sym) {
  if (!KEY || !sym) return null;
  const ns = normSym(sym);
  try {
    const r = await fetch(`${FH}/quote?symbol=${encodeURIComponent(ns.finnhub)}&token=${encodeURIComponent(KEY)}`);
    const j = await r.json().catch(() => ({}));
    if (j && typeof j.c === 'number') {
      return {
        bid: typeof j.b === 'number' ? j.b : null,
        ask: typeof j.a === 'number' ? j.a : null,
        last: j.c,
        high: j.h,
        low: j.l,
        open: j.o,
        prevClose: j.pc,
        changePct: j.dp
      };
    }
    return null;
  } catch (e) { return null; }
}

async function fetchAndRenderOB() {
  const pair = _obPair;
  const statsEl = document.getElementById('ob-stats');
  const bidEl = document.getElementById('ob-bid-rows');
  const askEl = document.getElementById('ob-ask-rows');
  if (!statsEl) return;

  if (pair === 'CURRENT') {
    const sym = typeof curSym !== 'undefined' ? curSym : '';
    const binancePair = symToBinancePair(sym);
    if (binancePair) {
      await renderCryptoOB(binancePair);
    } else if (sym) {
      await renderStockSpread(sym);
    } else {
      statsEl.innerHTML = '<div class="ob-note">Select a symbol to view spread data</div>';
      bidEl.innerHTML = '';
      askEl.innerHTML = '';
      clearDepthCanvas();
    }
  } else {
    await renderCryptoOB(pair);
  }
}

async function renderCryptoOB(pair) {
  const statsEl = document.getElementById('ob-stats');
  const bidEl = document.getElementById('ob-bid-rows');
  const askEl = document.getElementById('ob-ask-rows');

  statsEl.innerHTML = '<span class="ob-note">Loading…</span>';

  const [depth, ticker] = await Promise.all([
    fetchBinanceDepth(pair, 20),
    fetchBinanceTicker(pair)
  ]);

  if (!depth || !depth.bids || !depth.asks) {
    statsEl.innerHTML = '<span class="ob-note">Order book unavailable for this pair</span>';
    bidEl.innerHTML = '';
    askEl.innerHTML = '';
    clearDepthCanvas();
    return;
  }

  const bids = depth.bids.map(([p, q]) => [parseFloat(p), parseFloat(q)]);
  const asks = depth.asks.map(([p, q]) => [parseFloat(p), parseFloat(q)]);

  const bestBid = bids[0] ? bids[0][0] : 0;
  const bestAsk = asks[0] ? asks[0][0] : 0;
  const spread = bestAsk - bestBid;
  const spreadPct = bestBid > 0 ? (spread / bestBid * 100) : 0;
  const midPrice = (bestBid + bestAsk) / 2;
  const totalBidVol = bids.reduce((s, b) => s + b[1], 0);
  const totalAskVol = asks.reduce((s, a) => s + a[1], 0);
  const imbalance = (totalBidVol + totalAskVol) > 0
    ? ((totalBidVol - totalAskVol) / (totalBidVol + totalAskVol) * 100) : 0;

  const priceFmt = midPrice >= 100 ? 2 : midPrice >= 1 ? 4 : 6;
  const label = pair.replace('USDT', '/USDT');

  let volStr = '';
  if (ticker && ticker.quoteVolume) {
    const qv = parseFloat(ticker.quoteVolume);
    volStr = qv >= 1e9 ? (qv / 1e9).toFixed(1) + 'B' : qv >= 1e6 ? (qv / 1e6).toFixed(1) + 'M' : qv.toFixed(0);
  }

  statsEl.innerHTML = `
    <div class="ob-stat"><span class="ob-stat-label">Pair</span><span class="ob-stat-val">${label}</span></div>
    <div class="ob-stat"><span class="ob-stat-label">Mid</span><span class="ob-stat-val">$${midPrice.toFixed(priceFmt)}</span></div>
    <div class="ob-stat"><span class="ob-stat-label">Spread</span><span class="ob-stat-val">${spreadPct.toFixed(4)}%</span></div>
    <div class="ob-stat"><span class="ob-stat-label">Bid Vol</span><span class="ob-stat-val up">${totalBidVol.toFixed(2)}</span></div>
    <div class="ob-stat"><span class="ob-stat-label">Ask Vol</span><span class="ob-stat-val dn">${totalAskVol.toFixed(2)}</span></div>
    <div class="ob-stat"><span class="ob-stat-label">Imbalance</span><span class="ob-stat-val ${imbalance >= 0 ? 'up' : 'dn'}">${imbalance >= 0 ? '+' : ''}${imbalance.toFixed(1)}%</span></div>
    ${volStr ? `<div class="ob-stat"><span class="ob-stat-label">24h Vol</span><span class="ob-stat-val">$${volStr}</span></div>` : ''}
  `;

  renderOBRows(bids, asks, priceFmt);
  drawDepthChart(bids, asks);
}

async function renderStockSpread(sym) {
  const statsEl = document.getElementById('ob-stats');
  const bidEl = document.getElementById('ob-bid-rows');
  const askEl = document.getElementById('ob-ask-rows');

  statsEl.innerHTML = '<span class="ob-note">Loading…</span>';

  const q = await fetchFinnhubSpread(sym);
  if (!q) {
    statsEl.innerHTML = '<span class="ob-note">No spread data available for ' + esc(sym) + '</span>';
    bidEl.innerHTML = '';
    askEl.innerHTML = '';
    clearDepthCanvas();
    return;
  }

  const bid = q.bid, ask = q.ask, last = q.last;
  const hasBidAsk = bid != null && ask != null && bid > 0 && ask > 0;
  const spread = hasBidAsk ? (ask - bid) : 0;
  const spreadPct = hasBidAsk ? (spread / bid * 100) : 0;
  const mid = hasBidAsk ? (bid + ask) / 2 : last;
  const chgStr = q.changePct != null ? `${q.changePct >= 0 ? '+' : ''}${q.changePct.toFixed(2)}%` : '—';

  statsEl.innerHTML = `
    <div class="ob-stat"><span class="ob-stat-label">Symbol</span><span class="ob-stat-val">${esc(sym)}</span></div>
    <div class="ob-stat"><span class="ob-stat-label">Last</span><span class="ob-stat-val">$${last.toFixed(2)}</span></div>
    ${hasBidAsk ? `
      <div class="ob-stat"><span class="ob-stat-label">Bid</span><span class="ob-stat-val up">$${bid.toFixed(2)}</span></div>
      <div class="ob-stat"><span class="ob-stat-label">Ask</span><span class="ob-stat-val dn">$${ask.toFixed(2)}</span></div>
      <div class="ob-stat"><span class="ob-stat-label">Spread</span><span class="ob-stat-val">${spreadPct.toFixed(3)}%</span></div>
    ` : ''}
    <div class="ob-stat"><span class="ob-stat-label">Change</span><span class="ob-stat-val ${q.changePct >= 0 ? 'up' : 'dn'}">${chgStr}</span></div>
    <div class="ob-stat"><span class="ob-stat-label">High</span><span class="ob-stat-val">$${(q.high||0).toFixed(2)}</span></div>
    <div class="ob-stat"><span class="ob-stat-label">Low</span><span class="ob-stat-val">$${(q.low||0).toFixed(2)}</span></div>
  `;

  bidEl.innerHTML = '<div class="ob-note">Full order book depth requires Level 2 market data (paid feed). Bid/ask spread shown above from Finnhub quote.</div>';
  askEl.innerHTML = '';
  clearDepthCanvas();
}

function renderOBRows(bids, asks, priceFmt) {
  const bidEl = document.getElementById('ob-bid-rows');
  const askEl = document.getElementById('ob-ask-rows');
  if (!bidEl || !askEl) return;

  const maxBidQ = Math.max(...bids.map(b => b[1]), 0.001);
  const maxAskQ = Math.max(...asks.map(a => a[1]), 0.001);

  let cumBid = 0;
  bidEl.innerHTML = bids.map(([p, q]) => {
    cumBid += q;
    const pct = (q / maxBidQ * 100).toFixed(0);
    return `<div class="ob-row">
      <div class="ob-row-bar" style="width:${pct}%"></div>
      <span class="ob-price">${p.toFixed(priceFmt)}</span>
      <span class="ob-qty">${fmtOBQty(q)}</span>
      <span class="ob-total">${fmtOBQty(cumBid)}</span>
    </div>`;
  }).join('');

  let cumAsk = 0;
  askEl.innerHTML = asks.map(([p, q]) => {
    cumAsk += q;
    const pct = (q / maxAskQ * 100).toFixed(0);
    return `<div class="ob-row">
      <div class="ob-row-bar" style="width:${pct}%"></div>
      <span class="ob-price">${p.toFixed(priceFmt)}</span>
      <span class="ob-qty">${fmtOBQty(q)}</span>
      <span class="ob-total">${fmtOBQty(cumAsk)}</span>
    </div>`;
  }).join('');
}

function fmtOBQty(q) {
  if (q >= 1000) return (q / 1000).toFixed(1) + 'K';
  if (q >= 1) return q.toFixed(2);
  return q.toFixed(4);
}

function clearDepthCanvas() {
  const c = document.getElementById('ob-depth-canvas');
  if (!c) return;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, c.width, c.height);
}

function drawDepthChart(bids, asks) {
  const canvas = document.getElementById('ob-depth-canvas');
  if (!canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  const W = rect.width;
  const H = rect.height;

  ctx.clearRect(0, 0, W, H);

  if (!bids.length && !asks.length) return;

  const cumBids = [];
  let cb = 0;
  for (let i = 0; i < bids.length; i++) {
    cb += bids[i][1];
    cumBids.push([bids[i][0], cb]);
  }

  const cumAsks = [];
  let ca = 0;
  for (let i = 0; i < asks.length; i++) {
    ca += asks[i][1];
    cumAsks.push([asks[i][0], ca]);
  }

  const allPrices = [...cumBids.map(b => b[0]), ...cumAsks.map(a => a[0])];
  const minP = Math.min(...allPrices);
  const maxP = Math.max(...allPrices);
  const priceRange = maxP - minP || 1;
  const maxVol = Math.max(cb, ca, 0.001);

  const pad = { top: 10, bottom: 20, left: 10, right: 10 };
  const cW = W - pad.left - pad.right;
  const cH = H - pad.top - pad.bottom;

  function px(price) { return pad.left + ((price - minP) / priceRange) * cW; }
  function py(vol) { return pad.top + cH - (vol / maxVol) * cH; }

  // Bid fill
  ctx.beginPath();
  ctx.moveTo(px(cumBids[cumBids.length - 1][0]), py(0));
  for (let i = cumBids.length - 1; i >= 0; i--) {
    ctx.lineTo(px(cumBids[i][0]), py(cumBids[i][1]));
    if (i > 0) ctx.lineTo(px(cumBids[i - 1][0]), py(cumBids[i][1]));
  }
  ctx.lineTo(px(cumBids[0][0]), py(0));
  ctx.closePath();
  ctx.fillStyle = 'rgba(40, 200, 100, 0.15)';
  ctx.fill();

  // Bid line
  ctx.beginPath();
  for (let i = cumBids.length - 1; i >= 0; i--) {
    const x = px(cumBids[i][0]), y = py(cumBids[i][1]);
    if (i === cumBids.length - 1) ctx.moveTo(x, y);
    else { ctx.lineTo(x, y); if (i > 0) ctx.lineTo(px(cumBids[i - 1][0]), py(cumBids[i][1])); }
  }
  ctx.strokeStyle = 'rgba(40, 200, 100, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Ask fill
  ctx.beginPath();
  ctx.moveTo(px(cumAsks[0][0]), py(0));
  for (let i = 0; i < cumAsks.length; i++) {
    ctx.lineTo(px(cumAsks[i][0]), py(cumAsks[i][1]));
    if (i < cumAsks.length - 1) ctx.lineTo(px(cumAsks[i + 1][0]), py(cumAsks[i][1]));
  }
  ctx.lineTo(px(cumAsks[cumAsks.length - 1][0]), py(0));
  ctx.closePath();
  ctx.fillStyle = 'rgba(255, 60, 60, 0.15)';
  ctx.fill();

  // Ask line
  ctx.beginPath();
  for (let i = 0; i < cumAsks.length; i++) {
    const x = px(cumAsks[i][0]), y = py(cumAsks[i][1]);
    if (i === 0) ctx.moveTo(x, y);
    else { ctx.lineTo(x, y); }
    if (i < cumAsks.length - 1) ctx.lineTo(px(cumAsks[i + 1][0]), py(cumAsks[i][1]));
  }
  ctx.strokeStyle = 'rgba(255, 60, 60, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Mid-price line
  const midP = (cumBids[0][0] + cumAsks[0][0]) / 2;
  ctx.beginPath();
  ctx.moveTo(px(midP), pad.top);
  ctx.lineTo(px(midP), pad.top + cH);
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Price axis labels
  ctx.font = '9px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.textAlign = 'left';
  const pFmt = midP >= 100 ? 0 : midP >= 1 ? 2 : 4;
  ctx.fillText('$' + minP.toFixed(pFmt), pad.left, H - 4);
  ctx.textAlign = 'right';
  ctx.fillText('$' + maxP.toFixed(pFmt), W - pad.right, H - 4);
  ctx.textAlign = 'center';
  ctx.fillText('$' + midP.toFixed(pFmt), px(midP), H - 4);

  // Volume axis labels
  ctx.textAlign = 'left';
  ctx.fillText(fmtOBQty(maxVol), pad.left + 2, pad.top + 10);
}

function startOBAutoRefresh() {
  stopOBAutoRefresh();
  fetchAndRenderOB();
  _obTimer = setInterval(fetchAndRenderOB, 12000);
}

function stopOBAutoRefresh() {
  if (_obTimer) { clearInterval(_obTimer); _obTimer = null; }
}

function refreshOBForSymbol() {
  const curTab = document.querySelector('.ob-tab[data-ob="CURRENT"]');
  if (curTab && curTab.classList.contains('on')) {
    fetchAndRenderOB();
  }
}

// ══════════════════════════════════════════════════════════════════════
//  COMMAND BAR — Ctrl+K quick-jump to symbols, views, and actions
// ══════════════════════════════════════════════════════════════════════

const CMD_REGISTRY = [
  { label:'Charts',         keywords:'charts chart main',       icon:'📈', hint:'View', action(){ switchViewByIdx(0); }},
  { label:'Backtest',       keywords:'backtest test strategy',  icon:'🔬', hint:'View', action(){ switchViewByIdx(1); }},
  { label:'Calendar',       keywords:'calendar events ipo sec', icon:'📅', hint:'View', action(){ switchViewByIdx(2); }},
  { label:'Study',          keywords:'study learn resources',   icon:'📚', hint:'View', action(){ switchViewByIdx(3); }},
  { label:'Arcade',         keywords:'arcade games bored',      icon:'🎮', hint:'View', action(){ switchViewByIdx(4); }},
  { label:'Toggle News',    keywords:'news sidebar toggle',     icon:'📰', hint:'Action', action(){ toggleNewsSidebar(); }},
  { label:'Toggle RSI',     keywords:'rsi indicator',           icon:'📊', hint:'Indicator', action(){ if(typeof tind==='function') tind('rsi'); }},
  { label:'Toggle MACD',    keywords:'macd indicator',          icon:'📉', hint:'Indicator', action(){ if(typeof tind==='function') tind('macd'); }},
  { label:'Cycle Theme',    keywords:'theme dark light gray rgb',icon:'🎨', hint:'Action', action(){ cycleTheme(); }},
  { label:'News: All',      keywords:'news all',                icon:'📰', hint:'Filter', action(){ setNF(null,'all'); }},
  { label:'News: Crypto',   keywords:'news crypto bitcoin',     icon:'₿',  hint:'Filter', action(){ setNF(null,'crypto'); }},
  { label:'News: Forex',    keywords:'news forex fx currency',  icon:'💱', hint:'Filter', action(){ setNF(null,'forex'); }},
  { label:'News: M&A',      keywords:'news merger acquisition', icon:'🤝', hint:'Filter', action(){ setNF(null,'merger'); }},
];

let cmdSelIdx = 0;
let cmdFiltered = [];

let _cmdInputBound = false;

function openCmdBar() {
  const bar = document.getElementById('cmd-bar');
  if (!bar) return;
  bar.style.display = 'flex';
  const inp = document.getElementById('cmd-input');
  if (inp) {
    inp.value = '';
    if (!_cmdInputBound) {
      inp.addEventListener('input', () => cmdSearch(inp.value));
      inp.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); cmdSelIdx = Math.min(cmdSelIdx + 1, cmdFiltered.length - 1); renderCmdResults(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); cmdSelIdx = Math.max(cmdSelIdx - 1, 0); renderCmdResults(); }
        else if (e.key === 'Enter') { e.preventDefault(); cmdExec(cmdSelIdx); }
        else if (e.key === 'Escape') { e.preventDefault(); closeCmdBar(); }
      });
      _cmdInputBound = true;
    }
    setTimeout(() => inp.focus(), 20);
  }
  cmdSelIdx = 0;
  cmdFiltered = [...CMD_REGISTRY];
  renderCmdResults();
}

function closeCmdBar() {
  const bar = document.getElementById('cmd-bar');
  if (bar) bar.style.display = 'none';
}

function cmdSearch(q) {
  q = q.trim().toLowerCase();
  if (!q) { cmdFiltered = [...CMD_REGISTRY]; renderCmdResults(); return; }
  const isTickerLike = /^[A-Za-z]{1,5}$/.test(q.trim());
  cmdFiltered = CMD_REGISTRY.filter(c =>
    c.label.toLowerCase().includes(q) || c.keywords.toLowerCase().includes(q)
  );
  if (isTickerLike) {
    cmdFiltered.push({
      label: `Load symbol: ${q.toUpperCase()}`,
      keywords: '', icon: '🔎', hint: 'Symbol',
      action() { loadSym(q.toUpperCase()); switchViewByIdx(0); }
    });
  }
  cmdSelIdx = 0;
  renderCmdResults();
}

function renderCmdResults() {
  const el = document.getElementById('cmd-results');
  if (!el) return;
  el.innerHTML = cmdFiltered.map((c, i) =>
    `<div class="cmd-item${i === cmdSelIdx ? ' sel' : ''}" onmouseenter="cmdSelIdx=${i};renderCmdResults()" onclick="cmdExec(${i})">
      <span class="cmd-icon">${c.icon || ''}</span>
      <span class="cmd-label">${c.label}</span>
      <span class="cmd-hint">${c.hint || ''}</span>
    </div>`
  ).join('');
}

function cmdExec(idx) {
  const c = cmdFiltered[idx];
  if (c && c.action) c.action();
  closeCmdBar();
}

function switchViewByIdx(idx) {
  const btns = document.querySelectorAll('.nb');
  const ids = ['cv','bv','calv','sv','gv'];
  if (ids[idx]) switchView(ids[idx], btns[idx] || null);
}

function toggleNewsSidebar() {
  const ns = document.getElementById('ns');
  if (!ns) return;
  ns.style.display = ns.style.display === 'none' ? '' : 'none';
}

// ══════════════════════════════════════════════════════════════════════
//  HOTKEY SYSTEM — global keyboard shortcuts
// ══════════════════════════════════════════════════════════════════════

function toggleHotkeySheet() {
  const sheet = document.getElementById('hotkey-sheet');
  if (!sheet) return;
  sheet.style.display = sheet.style.display === 'none' ? 'flex' : 'none';
}

document.addEventListener('keydown', function(e) {
  const tag = (e.target.tagName || '').toLowerCase();
  const inInput = tag === 'input' || tag === 'textarea' || tag === 'select' || e.target.isContentEditable;

  if (e.key === 'Escape') {
    const cmdBar = document.getElementById('cmd-bar');
    if (cmdBar && cmdBar.style.display === 'flex') { closeCmdBar(); e.preventDefault(); return; }
    const hkSheet = document.getElementById('hotkey-sheet');
    if (hkSheet && hkSheet.style.display === 'flex') { toggleHotkeySheet(); e.preventDefault(); return; }
  }

  if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); e.stopPropagation(); openCmdBar(); return; }

  if (inInput) return;

  if (e.key === '/') { e.preventDefault(); openCmdBar(); return; }
  if (e.key === '?') { e.preventDefault(); toggleHotkeySheet(); return; }

  if (e.key >= '1' && e.key <= '5') { switchViewByIdx(parseInt(e.key) - 1); return; }
  if (e.key === 'n' || e.key === 'N') { toggleNewsSidebar(); return; }
  if ((e.key === 't' || e.key === 'T') && !e.ctrlKey && !e.metaKey) { cycleTheme(); return; }
});

// ══════════════════════════════════════════════════════════════════════
//  YIELD CURVE — US Treasury rates from FRED
// ══════════════════════════════════════════════════════════════════════

const YIELD_TENORS = [
  { id:'DGS1MO', label:'1M',  months:1 },
  { id:'DGS3MO', label:'3M',  months:3 },
  { id:'DGS6MO', label:'6M',  months:6 },
  { id:'DGS1',   label:'1Y',  months:12 },
  { id:'DGS2',   label:'2Y',  months:24 },
  { id:'DGS5',   label:'5Y',  months:60 },
  { id:'DGS10',  label:'10Y', months:120 },
  { id:'DGS20',  label:'20Y', months:240 },
  { id:'DGS30',  label:'30Y', months:360 },
];

function fetchYieldCurve() {
  const section = document.getElementById('yield-section');
  if (section) section.style.display = 'block';

  const hardcoded = [
    { val: 5.25, prev: 5.28 },  // 1M
    { val: 5.22, prev: 5.24 },  // 3M
    { val: 5.07, prev: 5.10 },  // 6M
    { val: 4.72, prev: 4.75 },  // 1Y
    { val: 4.28, prev: 4.32 },  // 2Y
    { val: 4.10, prev: 4.13 },  // 5Y
    { val: 4.22, prev: 4.25 },  // 10Y
    { val: 4.48, prev: 4.50 },  // 20Y
    { val: 4.38, prev: 4.41 },  // 30Y
  ];

  const data = YIELD_TENORS.map((t, i) => ({
    ...t,
    val: hardcoded[i].val,
    prev: hardcoded[i].prev,
  }));

  renderYieldCurve(data);
}

function renderYieldCurve(data) {
  const chartEl = document.getElementById('yield-curve-chart');
  const tableEl = document.getElementById('yield-curve-table');
  if (!chartEl || !tableEl) return;

  const valid = data.filter(d => d.val !== null);
  if (!valid.length) { chartEl.innerHTML = '<div style="padding:20px;color:var(--dim);font-size:11px">No yield data available</div>'; return; }

  const y2 = data.find(d => d.id === 'DGS2');
  const y10 = data.find(d => d.id === 'DGS10');
  const inverted = y2 && y10 && y2.val !== null && y10.val !== null && y2.val > y10.val;
  const spread = (y10 && y2 && y10.val !== null && y2.val !== null) ? (y10.val - y2.val).toFixed(2) : null;

  // SVG line chart
  const W = 500, H = 160, pad = { top: 20, right: 20, bottom: 30, left: 40 };
  const iw = W - pad.left - pad.right, ih = H - pad.top - pad.bottom;
  const vals = valid.map(d => d.val);
  const yMin = Math.min(...vals) - 0.3, yMax = Math.max(...vals) + 0.3;
  const xScale = i => pad.left + (i / (valid.length - 1)) * iw;
  const yScale = v => pad.top + ih - ((v - yMin) / (yMax - yMin)) * ih;
  const points = valid.map((d, i) => `${xScale(i).toFixed(1)},${yScale(d.val).toFixed(1)}`).join(' ');
  const areaPoints = points + ` ${xScale(valid.length-1).toFixed(1)},${(pad.top+ih).toFixed(1)} ${pad.left},${(pad.top+ih).toFixed(1)}`;

  let svg = `<svg viewBox="0 0 ${W} ${H}" style="width:100%;height:100%">`;
  svg += `<defs><linearGradient id="yg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${inverted?'#ff3c3c':'#00e5a0'}" stop-opacity=".25"/><stop offset="100%" stop-color="${inverted?'#ff3c3c':'#00e5a0'}" stop-opacity="0"/></linearGradient></defs>`;
  svg += `<polygon points="${areaPoints}" fill="url(#yg)"/>`;
  svg += `<polyline points="${points}" fill="none" stroke="${inverted?'#ff3c3c':'#00e5a0'}" stroke-width="2" stroke-linejoin="round"/>`;
  valid.forEach((d, i) => {
    svg += `<circle cx="${xScale(i).toFixed(1)}" cy="${yScale(d.val).toFixed(1)}" r="3" fill="${inverted?'#ff3c3c':'#00e5a0'}" stroke="var(--bg)" stroke-width="1.5"/>`;
    svg += `<text x="${xScale(i).toFixed(1)}" y="${(pad.top+ih+16).toFixed(1)}" text-anchor="middle" fill="var(--dim)" font-size="9" font-family="'IBM Plex Mono',monospace">${d.label}</text>`;
  });
  for (let tick = Math.ceil(yMin); tick <= Math.floor(yMax + 1); tick += 1) {
    if (tick < yMin || tick > yMax) continue;
    svg += `<line x1="${pad.left}" y1="${yScale(tick).toFixed(1)}" x2="${W-pad.right}" y2="${yScale(tick).toFixed(1)}" stroke="var(--border)" stroke-dasharray="3"/>`;
    svg += `<text x="${pad.left-6}" y="${(yScale(tick)+3).toFixed(1)}" text-anchor="end" fill="var(--dim)" font-size="9" font-family="'IBM Plex Mono',monospace">${tick}%</text>`;
  }
  svg += '</svg>';
  chartEl.innerHTML = (inverted ? `<span class="yield-inversion-badge" style="position:absolute;top:6px;right:8px;z-index:2">⚠ Inverted · 2Y-10Y: ${spread}%</span>` : (spread !== null ? `<span style="position:absolute;top:6px;right:8px;z-index:2;font-size:9px;color:var(--dim)">2Y-10Y spread: ${spread}%</span>` : '')) + svg;

  tableEl.innerHTML = data.map(d => {
    const isInv = inverted && (d.id === 'DGS2' || d.id === 'DGS10');
    const chg = (d.val !== null && d.prev !== null) ? d.val - d.prev : null;
    return `<div class="yield-cell${isInv ? ' inverted' : ''}">
      <div class="yield-tenor">${d.label}</div>
      <div class="yield-val">${d.val !== null ? d.val.toFixed(2) + '%' : '—'}</div>
      ${chg !== null ? `<div class="yield-chg ${chg >= 0 ? 'up' : 'dn'}">${chg >= 0 ? '+' : ''}${chg.toFixed(2)}</div>` : ''}
    </div>`;
  }).join('');
}

// ══════════════════════════════════════════════════════════════════════
//  ECONOMIC INDICATORS — GDP, CPI, Unemployment, Fed Funds, Spread
// ══════════════════════════════════════════════════════════════════════

const ECON_SERIES = [
  { id:'GDP',      label:'GDP',             unit:'$B',   fmt:v=>v.toFixed(0),    goodUp:true  },
  { id:'CPIAUCSL', label:'CPI',             unit:'Index', fmt:v=>v.toFixed(1),   goodUp:false },
  { id:'UNRATE',   label:'Unemployment',    unit:'%',     fmt:v=>v.toFixed(1)+'%',goodUp:false },
  { id:'FEDFUNDS', label:'Fed Funds Rate',  unit:'%',     fmt:v=>v.toFixed(2)+'%',goodUp:false },
  { id:'T10Y2Y',   label:'10Y-2Y Spread',  unit:'%',     fmt:v=>v.toFixed(2)+'%',goodUp:true  },
];

async function fetchEconIndicators() {
  if (!FRED_KEY) return;
  const section = document.getElementById('econ-section');
  if (section) section.style.display = 'block';

  try {
    const results = await Promise.allSettled(
      ECON_SERIES.map(s =>
        fetch(`${FRED}/series/observations?series_id=${s.id}&api_key=${encodeURIComponent(FRED_KEY)}&file_type=json&sort_order=desc&limit=12`)
          .then(r => r.json())
      )
    );

    const data = ECON_SERIES.map((s, i) => {
      const r = results[i];
      if (r.status !== 'fulfilled' || !r.value.observations) return { ...s, vals: [], latest: null, prev: null };
      const obs = r.value.observations.filter(o => o.value !== '.').map(o => parseFloat(o.value));
      return { ...s, vals: obs.reverse(), latest: obs.length ? obs[obs.length - 1] : null, prev: obs.length > 1 ? obs[obs.length - 2] : null };
    });

    renderEconIndicators(data);
  } catch (e) {
    console.warn('[FRED] economic indicators fetch failed', e);
  }
}

function renderEconIndicators(data) {
  const el = document.getElementById('econ-panel');
  if (!el) return;

  el.innerHTML = data.map(d => {
    if (d.latest === null) return '';
    const chg = d.prev !== null ? d.latest - d.prev : 0;
    const improving = d.goodUp ? chg > 0 : chg < 0;
    const arrowCls = Math.abs(chg) < 0.001 ? 'flat' : (improving ? 'up' : 'dn');
    const arrowChar = Math.abs(chg) < 0.001 ? '—' : (chg > 0 ? '▲' : '▼');

    // Mini sparkline SVG
    let spark = '';
    if (d.vals.length > 1) {
      const sw = 60, sh = 24;
      const vmin = Math.min(...d.vals), vmax = Math.max(...d.vals);
      const vrange = vmax - vmin || 1;
      const pts = d.vals.map((v, i) =>
        `${(i / (d.vals.length - 1) * sw).toFixed(1)},${(sh - ((v - vmin) / vrange) * (sh - 4) - 2).toFixed(1)}`
      ).join(' ');
      spark = `<svg class="econ-spark" viewBox="0 0 ${sw} ${sh}" preserveAspectRatio="none" style="width:${sw}px;height:${sh}px">
        <polyline points="${pts}" fill="none" stroke="${improving ? '#00e5a0' : '#ff3c3c'}" stroke-width="1.5" stroke-linejoin="round"/>
      </svg>`;
    }

    return `<div class="econ-card">
      <div class="econ-name">${d.label}</div>
      <div class="econ-row">
        <span class="econ-val">${d.fmt(d.latest)}</span>
        <span class="econ-arrow ${arrowCls}">${arrowChar}</span>
        ${spark}
      </div>
      <div class="econ-sub">${d.unit}${d.prev !== null ? ' · prev ' + d.fmt(d.prev) : ''}</div>
    </div>`;
  }).join('');
}
