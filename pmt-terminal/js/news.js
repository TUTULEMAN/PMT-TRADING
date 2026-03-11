// ════════════════════════════════════
//  NEWS — feed polling + live stream
// ════════════════════════════════════

// ── NEWS FILTER ──────────────────────
function setNF(btn, cat) {
  document.querySelectorAll('.nfb').forEach(b => b.classList.remove('on'));
  btn.classList.add('on');
  newsCat = cat;
  document.getElementById('nfeed').innerHTML = '';
  renderNews();
}

// ── FETCH NEWS FROM FINNHUB ──────────
async function fetchNews() {
  if (!KEY) throw new Error('No API key');
  const cats = ['general', 'forex', 'crypto', 'merger'];
  const results = await Promise.allSettled(
    cats.map(c => fetch(`${FH}/news?category=${c}&minId=0&token=${encodeURIComponent(KEY)}`).then(r => r.json()))
  );
  const map = new Map();
  results.forEach((r, i) => {
    if (r.status !== 'fulfilled' || !Array.isArray(r.value)) return;
    r.value.forEach(item => {
      item.category = cats[i];
      map.set(item.id || item.headline, item);
    });
  });
  return Array.from(map.values()).sort((a, b) => b.datetime - a.datetime);
}

// ── POLLING ──────────────────────────
function startNews() { pollNews(); setInterval(pollNews, 90000); }

async function pollNews() {
  const badge  = document.getElementById('nb2');
  const loadEl = document.getElementById('nload');
  const errEl  = document.getElementById('news-err');
  try {
    allNews = await fetchNews();
    if (loadEl) loadEl.remove();
    errEl.style.display = 'none';
    renderNews();
    badge.textContent = '● LIVE';
    badge.style.color = 'var(--g)';
  } catch (e) {
    badge.textContent = '● ERR';
    badge.style.color = 'var(--r)';
    if (loadEl) loadEl.remove();
    errEl.style.display = 'block';
  }
}

// ── CLASSIFY THREAT LEVEL ────────────
function classifyThreat(h) {
  if (/\b(war|attack|crash|crisis|collapse|emergency|sanctions|rate hike|rate cut|bankruptcy|default|terror|coup|halt trading)\b/i.test(h))
    return 'hi';
  if (/\b(plunge|rally|surge|spike|volatility|inflation|earnings miss|downgrade|investigation|lawsuit|SEC probe)\b/i.test(h))
    return 'md';
  return null;
}

// ── RENDER FEED ──────────────────────
function renderNews() {
  const feed = document.getElementById('nfeed');
  const filtered = newsCat === 'all'    ? allNews
                 : newsCat === 'urgent' ? allNews.filter(i => classifyThreat(i.headline) === 'hi')
                 : allNews.filter(i => i.category === newsCat);

  filtered.slice(0, 80).forEach(item => {
    const id = String(item.id || item.headline || '').slice(0, 50);
    if (feed.querySelector(`[data-id="${id}"]`)) return;
    const fresh  = !seenNews.has(id);
    seenNews.add(id);
    const sent   = gSent(item.headline);
    const threat = classifyThreat(item.headline);
    const el = document.createElement('div');
    el.className = 'ni' + (fresh ? ' fr' : '') + (threat === 'hi' ? ' urg' : threat === 'md' ? ' wrn' : '');
    el.dataset.id = id;
    el.innerHTML = `
      <div class="nsrc">
        ${esc(item.source || 'Finnhub')}
        ${threat ? `<span class="tbadge ${threat}">${threat === 'hi' ? '⚡ URGENT' : '⚠ WATCH'}</span>` : ''}
      </div>
      <div class="nhl">${esc(item.headline)}</div>
      <div class="nmeta">
        <span>${timeAgo(item.datetime)}</span>
        ${item.related && item.related !== 'N/A' ? `<span class="ntag">${esc(item.related.split(',')[0])}</span>` : ''}
        <span class="sd ${sent}"></span>
      </div>`;
    el.addEventListener('click', () => item.url && window.open(item.url, '_blank'));
    feed.prepend(el);
  });
}

// ════════════════════════════════════
//  LIVE STREAM (YouTube IFrame Player API)
// ════════════════════════════════════

window._ytPlayer = null;
window._ytReady  = false;
window._ytPendingLoad = null;

// Load YouTube IFrame API script once
function _loadYTApi() {
  if (window.YT && window.YT.Player) { window._ytReady = true; return; }
  if (document.getElementById('yt-api-script')) return;
  const tag = document.createElement('script');
  tag.id = 'yt-api-script';
  tag.src = 'https://www.youtube.com/iframe_api';
  document.head.appendChild(tag);
}

// Called automatically by YouTube API when ready
window.onYouTubeIframeAPIReady = function () {
  window._ytReady = true;
  if (window._ytPendingLoad) {
    const { channelId, extUrl } = window._ytPendingLoad;
    window._ytPendingLoad = null;
    _createPlayer(channelId, extUrl);
  }
};

function _showBlocked(extUrl) {
  const frame   = document.getElementById('stream-frame');
  const blocked = document.getElementById('stream-blocked');
  const extLink = document.getElementById('stream-ext');
  if (frame) frame.style.display = 'none';
  if (blocked) blocked.style.display = 'flex';
  if (extLink) extLink.href = extUrl || '#';
  if (_ytPlayer) { try { _ytPlayer.destroy(); } catch (e) {} _ytPlayer = null; }
}

function _createPlayer(channelId, extUrl) {
  const container = document.getElementById('stream-frame');
  const blocked   = document.getElementById('stream-blocked');
  const extLink   = document.getElementById('stream-ext');
  if (extLink) extLink.href = extUrl || '#';

  // Clean up previous player
  if (_ytPlayer) { try { _ytPlayer.destroy(); } catch (e) {} _ytPlayer = null; }

  // Reset the iframe element (YT API replaces it)
  container.style.display = 'block';
  if (blocked) blocked.style.display = 'none';

  try {
    _ytPlayer = new YT.Player('stream-frame', {
      width: '100%',
      height: '100%',
      playerVars: {
        autoplay: 0,
        mute: 1,
        modestbranding: 1,
        rel: 0,
      },
      events: {
        onReady: function (e) {
          // Load the channel's live stream
          e.target.loadPlaylist({ list: channelId, listType: 'user_uploads' });
          // Try to load the live broadcast via search
          e.target.cueVideoByUrl({
            mediaContentUrl: `https://www.youtube.com/embed/live_stream?channel=${channelId}`,
            startSeconds: 0
          });
        },
        onError: function (e) {
          // Error codes: 2=invalid param, 5=HTML5 error, 100=not found,
          // 101/150/153=embed restricted
          console.warn('YT Player error:', e.data);
          _showBlocked(extUrl);
        },
        onStateChange: function (e) {
          // -1 = unstarted — if it stays unstarted for too long, show fallback
        }
      }
    });
  } catch (e) {
    console.warn('YT Player creation failed:', e);
    _showBlocked(extUrl);
  }
}

function initStream() {
  _loadYTApi();
  // Try France 24 on boot with a small delay for API to load
  setTimeout(() => loadStream('france24'), 800);
}

function loadStream(name) {
  const channelId = (streamChannelIds || {})[name];
  const extUrl    = (streamExtUrls || {})[name] || '#';
  const extLink   = document.getElementById('stream-ext');
  if (extLink) extLink.href = extUrl;

  if (!channelId) {
    _showBlocked(extUrl);
    return;
  }

  _loadYTApi();

  if (!_ytReady) {
    // Queue it — will fire when API loads
    _ytPendingLoad = { channelId, extUrl };
    return;
  }

  // Use simple iframe embed with live_stream channel URL (most reliable)
  const frame   = document.getElementById('stream-frame');
  const blocked = document.getElementById('stream-blocked');

  // If YT API replaced our iframe, recreate it
  if (!frame || frame.tagName !== 'IFRAME') {
    const inner = document.getElementById('stream-inner');
    if (_ytPlayer) { try { _ytPlayer.destroy(); } catch (e) {} _ytPlayer = null; }
    const newFrame = document.createElement('iframe');
    newFrame.id = 'stream-frame';
    newFrame.allowFullscreen = true;
    newFrame.allow = 'autoplay;encrypted-media';
    inner.insertBefore(newFrame, inner.firstChild);
  }

  const f = document.getElementById('stream-frame');
  if (blocked) blocked.style.display = 'none';
  f.style.display = 'block';

  // Use live_stream?channel= format — auto-resolves to current live broadcast
  f.src = `https://www.youtube.com/embed/live_stream?channel=${channelId}&autoplay=0&mute=1`;

  // Fallback: if iframe fails to load content, show external link after timeout
  const fallbackTimer = setTimeout(() => _showBlocked(extUrl), 8000);
  f.onload = () => clearTimeout(fallbackTimer);
  f.onerror = () => { clearTimeout(fallbackTimer); _showBlocked(extUrl); };
}

function loadCustomStream() {
  const raw = document.getElementById('sui').value.trim();
  if (!raw) return;
  let vid = '';
  try { const u = new URL(raw); vid = u.searchParams.get('v') || u.pathname.split('/').pop(); }
  catch (e) { vid = raw; }
  if (!vid) return;

  // Recreate iframe if YT API replaced it
  let frame = document.getElementById('stream-frame');
  if (!frame || frame.tagName !== 'IFRAME') {
    const inner = document.getElementById('stream-inner');
    if (_ytPlayer) { try { _ytPlayer.destroy(); } catch (e) {} _ytPlayer = null; }
    const newFrame = document.createElement('iframe');
    newFrame.id = 'stream-frame';
    newFrame.allowFullscreen = true;
    newFrame.allow = 'autoplay;encrypted-media';
    inner.insertBefore(newFrame, inner.firstChild);
    frame = newFrame;
  }

  const blocked = document.getElementById('stream-blocked');
  document.getElementById('stream-ext').href = `https://www.youtube.com/watch?v=${vid}`;
  frame.style.display   = 'block';
  blocked.style.display = 'none';
  frame.src = `https://www.youtube.com/embed/${vid}?autoplay=1&mute=0`;
  document.getElementById('sui').value = '';
}

function toggleStream() {
  const w = document.getElementById('stream-wrap');
  w.classList.toggle('shut');
  document.getElementById('stog').textContent = w.classList.contains('shut') ? '▸' : '▾';
}
