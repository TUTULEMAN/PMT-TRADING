// ════════════════════════════════════
//  CONFIG / STATE
//  All global variables and constants
// ════════════════════════════════════

// API endpoints
window.FH = 'https://finnhub.io/api/v1';
window.KEY = '';
window.MASSIVE = 'https://api.massive.com';
window.MASSIVE_KEY = '';

// Chart instances
window.mc   = null;   // main chart
window.rc2  = null;   // RSI sub-chart
window.macc = null;   // MACD sub-chart
window.ms   = null;   // active main series

// Indicator series references
window.rsiS    = null;
window.rsiOB2  = null;
window.rsiOS2  = null;
window.macdL   = null;
window.macdSig = null;
window.macdH2  = null;

// Chart state
window.rawData    = [];
window.curSym     = '';
window.curTf      = 3;           // index into TIMEFRAMES
window.curType    = 'candlestick';
window.curSymType = 'stock';
window.inds       = { rsi: false, macd: false };

// Drawing tools
window.drawMode  = 'none';
window.drawings  = [];
window.drawPrev  = null;

// News
window.allNews  = [];
window.seenNews = new Set();
window.newsCat  = 'all';

// Backtest
window.curStrat = 'rsi';
window.eqC  = null;
window.ddC  = null;
window.eqS  = null;
window.bhS  = null;
window.ddS2 = null;
window.lastBT = null;

// WebSocket & live quotes
window.ws2        = null;
window.liveQuotes = {};

// Arcade (LAN poker) WebSocket endpoint — set this to enable real multiplayer.
// Example: wss://your-arcade-server.example.com/ws
window.ARCADE_WS_URL = ''; // empty = disabled; UI will still render in demo mode.

// ── STREAM PRESETS (channel-based live embeds — auto-resolve to current stream) ──
window.streamChannelIds = {
  france24:    'UCQfwfsi5VrQ8yKZ-UWmAEFg',
  'al-jazeera':'UCNye-wNBqNL5ZzHSJj3l8Bg',
  yahoo:       'UCEAZeUIeJs0IjQiqTCdVSIg',
  bloomberg:   'UCIALMKvObZNtJ6AmdCLP7Lg',
  cnbc:        'UCvJJ_dzjViJCoLf5uKUTwoA',
};

window.streamExtUrls = {
  france24:    'https://www.youtube.com/@FRANCE24English/live',
  'al-jazeera':'https://www.youtube.com/@aljaborEnglish/live',
  yahoo:       'https://www.youtube.com/@YahooFinance/live',
  bloomberg:   'https://www.youtube.com/@BloombergTV/streams',
  cnbc:        'https://www.youtube.com/@CNBC/streams',
};

// ── TIMEFRAMES ──────────────────────
// [label, resolution, days]
window.TIMEFRAMES = [
  ['1D',  '5',  1],
  ['5D',  '15', 5],
  ['1M',  '60', 30],
  ['3M',  'D',  90],
  ['6M',  'D',  180],
  ['1Y',  'D',  365],
  ['5Y',  'W',  1825],
];

// ── TICKER SYMBOLS ───────────────────
window.TICKER = ['AAPL','MSFT','NVDA','TSLA','SPY','QQQ','BTC','ETH','EURUSD','GLD'];

// ── THEME DEFINITIONS ─────────────────
window.THEMES = {
  dark:  { bg:'#060709', surface:'#0b0d12', border:'#181c24', bhi:'#252b38', tx:'#3d4455', hi:'#dde2f0' },
  gray:  { bg:'#1a1d23', surface:'#22262e', border:'#343a46', bhi:'#454d5c', tx:'#5c6478', hi:'#e4e8f2' },
  light: { bg:'#f0f1f4', surface:'#ffffff', border:'#d0d4dc', bhi:'#bcc2ce', tx:'#8990a2', hi:'#1a1e2a' },
  rgb:   { bg:'#050611', surface:'#090b18', border:'#191d32', bhi:'#262b43', tx:'#4f5674', hi:'#f4f5ff' },
};
window.curTheme = localStorage.getItem('pmt-theme') || 'dark';

function cycleTheme() {
  const order = ['dark','gray','light','rgb'];
  const idx = (order.indexOf(curTheme) + 1) % order.length;
  curTheme = order[idx];
  applyTheme(curTheme);
}

function applyTheme(name) {
  document.documentElement.setAttribute('data-theme', name);
  localStorage.setItem('pmt-theme', name);
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = name.charAt(0).toUpperCase() + name.slice(1);
  // Update chart options to match
  const t = THEMES[name];
  _updateChartTheme(t);
}

function _updateChartTheme(t) {
  const chartOpts = {
    layout: { background: { type:'solid', color: t.bg }, textColor: t.tx },
    grid: { vertLines: { color: t.border }, horzLines: { color: t.border } },
    crosshair: { vertLine: { color: t.bhi, labelBackgroundColor: t.surface }, horzLine: { color: t.bhi, labelBackgroundColor: t.surface } },
    rightPriceScale: { borderColor: t.border },
    timeScale: { borderColor: t.border },
  };
  if (mc) try { mc.applyOptions(chartOpts); } catch(e){}
  if (rc2) try { rc2.applyOptions(chartOpts); } catch(e){}
  if (macc) try { macc.applyOptions(chartOpts); } catch(e){}
  if (eqC) try { eqC.applyOptions(chartOpts); } catch(e){}
  if (ddC) try { ddC.applyOptions(chartOpts); } catch(e){}
}

// ── CHART OPTIONS ────────────────────
// Defer CrosshairMode lookup — LightweightCharts may not be loaded yet at parse time
function _chMode() {
  return (typeof LightweightCharts !== 'undefined' && LightweightCharts.CrosshairMode)
    ? LightweightCharts.CrosshairMode.Normal : 0;
}

function _chartOpts(fontSize) {
  const t = THEMES[curTheme] || THEMES.dark;
  return {
    layout: { background: { type:'solid', color: t.bg }, textColor: t.tx, fontSize, fontFamily: "'IBM Plex Mono', monospace" },
    grid: { vertLines: { color: t.border, style: 1 }, horzLines: { color: t.border, style: 1 } },
    crosshair: { get mode() { return _chMode(); }, vertLine: { color: t.bhi, width: 1, labelBackgroundColor: t.surface }, horzLine: { color: t.bhi, width: 1, labelBackgroundColor: t.surface } },
    rightPriceScale: { borderColor: t.border },
    timeScale: { borderColor: t.border, timeVisible: true, secondsVisible: false },
    handleScroll: true, handleScale: true,
  };
}

window.CO  = { get layout(){ return _chartOpts(11).layout; }, get grid(){ return _chartOpts(11).grid; }, get crosshair(){ return _chartOpts(11).crosshair; }, get rightPriceScale(){ return _chartOpts(11).rightPriceScale; }, get timeScale(){ return _chartOpts(11).timeScale; }, handleScroll:true, handleScale:true };
window.BCO = { get layout(){ return _chartOpts(10).layout; }, get grid(){ return _chartOpts(10).grid; }, get crosshair(){ return _chartOpts(10).crosshair; }, get rightPriceScale(){ return _chartOpts(10).rightPriceScale; }, get timeScale(){ return _chartOpts(10).timeScale; }, handleScroll:true, handleScale:true };

// Apply saved theme on load
(function(){ applyTheme(curTheme); })();
