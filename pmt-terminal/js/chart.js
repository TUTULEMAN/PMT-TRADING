// ════════════════════════════════════
//  CHART — init, series, indicators,
//          drawing tools, resize
// ════════════════════════════════════

// Fibonacci levels + colors
const FL = [0, .236, .382, .5, .618, .786, 1];
const FC = ['#ffb547','#b490ff','#4da6ff','#00e5a0','#4da6ff','#b490ff','#ffb547'];

// ── INIT ─────────────────────────────
function initCharts() {
  const me = document.getElementById('mp');
  document.getElementById('ce')?.remove();
  mc = LightweightCharts.createChart(me, { ...CO, width: me.clientWidth, height: me.clientHeight });

  // Crosshair price display
  mc.subscribeCrosshairMove(p => {
    if (!p.time || !ms) return;
    const d = p.seriesData.get(ms);
    if (!d) return;
    if (d.open !== undefined) {
      ['o', 'h', 'l', 'c'].forEach(k =>
        document.getElementById('o' + k).textContent =
          fmtP(d[{ o:'open', h:'high', l:'low', c:'close' }[k]])
      );
      document.getElementById('ov').textContent = fmtVol(d.volume || 0);
      document.getElementById('px').textContent = fmtP(d.close);
    } else if (d.value !== undefined) {
      document.getElementById('px').textContent = fmtP(d.value);
    }
  });

  setupDraw();
  setupTbListeners();
  setupSearch();
  setupResize();
  loadSym('AAPL');
}

// ── TOOLBAR LISTENERS ───────────────
function setupTbListeners() {
  document.querySelectorAll('#tfg .tbtn').forEach((b, i) => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#tfg .tbtn').forEach(x => x.classList.remove('on', 'tf'));
      b.classList.add('on', 'tf');
      curTf = i;
      // Real-time mode: no reload; timeframe is just view preference (scroll/zoom manually)
    });
  });
  document.querySelectorAll('#tyg .tbtn').forEach(b => {
    b.addEventListener('click', () => {
      document.querySelectorAll('#tyg .tbtn').forEach(x => x.classList.remove('on'));
      b.classList.add('on');
      curType = b.dataset.type;
      rebuildSeries();
    });
  });
}

// ── BUILD SERIES ─────────────────────
function rebuildSeries() {
  if (!mc || !rawData.length) return;
  if (ms) { try { mc.removeSeries(ms); } catch (e) {} }
  ms = null;
  const up = '#00e5a0', dn = '#ff3d5a';
  if (curType === 'candlestick') {
    ms = mc.addCandlestickSeries({ upColor: up, downColor: dn, wickUpColor: up, wickDownColor: dn, borderVisible: false });
    ms.setData(rawData);
  } else if (curType === 'line') {
    ms = mc.addLineSeries({ color: '#4da6ff', lineWidth: 2 });
    ms.setData(rawData.map(d => ({ time: d.time, value: d.close })));
  } else if (curType === 'bar') {
    ms = mc.addBarSeries({ upColor: up, downColor: dn });
    ms.setData(rawData);
  } else   if (curType === 'area') {
    ms = mc.addAreaSeries({ lineColor: '#4da6ff', topColor: '#4da6ff22', bottomColor: '#4da6ff00', lineWidth: 2 });
    ms.setData(rawData.map(d => ({ time: d.time, value: d.close })));
  }
  const qo = document.getElementById('quote-only-msg');
  if (qo) qo.style.display = 'none';
  ri();
  mc.timeScale().fitContent();
}

// Append one point from real-time (WebSocket). rawData already updated in api.js.
function appendRealtimePoint(time, price, volume) {
  if (!ms || !rawData.length) return;
  const bar = { time, open: price, high: price, low: price, close: price, volume: volume || 0 };
  if (curType === 'candlestick' || curType === 'bar') {
    ms.update(bar);
  } else {
    ms.update({ time, value: price });
  }
  if (inds.rsi || inds.macd) ri();
}

// ── INDICATORS TOGGLE ────────────────
function tind(n) {
  inds[n] = !inds[n];
  document.getElementById('i-' + n).classList.toggle('ion', inds[n]);
  ri();
}

// ── REBUILD INDICATORS (overlaid on main chart) ───────────────
function ri() {
  if (!mc || !rawData.length) return;
  if (rsiS)  { try { mc.removeSeries(rsiS); mc.removeSeries(rsiOB2); mc.removeSeries(rsiOS2); } catch (e) {} }
  rsiS = rsiOB2 = rsiOS2 = null;
  if (macdL) { try { mc.removeSeries(macdL); mc.removeSeries(macdSig); mc.removeSeries(macdH2); } catch (e) {} }
  macdL = macdSig = macdH2 = null;

  if (inds.rsi) {
    const d = cRSI(rawData, +document.getElementById('rp2').value);
    if (d.length) {
      const rsiScale = { priceScaleId: 'rsi-scale' };
      rsiS   = mc.addLineSeries({ ...rsiScale, color: '#b490ff', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });
      rsiOB2 = mc.addLineSeries({ ...rsiScale, color: 'rgba(255,61,90,0.25)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      rsiOS2 = mc.addLineSeries({ ...rsiScale, color: 'rgba(0,229,160,0.25)', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false });
      rsiS.setData(d);
      rsiOB2.setData([{ time: d[0].time, value: 70 }, { time: d[d.length-1].time, value: 70 }]);
      rsiOS2.setData([{ time: d[0].time, value: 30 }, { time: d[d.length-1].time, value: 30 }]);
      mc.priceScale('rsi-scale').applyOptions({ scaleMargins: { top: 0.7, bottom: 0.02 }, drawTicks: false, borderVisible: false });
    }
  }

  if (inds.macd) {
    const { macd, signal, histogram } = cMACD(rawData);
    if (macd.length) {
      const macdScale = { priceScaleId: 'macd-scale' };
      macdH2 = mc.addHistogramSeries({ ...macdScale, priceLineVisible: false, lastValueVisible: false });
      macdH2.setData(histogram);
      macdL   = mc.addLineSeries({ ...macdScale, color: '#4da6ff', lineWidth: 1.5, priceLineVisible: false, lastValueVisible: true });
      macdL.setData(macd);
      macdSig = mc.addLineSeries({ ...macdScale, color: '#ffb547', lineWidth: 1, priceLineVisible: false, lastValueVisible: true });
      macdSig.setData(signal);
      mc.priceScale('macd-scale').applyOptions({ scaleMargins: { top: 0.7, bottom: 0.02 }, drawTicks: false, borderVisible: false });
    }
  }
}

// ── INDICATOR MATH ───────────────────
function cEMAV(v, p) {
  const r = new Array(v.length).fill(null), k = 2/(p+1);
  let s = 0;
  for (let i = 0; i < p; i++) s += v[i];
  r[p-1] = s/p;
  for (let i = p; i < v.length; i++) r[i] = v[i]*k + r[i-1]*(1-k);
  return r;
}

function cRSI(data, p = 14) {
  if (data.length < p+1) return [];
  const r = [];
  let ag = 0, al = 0;
  for (let i = 1; i <= p; i++) {
    const d = data[i].close - data[i-1].close;
    if (d > 0) ag += d; else al -= d;
  }
  ag /= p; al /= p;
  r.push({ time: data[p].time, value: al === 0 ? 100 : 100 - 100/(1 + ag/al) });
  for (let i = p+1; i < data.length; i++) {
    const d = data[i].close - data[i-1].close;
    ag = (ag*(p-1) + (d > 0 ? d : 0)) / p;
    al = (al*(p-1) + (d < 0 ? -d : 0)) / p;
    r.push({ time: data[i].time, value: al === 0 ? 100 : 100 - 100/(1 + ag/al) });
  }
  return r;
}

function cMACD(data, f = 12, sl = 26, sg = 9) {
  const c = data.map(d => d.close);
  const fe = cEMAV(c, f), se = cEMAV(c, sl);
  const mv = [], mt = [];
  for (let i = sl-1; i < data.length; i++) {
    if (fe[i] !== null && se[i] !== null) { mv.push(fe[i] - se[i]); mt.push(data[i].time); }
  }
  const sv = cEMAV(mv, sg);
  const macd = [], signal = [], histogram = [];
  for (let i = sg-1; i < mv.length; i++) {
    if (sv[i] === null) continue;
    const m = mv[i], s = sv[i], h = m - s;
    macd.push({ time: mt[i], value: m });
    signal.push({ time: mt[i], value: s });
    histogram.push({ time: mt[i], value: h, color: h >= 0 ? '#00e5a044' : '#ff3d5a44' });
  }
  return { macd, signal, histogram };
}

// ── DRAWING TOOLS ────────────────────
function setupDraw() {
  const cv = document.getElementById('dc');
  const ar = document.getElementById('ca');
  const sync = () => { cv.width = ar.clientWidth; cv.height = ar.clientHeight; };
  new ResizeObserver(sync).observe(ar);
  sync();
  cv.addEventListener('mousedown', onDm);
  cv.addEventListener('mousemove', onMm);
  cv.addEventListener('mouseup',   onUm);
  cv.addEventListener('dblclick', e => {
    if (drawMode !== 'none') return;
    const p = gc(e);
    if (!p) return;
    const i = drawings.findIndex(d => near(d, p));
    if (i !== -1) { drawings.splice(i, 1); rd(); }
  });
  mc.timeScale().subscribeVisibleLogicalRangeChange(() => rd());
}

function gc(e) {
  const p = document.getElementById('mp').getBoundingClientRect();
  const x = e.clientX - p.left, y = e.clientY - p.top;
  if (!mc || !ms) return null;
  const t = mc.timeScale().coordinateToTime(x);
  const pr = ms.coordinateToPrice(y);
  if (t == null || pr == null) return null;
  return { x, y, time: t, price: pr };
}

function onDm(e) {
  if (drawMode === 'none') return;
  const p = gc(e);
  if (!p) return;
  if (drawMode === 'hline') { drawings.push({ type: 'hline', price: p.price }); rd(); return; }
  drawPrev = { type: drawMode, start: p, end: p };
}

function onMm(e) {
  if (!drawPrev) return;
  const p = gc(e);
  if (p) { drawPrev.end = p; rd(drawPrev); }
}

function onUm(e) {
  if (!drawPrev) return;
  const p = gc(e);
  if (p) drawPrev.end = p;
  drawings.push({ ...drawPrev });
  drawPrev = null;
  rd();
}

function rd(preview = null) {
  const cv  = document.getElementById('dc');
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, cv.width, cv.height);
  const pr = document.getElementById('mp').getBoundingClientRect();
  const ar = document.getElementById('ca').getBoundingClientRect();
  const oy = pr.top - ar.top;
  const tp = pt => ({
    x: mc.timeScale().timeToCoordinate(pt.time),
    y: ms.priceToCoordinate(pt.price) !== null ? ms.priceToCoordinate(pt.price) + oy : null
  });
  [...drawings, ...(preview ? [preview] : [])].forEach(d => ds(ctx, d, tp, cv.width, cv.height, oy));
}

function ds(ctx, d, tp, w, h, oy) {
  ctx.save();
  if (d.type === 'hline') {
    const y = ms.priceToCoordinate(d.price);
    if (y === null) { ctx.restore(); return; }
    const py = y + oy;
    ctx.strokeStyle = '#ffb54770'; ctx.lineWidth = 1; ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(w, py); ctx.stroke();
    ctx.fillStyle = '#ffb547'; ctx.font = "10px 'IBM Plex Mono'";
    ctx.fillText(fmtP(d.price), w - 72, py - 4);
  } else if (d.type === 'trend') {
    const p1 = tp(d.start), p2 = tp(d.end);
    if (!p1.x || !p2.x || !p1.y || !p2.y) { ctx.restore(); return; }
    const dx = p2.x - p1.x, dy = p2.y - p1.y, len = Math.sqrt(dx*dx + dy*dy);
    if (!len) { ctx.restore(); return; }
    const sc = Math.max(w, h) * 3;
    ctx.strokeStyle = '#00e5a070'; ctx.lineWidth = 1.5; ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(p1.x - (dx/len)*sc, p1.y - (dy/len)*sc);
    ctx.lineTo(p1.x + (dx/len)*sc, p1.y + (dy/len)*sc);
    ctx.stroke();
    ctx.fillStyle = '#00e5a0';
    [[p1.x, p1.y], [p2.x, p2.y]].forEach(([px, py]) => {
      ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI*2); ctx.fill();
    });
  } else if (d.type === 'fib') {
    const p1 = tp(d.start), p2 = tp(d.end);
    if (!p1.x || !p2.x) { ctx.restore(); return; }
    const hi = Math.max(d.start.price, d.end.price);
    const lo = Math.min(d.start.price, d.end.price);
    const rng = hi - lo;
    const x1 = Math.min(p1.x, p2.x), x2 = Math.max(p1.x, p2.x);
    FL.forEach((lv, i) => {
      const pr2 = lo + rng * (1-lv);
      const y = ms.priceToCoordinate(pr2);
      if (y === null) return;
      const py = y + oy;
      ctx.strokeStyle = FC[i] + '50'; ctx.lineWidth = 1;
      ctx.setLineDash(lv === 0 || lv === 1 ? [] : [4, 3]);
      ctx.beginPath(); ctx.moveTo(x1, py); ctx.lineTo(x2, py); ctx.stroke();
      ctx.fillStyle = FC[i]; ctx.font = "9px 'IBM Plex Mono'";
      ctx.fillText(`${(lv*100).toFixed(1)}% — ${fmtP(pr2)}`, x2+5, py+3);
    });
  }
  ctx.restore();
}

function near(d, p) {
  return d.type === 'hline' && Math.abs(d.price - p.price) / p.price < 0.003;
}

/** Public: toggle draw mode — click same button again to back out */
function toggleDraw(mode) {
  if (drawMode === mode) {
    drawMode = 'none';
    document.getElementById('d-' + mode)?.classList.remove('don');
  } else {
    drawMode = mode;
    document.querySelectorAll('[id^=d-]').forEach(b => b.classList.remove('don'));
    document.getElementById('d-' + mode)?.classList.add('don');
  }
  const cv = document.getElementById('dc');
  cv.style.pointerEvents = drawMode === 'none' ? 'none' : 'all';
  cv.style.cursor = drawMode === 'none' ? 'default' : 'crosshair';
}

function setDraw(mode) {
  drawMode = mode;
  document.querySelectorAll('[id^=d-]').forEach(b => b.classList.remove('don'));
  const b = document.getElementById('d-' + mode);
  if (b) b.classList.add('don');
  const cv = document.getElementById('dc');
  cv.style.pointerEvents = mode === 'none' ? 'none' : 'all';
  cv.style.cursor = mode === 'none' ? 'default' : 'crosshair';
}

/** Public: clear all drawings */
function clearDrawings() { drawings = []; rd(); }

// ── RESIZE ───────────────────────────
function setupResize() {
  window.addEventListener('resize', resizeCharts);
  new ResizeObserver(resizeCharts).observe(document.getElementById('ca'));
}

function resizeCharts() {
  const ar = document.getElementById('ca');
  if (!mc) return;
  const w = ar.clientWidth;
  const h = ar.clientHeight;
  mc.applyOptions({ width: w, height: Math.max(80, h) });
  const cv = document.getElementById('dc');
  cv.width = w; cv.height = h; rd();
}

// ── PRICE BAR ────────────────────────
function updatePriceBar() {
  if (!rawData.length) return;
  const last = rawData[rawData.length - 1];
  const prev = rawData.length > 1 ? rawData[rawData.length - 2] : last;
  const ch  = last.close - prev.close;
  const pct = (ch / prev.close * 100).toFixed(2);
  document.getElementById('px').textContent = fmtP(last.close);
  const el = document.getElementById('pch');
  el.textContent = (ch >= 0 ? '+' : '') + pct + '%';
  el.className = ch >= 0 ? 'up' : 'dn';
  document.getElementById('oo').textContent = fmtP(last.open);
  document.getElementById('oh').textContent = fmtP(last.high);
  document.getElementById('ol').textContent = fmtP(last.low);
  document.getElementById('oc').textContent = fmtP(last.close);
  document.getElementById('ov').textContent = fmtVol(last.volume || 0);
}

// ── INDICATOR SETTINGS PANEL ─────────
function tis() {
  const p = document.getElementById('is');
  p.style.display = p.style.display === 'block' ? 'none' : 'block';
}
document.addEventListener('click', e => {
  if (!e.target.closest('#is') && !e.target.closest('[onclick*="tis"]'))
    document.getElementById('is').style.display = 'none';
});
