// ════════════════════════════════════
//  CALENDAR — Interactive world map + event grid
//  Map: Leaflet + OpenStreetMap (free, no API key)
//  Data: Finnhub (IPO + economic), SEC EDGAR (filings)
//  Colors: red = imminent, amber = soon, green = later, dim = past
// ════════════════════════════════════

let calendarInitialized = false;
let calMap = null;          // Leaflet map instance
let calMarkers = null;      // MarkerClusterGroup

function calendarContainerEl() {
  return document.getElementById('calendar-container');
}

function dateRange(daysAhead, daysBack) {
  const to = new Date();
  const from = new Date();
  to.setDate(to.getDate() + (daysAhead || 14));
  from.setDate(from.getDate() - (daysBack || 7));
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
}

// ── COUNTRY / EXCHANGE → LAT,LNG ────────────────────────────────────
const COUNTRY_COORDS = {
  US:[38.9,-77],CA:[45.4,-75.7],MX:[19.4,-99.1],BR:[-15.8,-47.9],AR:[-34.6,-58.4],
  GB:[51.51,-0.13],DE:[50.1,8.7],FR:[48.86,2.35],IT:[41.9,12.5],ES:[40.42,-3.7],
  NL:[52.37,4.9],BE:[50.85,4.35],CH:[46.95,7.45],SE:[59.33,18.07],NO:[59.91,10.75],
  DK:[55.68,12.57],FI:[60.17,24.94],IE:[53.35,-6.26],PT:[38.72,-9.14],AT:[48.21,16.37],
  PL:[52.23,21.01],GR:[37.98,23.73],CZ:[50.08,14.44],RO:[44.43,26.1],HU:[47.5,19.04],
  JP:[35.68,139.69],CN:[39.9,116.4],HK:[22.32,114.17],KR:[37.57,126.98],TW:[25.03,121.57],
  IN:[28.61,77.23],SG:[1.35,103.82],AU:[-33.87,151.21],NZ:[-41.29,174.78],
  RU:[55.76,37.62],TR:[41.01,28.98],ZA:[-33.93,18.42],SA:[24.71,46.67],AE:[25.2,55.27],
  IL:[32.07,34.78],EG:[30.04,31.24],NG:[9.06,7.49],KE:[-1.29,36.82],
  TH:[13.76,100.5],VN:[21.03,105.85],ID:[-6.21,106.85],MY:[3.14,101.69],PH:[14.6,121],
  CL:[-33.45,-70.65],CO:[4.71,-74.07],PE:[-12.05,-77.04]
};

const EXCHANGE_COUNTRY = {
  NYSE:'US',NASDAQ:'US',AMEX:'US',OTC:'US',
  TSX:'CA',LSE:'GB',FRA:'DE',TYO:'JP',SSE:'CN',
  HKEX:'HK',KRX:'KR',BSE:'IN',NSE:'IN',ASX:'AU',
  SGX:'SG',BM:'BR',BMV:'MX'
};

function countryLatLng(code) {
  if (!code) return null;
  const c = code.toUpperCase().trim();
  if (COUNTRY_COORDS[c]) return COUNTRY_COORDS[c];
  if (EXCHANGE_COUNTRY[c] && COUNTRY_COORDS[EXCHANGE_COUNTRY[c]]) return COUNTRY_COORDS[EXCHANGE_COUNTRY[c]];
  return null;
}

// Full country names for display
const COUNTRY_NAMES = {
  US:'United States',CA:'Canada',MX:'Mexico',BR:'Brazil',AR:'Argentina',
  GB:'United Kingdom',DE:'Germany',FR:'France',IT:'Italy',ES:'Spain',
  NL:'Netherlands',BE:'Belgium',CH:'Switzerland',SE:'Sweden',NO:'Norway',
  DK:'Denmark',FI:'Finland',IE:'Ireland',PT:'Portugal',AT:'Austria',
  PL:'Poland',GR:'Greece',CZ:'Czech Republic',RO:'Romania',HU:'Hungary',
  JP:'Japan',CN:'China',HK:'Hong Kong',KR:'South Korea',TW:'Taiwan',
  IN:'India',SG:'Singapore',AU:'Australia',NZ:'New Zealand',
  RU:'Russia',TR:'Turkey',ZA:'South Africa',SA:'Saudi Arabia',AE:'UAE',
  IL:'Israel',EG:'Egypt',NG:'Nigeria',KE:'Kenya',
  TH:'Thailand',VN:'Vietnam',ID:'Indonesia',MY:'Malaysia',PH:'Philippines',
  CL:'Chile',CO:'Colombia',PE:'Peru'
};

// ── DATE HEAT (red → amber → green → dim) ───────────────────────────
function dateHeatClass(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = Math.round((d - now) / 86400000);
  if (diff < 0) return 'cal-past';
  if (diff <= 1) return 'cal-hot';
  if (diff <= 5) return 'cal-warm';
  return 'cal-cool';
}

function heatColor(dateStr) {
  const cls = dateHeatClass(dateStr);
  if (cls === 'cal-hot') return '#ff3c3c';
  if (cls === 'cal-warm') return '#ffb428';
  if (cls === 'cal-cool') return '#28c864';
  return '#666';
}

// ── FETCH: Finnhub IPO calendar ──────────────────────────────────────
async function fetchIpoCalendar(from, to) {
  if (typeof KEY === 'undefined' || !KEY) return [];
  try {
    const r = await fetch(`${FH}/calendar/ipo?from=${from}&to=${to}&token=${encodeURIComponent(KEY)}`);
    const j = await r.json().catch(() => ({}));
    return Array.isArray(j) ? j : (j && j.ipoCalendar) ? j.ipoCalendar : [];
  } catch (e) { console.warn('[Calendar] IPO fetch failed', e); return []; }
}

// ── FETCH: Finnhub economic calendar ─────────────────────────────────
async function fetchEconomicCalendar(from, to) {
  if (typeof KEY === 'undefined' || !KEY) return [];
  try {
    const r = await fetch(`${FH}/calendar/economic?from=${from}&to=${to}&token=${encodeURIComponent(KEY)}`);
    const j = await r.json().catch(() => ({}));
    return Array.isArray(j) ? j : (j && j.data) ? j.data : [];
  } catch (e) { console.warn('[Calendar] Economic fetch failed', e); return []; }
}

// ── FETCH: SEC filings ───────────────────────────────────────────────
const SEC_HEADERS = {
  'Accept': 'application/json',
  'User-Agent': 'PMT-Terminal/1.0 (https://github.com; educational)'
};

let secTickerMap = null;
async function fetchSecTickerMap() {
  if (secTickerMap) return secTickerMap;
  try {
    const r = await fetch('https://www.sec.gov/files/company_tickers.json', { headers: SEC_HEADERS });
    const j = await r.json().catch(() => ({}));
    if (j && typeof j === 'object') {
      secTickerMap = {};
      Object.values(j).forEach(o => {
        const t = (o.ticker || '').toUpperCase();
        if (t) secTickerMap[t] = { cik: String((o.cik_str != null ? o.cik_str : o.cik)).padStart(10, '0'), name: o.title || t };
      });
      return secTickerMap;
    }
  } catch (e) { console.warn('[Calendar] SEC ticker map failed', e); }
  return {};
}

async function fetchSecSubmissions(cik) {
  try {
    const r = await fetch(`https://data.sec.gov/submissions/CIK${cik}.json`, { headers: SEC_HEADERS });
    const j = await r.json().catch(() => ({}));
    if (!j || !j.filings || !j.filings.recent) return [];
    const recent = j.filings.recent;
    const form = recent.form || [];
    const date = recent.filingDate || [];
    const acc = recent.accessionNumber || [];
    const count = Math.min(form.length, date.length, 20);
    const out = [];
    for (let i = 0; i < count; i++) {
      const f = (form[i] || '').toUpperCase();
      if (!['10-K', '10-Q', '8-K', 'S-1', '4', 'DEF 14A'].includes(f)) continue;
      out.push({ form: form[i], date: date[i], accession: (acc[i] || '').replace(/-/g, '') });
    }
    return out.slice(0, 10);
  } catch (e) { return []; }
}

async function fetchRecentSecFilings(tickers) {
  const map = await fetchSecTickerMap();
  const results = [];
  const list = (tickers && tickers.length) ? tickers : (typeof TICKER !== 'undefined' ? TICKER : ['AAPL', 'MSFT', 'NVDA']);
  for (const ticker of list.slice(0, 6)) {
    const t = ticker.toUpperCase().replace(/^BINANCE:|OANDA:.*$/i, '').trim();
    if (!t || t.length > 6) continue;
    const info = map[t];
    if (!info) continue;
    const filings = await fetchSecSubmissions(info.cik);
    if (filings.length) results.push({ ticker: t, name: info.name, filings, cik: info.cik });
  }
  return results;
}

// ── RENDER HELPERS ───────────────────────────────────────────────────
function _esc(s) {
  if (s == null) return '';
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function renderIpoColumn(data) {
  if (!data || !data.length) return '<p class="cal-empty">No IPO data in range.</p>';
  const sorted = [...data].sort((a, b) => (a.date || a.ipoDate || '').localeCompare(b.date || b.ipoDate || ''));
  return `<ul class="cal-list">${sorted.map(d => {
    const dt = d.date || d.ipoDate || '';
    const heat = dateHeatClass(dt);
    return `<li class="cal-item ${heat}">
      <span class="cal-date">${_esc(dt)}</span>
      <span class="cal-title">${_esc(d.name || d.companyName || '—')}</span>
      ${(d.exchange || d.symbol) ? `<span class="cal-meta">${_esc(d.exchange || '')} ${_esc(d.symbol || '')}</span>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

function renderEconomicColumn(data) {
  if (!data || !data.length) return '<p class="cal-empty">No economic events in range.</p>';
  const sorted = [...data].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  return `<ul class="cal-list">${sorted.map(d => {
    const heat = dateHeatClass(d.date);
    return `<li class="cal-item ${heat}">
      <span class="cal-date">${_esc(d.date || '')}</span>
      <span class="cal-title">${_esc(d.country || '')} · ${_esc(d.event || d.title || '')}</span>
      ${d.actual != null ? `<span class="cal-meta">Actual: ${_esc(String(d.actual))}</span>` : ''}
    </li>`;
  }).join('')}</ul>`;
}

function renderSecColumn(data) {
  if (!data || !data.length) return '<p class="cal-empty">No recent SEC filings found.</p>';
  return data.map(({ ticker, name, filings, cik }) => `
    <div class="cal-sec-company">
      <div class="cal-sec-name">${_esc(ticker)} — ${_esc(name || '')}</div>
      <ul class="cal-list">${filings.map(f => {
        const heat = dateHeatClass(f.date);
        return `<li class="cal-item ${heat}">
          <span class="cal-date">${_esc(f.date)}</span>
          <span class="cal-title">${_esc(f.form)}</span>
          <a class="cal-link" href="https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${cik || ticker}&type=${_esc(f.form)}&dateb=&owner=include&count=10" target="_blank" rel="noopener">SEC →</a>
        </li>`;
      }).join('')}</ul>
    </div>
  `).join('');
}

// ── SKELETON ─────────────────────────────────────────────────────────
function renderCalendarSkeleton() {
  return `
    <div id="cal-map-wrap" class="cal-map-wrap">
      <div id="cal-map" class="cal-map"></div>
      <div class="cal-map-hint">Scroll to zoom · Drag to pan · Click a marker for events</div>
    </div>
    <div class="cal-grid">
      <div class="cal-col" id="cal-col-ipo">
        <div class="cal-col-head"><span class="cal-col-icon">🔔</span><span class="cal-col-label">IPO Calendar</span></div>
        <div class="cal-col-body"><div class="cal-loading">Loading IPOs…</div></div>
      </div>
      <div class="cal-col" id="cal-col-eco">
        <div class="cal-col-head"><span class="cal-col-icon">📊</span><span class="cal-col-label">Economic Events</span></div>
        <div class="cal-col-body"><div class="cal-loading">Loading events…</div></div>
      </div>
      <div class="cal-col" id="cal-col-sec">
        <div class="cal-col-head"><span class="cal-col-icon">📄</span><span class="cal-col-label">SEC Filings</span></div>
        <div class="cal-col-body"><div class="cal-loading">Loading filings…</div></div>
      </div>
    </div>
    <div class="cal-legend">
      <span class="cal-legend-dot cal-hot"></span> Today / tomorrow
      <span class="cal-legend-dot cal-warm"></span> This week
      <span class="cal-legend-dot cal-cool"></span> Later
      <span class="cal-legend-dot cal-past"></span> Past
      <span style="margin-left:auto;opacity:.6">Map: OpenStreetMap · Data: Finnhub · SEC EDGAR</span>
    </div>`;
}

// ── MAP INIT ─────────────────────────────────────────────────────────
function initCalMap() {
  if (calMap) return;
  const el = document.getElementById('cal-map');
  if (!el || typeof L === 'undefined') return;

  calMap = L.map(el, {
    center: [25, 10],
    zoom: 2,
    minZoom: 2,
    maxZoom: 12,
    zoomControl: true,
    attributionControl: false,
    worldCopyJump: true
  });

  // Dark-themed tiles that match the terminal aesthetic
  L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19
  }).addTo(calMap);

  L.control.attribution({ position: 'bottomright', prefix: false })
    .addAttribution('© <a href="https://www.openstreetmap.org/copyright" target="_blank">OSM</a> · <a href="https://carto.com/" target="_blank">CARTO</a>')
    .addTo(calMap);

  calMarkers = L.markerClusterGroup({
    maxClusterRadius: 40,
    spiderfyOnMaxZoom: true,
    showCoverageOnHover: false,
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      let size = 'small';
      if (count > 20) size = 'large';
      else if (count > 5) size = 'medium';
      return L.divIcon({
        html: `<span>${count}</span>`,
        className: 'cal-cluster cal-cluster-' + size,
        iconSize: L.point(36, 36)
      });
    }
  });
  calMap.addLayer(calMarkers);
}

// ── PLOT EVENTS ON MAP ───────────────────────────────────────────────
function plotEventsOnMap(economicData, ipoData) {
  if (!calMap || !calMarkers) return;
  calMarkers.clearLayers();

  // Group events by country code
  const byCountry = {};

  (economicData || []).forEach(d => {
    const code = (d.country || '').toUpperCase().trim();
    if (!code || !countryLatLng(code)) return;
    if (!byCountry[code]) byCountry[code] = { eco: [], ipo: [] };
    byCountry[code].eco.push(d);
  });

  (ipoData || []).forEach(d => {
    const ex = (d.exchange || '').toUpperCase().trim();
    const code = EXCHANGE_COUNTRY[ex] || 'US';
    if (!countryLatLng(code)) return;
    if (!byCountry[code]) byCountry[code] = { eco: [], ipo: [] };
    byCountry[code].ipo.push(d);
  });

  Object.entries(byCountry).forEach(([code, events]) => {
    const ll = countryLatLng(code);
    if (!ll) return;
    const total = events.eco.length + events.ipo.length;
    const countryName = COUNTRY_NAMES[code] || code;

    // Pick color based on most urgent event
    let urgentColor = '#28c864';
    const allDates = [
      ...events.eco.map(e => e.date),
      ...events.ipo.map(e => e.date || e.ipoDate)
    ].filter(Boolean);
    for (const dt of allDates) {
      const c = heatColor(dt);
      if (c === '#ff3c3c') { urgentColor = c; break; }
      if (c === '#ffb428') urgentColor = c;
    }

    const icon = L.divIcon({
      html: `<div class="cal-map-dot" style="background:${urgentColor};box-shadow:0 0 8px ${urgentColor}">${total}</div>`,
      className: 'cal-map-icon',
      iconSize: [28, 28],
      iconAnchor: [14, 14]
    });

    // Build popup HTML
    let popupHtml = `<div class="cal-popup"><div class="cal-popup-head">${_esc(countryName)} <span style="opacity:.5">(${code})</span></div>`;

    if (events.eco.length) {
      const sorted = [...events.eco].sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      popupHtml += '<div class="cal-popup-section">Economic</div>';
      popupHtml += sorted.slice(0, 15).map(e => {
        const color = heatColor(e.date);
        return `<div class="cal-popup-row">
          <span class="cal-popup-date" style="color:${color}">${_esc(e.date || '')}</span>
          <span class="cal-popup-ev">${_esc(e.event || e.title || '')}</span>
          ${e.actual != null ? `<span class="cal-popup-val">${e.actual}</span>` : ''}
        </div>`;
      }).join('');
      if (events.eco.length > 15) popupHtml += `<div class="cal-popup-more">+${events.eco.length - 15} more</div>`;
    }

    if (events.ipo.length) {
      const sorted = [...events.ipo].sort((a, b) => (a.date || a.ipoDate || '').localeCompare(b.date || b.ipoDate || ''));
      popupHtml += '<div class="cal-popup-section">IPOs</div>';
      popupHtml += sorted.slice(0, 10).map(e => {
        const dt = e.date || e.ipoDate || '';
        const color = heatColor(dt);
        return `<div class="cal-popup-row">
          <span class="cal-popup-date" style="color:${color}">${_esc(dt)}</span>
          <span class="cal-popup-ev">${_esc(e.name || e.companyName || '—')}</span>
          ${e.symbol ? `<span class="cal-popup-val">${_esc(e.symbol)}</span>` : ''}
        </div>`;
      }).join('');
    }

    popupHtml += '</div>';

    const marker = L.marker(ll, { icon });
    marker.bindPopup(popupHtml, { maxWidth: 340, maxHeight: 300, className: 'cal-popup-container' });
    calMarkers.addLayer(marker);
  });
}

// ── LOAD DATA ────────────────────────────────────────────────────────
async function loadCalendarData() {
  const { from, to } = dateRange(30, 7);
  const [ipoData, economicData] = await Promise.all([
    fetchIpoCalendar(from, to),
    fetchEconomicCalendar(from, to)
  ]);
  const secData = await fetchRecentSecFilings();

  const ipoBody = document.querySelector('#cal-col-ipo .cal-col-body');
  const ecoBody = document.querySelector('#cal-col-eco .cal-col-body');
  const secBody = document.querySelector('#cal-col-sec .cal-col-body');
  if (ipoBody) ipoBody.innerHTML = renderIpoColumn(ipoData);
  if (ecoBody) ecoBody.innerHTML = renderEconomicColumn(economicData);
  if (secBody) secBody.innerHTML = renderSecColumn(secData);

  plotEventsOnMap(economicData, ipoData);
}

function initCalendar() {
  const container = calendarContainerEl();
  if (!container) return;
  if (!calendarInitialized) {
    container.innerHTML = renderCalendarSkeleton();
    calendarInitialized = true;
    setTimeout(() => {
      initCalMap();
      loadCalendarData();
    }, 100);
  } else {
    if (calMap) setTimeout(() => calMap.invalidateSize(), 100);
  }
}

