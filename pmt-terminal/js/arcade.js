// ════════════════════════════════════
//  "ARE YOU BORED?" — local poker mini-game
//  Single player vs 4 bots, runs entirely in the browser.
// ════════════════════════════════════

// Use utils.esc if available (from utils.js); else minimal escape for in-app HTML
function _esc(s) {
  if (typeof esc === 'function') return esc(s);
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Simple config for the mini-game
const BORED_PLAYER_NAMES = ['You', 'Bot 1', 'Bot 2', 'Bot 3', 'Bot 4'];
const BORED_START_STACK = 1000;
const BORED_ANTE = 10;
const BORED_MIN_RAISE = 10;
const BORED_MAX_RAISE = 200;
const BORED_TURN_MS = 10000;

window.boredState = {
  players: [],      // { id, name, wins, money, lastHandType, cards:[], strength:[], folded, handContribution }
  community: [],    // 5 board cards
  status: 'idle',   // 'idle' | 'dealt'
  phase: 'idle',    // 'idle' | 'yourTurn' | 'bots' | 'showdown'
  resultText: '',
  handCount: 0,
  actions: [],      // textual action log for this hand
  pot: 0,
  mode: 'beginner', // 'beginner' | 'advanced'
  bankHistory: [],  // [{ hand, values:[money per player]}]
  turnDeadline: 0,
  turnTimerId: null,
};

let boredChart = null;
let boredSeries = [];

// ── GAME PICKER ──────────────────────────────────────────────────────
window.arcadeGame = 'picker';

function initArcadeView() {
  const root = document.getElementById('gv');
  if (!root) return;
  if (document.getElementById('bored-root')) return;
  showArcadePicker();
}

function showArcadePicker() {
  const root = document.getElementById('gv');
  if (!root) return;
  arcadeGame = 'picker';
  root.innerHTML = `
    <div id="bored-root">
      <div class="arcade-header">
        <div class="arcade-title"><span>Are You Bored?</span><span class="arcade-pill">Pick a game</span></div>
        <div class="arcade-sub">Take a break from the charts. Pick a game below — everything runs locally in your browser.</div>
      </div>
      <div class="arcade-picker">
        <div class="arcade-pick-card" onclick="switchToPoker()">
          <div class="arcade-pick-icon">\u2660\u2665</div>
          <div class="arcade-pick-name">Poker</div>
          <div class="arcade-pick-desc">Texas Hold'em vs 4 bots. Quick hands, no accounts.</div>
        </div>
        <div class="arcade-pick-card" onclick="switchToChess()">
          <div class="arcade-pick-icon">\u265A\u265E</div>
          <div class="arcade-pick-name">Chess</div>
          <div class="arcade-pick-desc">Play as white against a simple AI. Click pieces to move.</div>
        </div>
      </div>
    </div>`;
}

function switchToPoker() { arcadeGame = 'poker'; initPokerView(); }
function switchToChess() { arcadeGame = 'chess'; initChessView(); }

function initPokerView() {
  const root = document.getElementById('gv');
  if (!root) return;
  root.innerHTML = `
    <div id="bored-root">
      <div class="arcade-header">
        <div class="arcade-title">
          <span>Are You Bored?</span>
          <span class="arcade-pill">Quick poker vs PMT bots</span>
          <button class="arcade-back-btn" onclick="showArcadePicker()">\u2190 Back</button>
        </div>
        <div class="arcade-sub">
          Deal instant Texas Hold'em hands against four bots. No accounts, no server — just quick decisions.
        </div>
      </div>
      <div class="arcade-layout">
        <div class="arcade-left">
          <div class="arcade-card">
            <div class="arcade-card-title">Your table</div>
            <div class="arcade-field">
              <label>Nickname</label>
              <input id="bored-nick" type="text" maxlength="16" placeholder="You" autocomplete="off" />
              <div class="arcade-hint">Optional — rename yourself for this session.</div>
            </div>
            <div class="arcade-field">
              <label>Mode</label>
              <div class="bored-mode-toggle">
                <button id="bored-mode-beginner" class="on" onclick="boredSetMode('beginner')">Beginner</button>
                <button id="bored-mode-advanced" onclick="boredSetMode('advanced')">Advanced</button>
              </div>
              <div class="arcade-hint">Beginner: see bot cards. Advanced: bots hidden until showdown.</div>
            </div>
            <button id="bored-deal-btn" onclick="boredDealHand()">Deal new hand</button>
            <div id="bored-status" class="arcade-status">No hands played yet.</div>
          </div>
          <div class="arcade-card">
            <div class="arcade-card-title">Scoreboard</div>
            <ul id="bored-players" class="arcade-list"></ul>
          </div>
        </div>
        <div class="arcade-right">
          <div class="arcade-card arcade-table">
            <div class="arcade-card-title">Table view</div>
            <div id="bored-table-status" class="arcade-table-status">Click "Deal new hand" to start.</div>
            <div id="bored-table-view" class="arcade-table-view">
              <div class="arcade-table-placeholder">
                <div class="arcade-table-logo">PMT</div>
                <p>We’ll deal you two cards and five community cards.<br>
                Highest Texas Hold'em hand wins each round.</p>
              </div>
            </div>
          </div>
          <div class="arcade-card">
            <div class="arcade-card-title">How it works</div>
            <div class="arcade-howto">
              <p>This is a fast, local Texas Hold'em simulator:</p>
              <ol>
                <li>You and four bots each get two cards.</li>
                <li>Five community cards are dealt on the board.</li>
                <li>We evaluate the best 5-card hand out of 7 cards for each player.</li>
                <li>Winner(s) get a point on the scoreboard.</li>
              </ol>
              <p>No betting, just quick hands to wake your brain up when you’re bored.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Initialize players
  boredState.players = BORED_PLAYER_NAMES.map((name, idx) => ({
    id: idx,
    name,
    wins: 0,
    money: BORED_START_STACK,
    lastHandType: '',
    cards: [],
    strength: null,
    folded: false,
    handContribution: 0,
  }));
  boredState.handCount = 0;
  boredState.bankHistory = [];
  boredState.pot = 0;

  boredRender();
}

// ── GAME FLOW ────────────────────────

function boredDealHand() {
  const nickEl = document.getElementById('bored-nick');
  if (nickEl) {
    const nick = nickEl.value.trim();
    if (nick) boredState.players[0].name = nick;
    else boredState.players[0].name = 'You';
  }

  // Clear any previous turn timer
  if (boredState.turnTimerId) {
    clearInterval(boredState.turnTimerId);
    boredState.turnTimerId = null;
  }

  const deck = boredBuildDeck();
  boredShuffle(deck);

  // Deal 2 hole cards to each of 5 players
  boredState.players.forEach(p => {
    p.cards = [deck.pop(), deck.pop()];
    p.strength = null;
    p.lastHandType = '';
    p.folded = false;
    p.handContribution = 0;
  });

  // Deal 5 community cards
  boredState.community = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
  boredState.status = 'dealt';
  boredState.phase = 'yourTurn';
  boredState.handCount += 1;
  boredState.actions = [];
  boredState.resultText = '';
  boredState.pot = 0;

  // Simple ante so there is money in the pot
  boredState.players.forEach(p => {
    const ante = Math.min(BORED_ANTE, p.money);
    if (ante > 0) {
      p.money -= ante;
      p.handContribution += ante;
      boredState.pot += ante;
    }
  });

  boredRender();
  boredStartTurn();
}

function boredAct(choice) {
  if (boredState.status !== 'dealt' || boredState.phase !== 'yourTurn') return;

  // Stop turn timer as soon as user acts
  if (boredState.turnTimerId) {
    clearInterval(boredState.turnTimerId);
    boredState.turnTimerId = null;
  }

  const you = boredState.players[0];
  if (!you) return;

  let raiseAmt = 0;
  if (choice === 'raise') {
    const amtEl = document.getElementById('bored-raise-amt');
    const parsed = amtEl ? parseInt(amtEl.value, 10) : 0;
    raiseAmt = isNaN(parsed) ? 0 : parsed;
    if (raiseAmt < BORED_MIN_RAISE) raiseAmt = BORED_MIN_RAISE;
    if (raiseAmt > BORED_MAX_RAISE) raiseAmt = BORED_MAX_RAISE;
    if (raiseAmt > you.money) raiseAmt = you.money;
    if (raiseAmt <= 0) choice = 'hold';
  }

  boredState.phase = 'bots';
  if (!Array.isArray(boredState.actions)) boredState.actions = [];

  let youText = '';
  if (choice === 'fold') {
    you.folded = true;
    youText = 'You fold your hand.';
  } else if (choice === 'raise') {
    youText = `You raise the stakes by $${raiseAmt}.`;
    if (raiseAmt > 0) {
      you.money -= raiseAmt;
      you.handContribution += raiseAmt;
      boredState.pot += raiseAmt;
    }
  } else {
    youText = 'You decide to hold / check.';
  }
  boredState.actions.push(youText);

  // Bots act around the table with simple personalities
  boredRunBots(choice, raiseAmt);

  // Go to showdown after this betting round.
  boredEvaluateHands();
  boredState.phase = 'showdown';
  boredRender();
}

function boredSetMode(mode) {
  if (mode !== 'beginner' && mode !== 'advanced') return;
  boredState.mode = mode;
  const b = document.getElementById('bored-mode-beginner');
  const a = document.getElementById('bored-mode-advanced');
  if (b) b.classList.toggle('on', mode === 'beginner');
  if (a) a.classList.toggle('on', mode === 'advanced');
  boredRender();
}

function boredStartTurn() {
  if (boredState.status !== 'dealt') return;
  boredState.phase = 'yourTurn';
  boredState.turnDeadline = Date.now() + BORED_TURN_MS;

  if (boredState.turnTimerId) {
    clearInterval(boredState.turnTimerId);
    boredState.turnTimerId = null;
  }

  const update = () => {
    const el = document.getElementById('bored-timer');
    const now = Date.now();
    const msLeft = boredState.turnDeadline - now;
    if (!el) {
      return;
    }
    if (msLeft <= 0) {
      el.textContent = 'Time: 0.0s';
      clearInterval(boredState.turnTimerId);
      boredState.turnTimerId = null;
      // If still waiting on the user, auto-fold
      if (boredState.status === 'dealt' && boredState.phase === 'yourTurn') {
        boredAct('fold');
      }
      return;
    }
    el.textContent = 'Time: ' + (msLeft / 1000).toFixed(1) + 's';
  };

  update();
  boredState.turnTimerId = setInterval(update, 100);
}

function boredHandStrengthForPlayer(p) {
  const seven = p.cards.concat(boredState.community);
  const { rankVec } = boredBest5Of7(seven);
  return rankVec;
}

function boredRunBots(choice, raiseAmt) {
  const bots = boredState.players.slice(1);

  bots.forEach((bot, idx) => {
    if (!bot || bot.money <= 0) return;

    const isAggro = idx === 0;        // Bot 1 aggressive
    const isBalanced = idx === 1;     // Bot 2 balanced
    const isLoose = idx === 2;        // Bot 3 loose/passive
    const isNit = idx >= 3;           // Bot 4 super conservative

    const strength = boredHandStrengthForPlayer(bot);
    const category = strength[0] || 0; // 0..8
    const r = Math.random();

    if (choice === 'fold') {
      // User folded; bots just check around.
      boredState.actions.push(`${bot.name} takes the pot uncontested.`);
      return;
    }

    if (choice === 'raise' && raiseAmt > 0) {
      // Respond to your raise.
      let action = 'calls your raise.';
      let extra = raiseAmt;

      if (isAggro) {
        if (category >= 4 || r > 0.3) {
          action = 're-raises aggressively.';
          extra = Math.min(Math.round(raiseAmt * 1.5), BORED_MAX_RAISE);
        } else if (r < 0.15) {
          bot.folded = true;
          boredState.actions.push(`${bot.name} folds to your raise.`);
          return;
        }
      } else if (isBalanced) {
        if (category >= 3 && r > 0.2) {
          action = 'calls your raise.';
        } else if (r < 0.25) {
          bot.folded = true;
          boredState.actions.push(`${bot.name} folds, not loving this spot.`);
          return;
        } else {
          action = 'calls your raise cautiously.';
        }
      } else if (isLoose) {
        if (r < 0.15 && category <= 2) {
          bot.folded = true;
          boredState.actions.push(`${bot.name} gets scared and folds.`);
          return;
        } else {
          action = 'splash-calls your raise.';
        }
      } else if (isNit) {
        if (category >= 5 && r > 0.3) {
          action = 'reluctantly calls — very strong hand.';
        } else {
          bot.folded = true;
          boredState.actions.push(`${bot.name} instantly folds anything but a premium hand.`);
          return;
        }
      }

      extra = Math.min(extra, bot.money);
      if (extra > 0) {
        bot.money -= extra;
        bot.handContribution += extra;
        boredState.pot += extra;
      }
      boredState.actions.push(`${bot.name} ${action}`);
    } else {
      // You checked / held; bots may bet or check based on style.
      if (isAggro && r > 0.3 && bot.money > 0) {
        const bet = Math.min(BORED_MIN_RAISE * 2, bot.money);
        bot.money -= bet;
        bot.handContribution += bet;
        boredState.pot += bet;
        boredState.actions.push(`${bot.name} probes the pot for $${bet}.`);
      } else if ((isBalanced || isLoose) && r > 0.7 && bot.money > 0) {
        const bet = Math.min(BORED_MIN_RAISE, bot.money);
        bot.money -= bet;
        bot.handContribution += bet;
        boredState.pot += bet;
        boredState.actions.push(`${bot.name} tosses in a small bet of $${bet}.`);
      } else {
        boredState.actions.push(`${bot.name} checks.`);
      }
    }
  });
}

// ── DECK HELPERS ─────────────────────

function boredBuildDeck() {
  const ranks = ['2','3','4','5','6','7','8','9','T','J','Q','K','A'];
  const suits = ['♠','♥','♦','♣'];
  const deck = [];
  for (let r of ranks) {
    for (let s of suits) deck.push(r + s);
  }
  return deck;
}

function boredShuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// ── HAND EVALUATION ──────────────────

function boredEvaluateHands() {
  const contenders = [];
  boredState.players.forEach(p => {
    if (p.folded) {
      p.strength = null;
      p.lastHandType = '';
      return;
    }
    const seven = p.cards.concat(boredState.community);
    const { rankVec, handType } = boredBest5Of7(seven);
    p.strength = rankVec;
    p.lastHandType = handType;
    contenders.push({ player: p, rankVec });
  });

  if (!contenders.length) {
    boredState.resultText = 'Everyone folded this hand.';
    return;
  }

  // Find winner(s)
  contenders.sort((a, b) => boredCompareRankVec(b.rankVec, a.rankVec));
  const best = contenders[0].rankVec;
  const winners = contenders.filter(x => boredCompareRankVec(x.rankVec, best) === 0).map(x => x.player);

  // Distribute pot across winners
  const pot = boredState.pot || 0;
  if (pot > 0 && winners.length) {
    const share = Math.floor(pot / winners.length);
    let remainder = pot - share * winners.length;
    winners.forEach((w, idx) => {
      let gain = share;
      if (remainder > 0) {
        gain += 1;
        remainder -= 1;
      }
      w.money += gain;
      w.wins += 1;
    });
    boredState.pot = 0;
  } else {
    winners.forEach(w => { w.wins += 1; });
  }

  const typeName = winners[0]?.lastHandType || 'High Card';
  const names = winners.map(w => w.id === 0 ? (w.name || 'You') : w.name).join(', ');
  boredState.resultText = winners.length === 1
    ? `Winner: ${names} with ${typeName}.`
    : `Split pot: ${names} with ${typeName}.`;

  // Track bankroll history for graph
  if (!Array.isArray(boredState.bankHistory)) boredState.bankHistory = [];
  boredState.bankHistory.push({
    hand: boredState.handCount,
    values: boredState.players.map(p => p.money),
  });
  boredUpdateGraph();
}

function boredBest5Of7(cards7) {
  // Enumerate all 21 5-card combinations from 7 cards
  const idx = [0,1,2,3,4,5,6];
  let best = null;
  let bestType = 'High Card';
  for (let a = 0; a < 3; a++) {
    for (let b = a+1; b < 4; b++) {
      for (let c = b+1; c < 5; c++) {
        for (let d = c+1; d < 6; d++) {
          for (let e = d+1; e < 7; e++) {
            const hand = [idx[a],idx[b],idx[c],idx[d],idx[e]].map(i => cards7[i]);
            const { rankVec, handType } = boredRank5(hand);
            if (!best || boredCompareRankVec(rankVec, best) > 0) {
              best = rankVec;
              bestType = handType;
            }
          }
        }
      }
    }
  }
  return { rankVec: best, handType: bestType };
}

function boredRank5(cards5) {
  const rankValue = c => {
    const r = c[0];
    return r === 'A' ? 14 :
           r === 'K' ? 13 :
           r === 'Q' ? 12 :
           r === 'J' ? 11 :
           r === 'T' ? 10 : parseInt(r, 10);
  };
  const ranks = cards5.map(rankValue).sort((a,b) => b - a);
  const suits = cards5.map(c => c[1]);

  const counts = {};
  ranks.forEach(r => { counts[r] = (counts[r] || 0) + 1; });
  const entries = Object.entries(counts).map(([r,c]) => ({ r: +r, c }));
  entries.sort((a,b) => b.c - a.c || b.r - a.r);

  const isFlush = suits.every(s => s === suits[0]);

  // Straight detection (including wheel A-5)
  let uniqRanks = [...new Set(ranks)].sort((a,b) => b - a);
  let isStraight = false;
  let highStraight = uniqRanks[0];
  if (uniqRanks.length >= 5) {
    for (let i = 0; i <= uniqRanks.length - 5; i++) {
      const window = uniqRanks.slice(i, i+5);
      if (window[0] - window[4] === 4) {
        isStraight = true;
        highStraight = window[0];
        break;
      }
    }
    // Wheel A-5
    if (!isStraight && uniqRanks.includes(14) &&
        uniqRanks.includes(5) && uniqRanks.includes(4) &&
        uniqRanks.includes(3) && uniqRanks.includes(2)) {
      isStraight = true;
      highStraight = 5;
    }
  }

  let category = 0;
  let handType = 'High Card';
  let kickers = [];

  if (isStraight && isFlush) {
    category = 8;
    handType = highStraight === 14 ? 'Royal Flush' : 'Straight Flush';
    kickers = [highStraight];
  } else if (entries[0].c === 4) {
    category = 7;
    handType = 'Four of a Kind';
    const four = entries[0].r;
    const kicker = entries.find(e => e.r !== four).r;
    kickers = [four, kicker];
  } else if (entries[0].c === 3 && entries[1].c === 2) {
    category = 6;
    handType = 'Full House';
    kickers = [entries[0].r, entries[1].r];
  } else if (isFlush) {
    category = 5;
    handType = 'Flush';
    kickers = ranks.slice();
  } else if (isStraight) {
    category = 4;
    handType = 'Straight';
    kickers = [highStraight];
  } else if (entries[0].c === 3) {
    category = 3;
    handType = 'Three of a Kind';
    const trips = entries[0].r;
    const rest = entries.filter(e => e.r !== trips).map(e => e.r).sort((a,b)=>b-a);
    kickers = [trips].concat(rest);
  } else if (entries[0].c === 2 && entries[1].c === 2) {
    category = 2;
    handType = 'Two Pair';
    const pair1 = Math.max(entries[0].r, entries[1].r);
    const pair2 = Math.min(entries[0].r, entries[1].r);
    const kicker = entries.find(e => e.c === 1).r;
    kickers = [pair1, pair2, kicker];
  } else if (entries[0].c === 2) {
    category = 1;
    handType = 'One Pair';
    const pair = entries[0].r;
    const rest = entries.filter(e => e.r !== pair).map(e => e.r).sort((a,b)=>b-a);
    kickers = [pair].concat(rest);
  } else {
    category = 0;
    handType = 'High Card';
    kickers = ranks.slice();
  }

  return { rankVec: [category].concat(kickers), handType };
}

function boredCompareRankVec(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) return 1;
    if (av < bv) return -1;
  }
  return 0;
}

// ── RENDERING ────────────────────────

function boredRender() {
  const list = document.getElementById('bored-players');
  if (list) {
    list.innerHTML = '';
    boredState.players.forEach(p => {
      const li = document.createElement('li');
      li.className = 'arcade-player' + (p.id === 0 ? ' me' : '');
      li.innerHTML = `
        <span class="arcade-player-name">${_esc(p.name)}</span>
        <span class="arcade-player-stack">Wins: ${p.wins} · $${p.money}</span>
        <span class="arcade-player-state">${p.lastHandType || ''}</span>`;
      list.appendChild(li);
    });
  }

  const tv = document.getElementById('bored-table-view');
  const ts = document.getElementById('bored-table-status');
  const st = document.getElementById('bored-status');

  if (st) {
    st.textContent = boredState.handCount
      ? boredState.resultText
      : 'No hands played yet.';
  }

  if (!tv || !ts) return;

  if (boredState.status !== 'dealt') {
    ts.textContent = 'Click "Deal new hand" to start.';
    tv.innerHTML = `
      <div class="arcade-table-placeholder">
        <div class="arcade-table-logo">PMT</div>
        <p>We’ll deal you two cards and five community cards.<br>
        Highest hand wins each round.</p>
      </div>`;
    return;
  }

  if (boredState.phase === 'yourTurn') {
    ts.textContent = `Hand #${boredState.handCount} · Your turn — choose Fold, Hold, or Raise. · Pot: $${boredState.pot}`;
  } else if (boredState.phase === 'showdown') {
    ts.textContent = `Hand #${boredState.handCount} · ${boredState.resultText} · Pot: $${boredState.pot}`;
  } else {
    ts.textContent = `Hand #${boredState.handCount} · Pot: $${boredState.pot}`;
  }

  const board = boredState.community.map(c => `<div class="card">${_esc(c)}</div>`).join('');

  const rows = boredState.players.map(p => {
    const isYou = p.id === 0;
    const isShowdown = boredState.phase === 'showdown';
    const isBeginner = boredState.mode === 'beginner';

    let cardsHtml = '';
    if (isYou) {
      // Show one card first; reveal second after you act.
      if (boredState.phase === 'yourTurn' && boredState.status === 'dealt') {
        const first = p.cards[0];
        const second = p.cards[1];
        if (first) cardsHtml += `<div class="card">${_esc(first)}</div>`;
        if (second) cardsHtml += `<div class="card hidden">??</div>`;
      } else {
        cardsHtml = p.cards.map(c => `<div class="card">${_esc(c)}</div>`).join('');
      }
    } else {
      if (isBeginner || isShowdown) {
        cardsHtml = p.cards.map(c => `<div class="card">${_esc(c)}</div>`).join('');
      } else {
        cardsHtml = p.cards.map(() => `<div class="card hidden">??</div>`).join('');
      }
    }
    return `
      <div class="bored-seat${isYou ? ' me' : ''}">
        <div class="bored-seat-head">
          <span class="seat-name">${_esc(p.name)}</span>
          <span class="seat-meta">Wins: ${p.wins} · $${p.money}${p.lastHandType ? ' · ' + p.lastHandType : ''}</span>
        </div>
        <div class="bored-seat-cards">${cardsHtml}</div>
      </div>`;
  }).join('');

  const actionsHtml = boredState.phase === 'yourTurn'
    ? `<div class="bored-actions">
         <div class="bored-actions-row">
           <button onclick="boredAct('fold')">Fold</button>
           <button onclick="boredAct('hold')">Hold / Check</button>
           <button onclick="boredAct('raise')">Raise</button>
           <input id="bored-raise-amt" class="bored-actions-amount" type="number" min="${BORED_MIN_RAISE}" max="${BORED_MAX_RAISE}" step="${BORED_MIN_RAISE}" value="${BORED_MIN_RAISE}"/>
           <div id="bored-timer" class="bored-timer"></div>
         </div>
       </div>`
    : `<div class="bored-actions bored-actions-muted">
         Use "Deal new hand" on the left to play another round.
       </div>`;

  const logHtml = boredState.actions.length
    ? boredState.actions.map(l => `<div class="bored-log-line">${_esc(l)}</div>`).join('')
    : '<div class="bored-log-line muted">Actions will appear here after you act.</div>';

  tv.innerHTML = `
    <div class="bored-table-grid">
      <div class="arcade-community">
        <div class="arcade-section-label">Board</div>
        <div class="arcade-cards">${board}</div>
      </div>
      <div class="bored-seats">
        ${rows}
      </div>
    </div>
    ${actionsHtml}
    <div class="bored-log">
      ${logHtml}
    </div>
    <div id="bored-graph">
      <div class="bored-graph-label">Bankroll over hands</div>
    </div>`;

  boredUpdateGraph();
}

function boredUpdateGraph() {
  const container = document.getElementById('bored-graph');
  if (!container || !window.LightweightCharts) return;

  const history = boredState.bankHistory || [];
  if (!history.length) {
    container.setAttribute('data-empty', '1');
    return;
  }
  container.removeAttribute('data-empty');

  if (!boredChart) {
    boredChart = LightweightCharts.createChart(container, {
      height: 130,
      layout: {
        background: { color: 'transparent' },
        textColor: '#9ea7bc',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.04)' },
        horzLines: { color: 'rgba(255,255,255,0.06)' },
      },
      rightPriceScale: { visible: false },
      timeScale: { visible: false },
      handleScroll: false,
      handleScale: false,
    });

    const colors = ['#00e5a0', '#4da6ff', '#ffb547', '#b490ff', '#ff3d5a'];
    boredSeries = boredState.players.map((p, idx) =>
      boredChart.addLineSeries({
        color: colors[idx % colors.length],
        lineWidth: 2,
      })
    );
  }

  history.forEach(point => {
    const t = point.hand;
    point.values.forEach((v, idx) => {
      const series = boredSeries[idx];
      if (!series) return;
      // Rebuild full history for robustness
      const data = history.map(h => ({
        time: h.hand,
        value: h.values[idx],
      }));
      series.setData(data);
    });
  });
}

// ════════════════════════════════════
//  CHESS — play as white vs simple AI
//  Uses chess.js for rules (CDN loaded before this file)
// ════════════════════════════════════
let chessGame = null;
let chessSelected = null; // square like 'e2'
let chessLegalMoves = [];
let chessStatus = '';
let chessHistory = [];

const PIECE_UNICODE = {
  wp:'\u2659',wn:'\u2658',wb:'\u2657',wr:'\u2656',wq:'\u2655',wk:'\u2654',
  bp:'\u265F',bn:'\u265E',bb:'\u265D',br:'\u265C',bq:'\u265B',bk:'\u265A'
};

function initChessView() {
  const root = document.getElementById('gv');
  if (!root) return;

  if (typeof Chess === 'undefined') {
    root.innerHTML = '<div id="bored-root"><div class="arcade-header"><div class="arcade-title"><span>Chess</span><button class="arcade-back-btn" onclick="showArcadePicker()">\u2190 Back</button></div></div><p style="padding:24px;color:var(--dim)">chess.js library not loaded. Check your connection.</p></div>';
    return;
  }

  chessGame = new Chess();
  chessSelected = null;
  chessLegalMoves = [];
  chessHistory = [];
  chessStatus = 'Your turn (White)';

  root.innerHTML = `
    <div id="bored-root">
      <div class="arcade-header">
        <div class="arcade-title">
          <span>Are You Bored?</span>
          <span class="arcade-pill">Chess vs AI</span>
          <button class="arcade-back-btn" onclick="showArcadePicker()">\u2190 Back</button>
        </div>
        <div class="arcade-sub">You play as White. Click a piece to select, then click a destination. The AI responds as Black.</div>
      </div>
      <div class="chess-layout">
        <div class="chess-board-wrap">
          <div id="chess-board" class="chess-board"></div>
        </div>
        <div class="chess-sidebar">
          <div class="arcade-card">
            <div class="arcade-card-title">Status</div>
            <div id="chess-status" class="chess-status-text">${chessStatus}</div>
            <button class="chess-new-btn" onclick="chessNewGame()">New game</button>
          </div>
          <div class="arcade-card">
            <div class="arcade-card-title">Moves</div>
            <div id="chess-moves" class="chess-moves-list"></div>
          </div>
        </div>
      </div>
    </div>`;

  renderChessBoard();
}

function chessNewGame() {
  if (typeof Chess === 'undefined') return;
  chessGame = new Chess();
  chessSelected = null;
  chessLegalMoves = [];
  chessHistory = [];
  chessStatus = 'Your turn (White)';
  renderChessBoard();
  const st = document.getElementById('chess-status');
  if (st) st.textContent = chessStatus;
  const mv = document.getElementById('chess-moves');
  if (mv) mv.innerHTML = '';
}

function renderChessBoard() {
  const el = document.getElementById('chess-board');
  if (!el || !chessGame) return;
  const board = chessGame.board();
  let html = '';
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const file = 'abcdefgh'[c];
      const rank = 8 - r;
      const sq = file + rank;
      const isDark = (r + c) % 2 === 1;
      const piece = board[r][c];
      const pieceStr = piece ? PIECE_UNICODE[piece.color + piece.type] || '' : '';
      const isSelected = chessSelected === sq;
      const isLegal = chessLegalMoves.includes(sq);
      const isLastMove = chessHistory.length > 0 && (chessHistory[chessHistory.length - 1].from === sq || chessHistory[chessHistory.length - 1].to === sq);
      let cls = 'chess-sq ' + (isDark ? 'dark' : 'light');
      if (isSelected) cls += ' selected';
      if (isLegal) cls += ' legal';
      if (isLastMove) cls += ' last-move';
      const label = (c === 0 ? `<span class="chess-rank">${rank}</span>` : '') + (r === 7 ? `<span class="chess-file">${file}</span>` : '');
      html += `<div class="${cls}" data-sq="${sq}" onclick="chessClick('${sq}')">${label}<span class="chess-piece${piece && piece.color === 'b' ? ' black' : ''}">${pieceStr}</span></div>`;
    }
  }
  el.innerHTML = html;
}

function chessClick(sq) {
  if (!chessGame || chessGame.game_over() || chessGame.turn() !== 'w') return;

  if (chessSelected) {
    if (chessLegalMoves.includes(sq)) {
      let moveObj = { from: chessSelected, to: sq };
      // Auto-promote to queen
      const piece = chessGame.get(chessSelected);
      if (piece && piece.type === 'p' && (sq[1] === '8' || sq[1] === '1')) {
        moveObj.promotion = 'q';
      }
      const move = chessGame.move(moveObj);
      if (move) {
        chessHistory.push(move);
        chessSelected = null;
        chessLegalMoves = [];
        renderChessBoard();
        updateChessStatus();
        updateChessMoves();
        if (!chessGame.game_over()) {
          chessStatus = 'AI thinking...';
          const st = document.getElementById('chess-status');
          if (st) st.textContent = chessStatus;
          setTimeout(chessAiMove, 300 + Math.random() * 400);
        }
        return;
      }
    }
    chessSelected = null;
    chessLegalMoves = [];
    renderChessBoard();
  }

  const piece = chessGame.get(sq);
  if (piece && piece.color === 'w') {
    chessSelected = sq;
    const moves = chessGame.moves({ square: sq, verbose: true });
    chessLegalMoves = moves.map(m => m.to);
    renderChessBoard();
  }
}

// Simple AI: evaluate moves by material gain + center control + randomness
function chessAiMove() {
  if (!chessGame || chessGame.game_over() || chessGame.turn() !== 'b') return;
  const moves = chessGame.moves({ verbose: true });
  if (!moves.length) return;

  const pieceVal = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };
  let best = null;
  let bestScore = -Infinity;

  for (const m of moves) {
    let score = Math.random() * 0.5;
    if (m.captured) score += pieceVal[m.captured] * 10;
    if (m.flags.includes('k') || m.flags.includes('q')) score += 3;
    // Prefer center squares
    if ('de'.includes(m.to[0]) && '45'.includes(m.to[1])) score += 0.8;
    if ('cf'.includes(m.to[0]) && '3456'.includes(m.to[1])) score += 0.3;
    // Check bonus
    chessGame.move(m);
    if (chessGame.in_check()) score += 2;
    chessGame.undo();

    if (score > bestScore) { bestScore = score; best = m; }
  }

  if (best) {
    const move = chessGame.move(best);
    if (move) chessHistory.push(move);
  }

  renderChessBoard();
  updateChessStatus();
  updateChessMoves();
}

function updateChessStatus() {
  const st = document.getElementById('chess-status');
  if (!st || !chessGame) return;
  if (chessGame.in_checkmate()) {
    chessStatus = chessGame.turn() === 'w' ? 'Checkmate — AI wins!' : 'Checkmate — you win!';
  } else if (chessGame.in_draw()) {
    chessStatus = 'Draw!';
  } else if (chessGame.in_stalemate()) {
    chessStatus = 'Stalemate — draw!';
  } else if (chessGame.in_check()) {
    chessStatus = chessGame.turn() === 'w' ? 'Check! Your turn (White)' : 'AI thinking...';
  } else {
    chessStatus = chessGame.turn() === 'w' ? 'Your turn (White)' : 'AI thinking...';
  }
  st.textContent = chessStatus;
}

function updateChessMoves() {
  const el = document.getElementById('chess-moves');
  if (!el) return;
  const pgn = chessGame.pgn({ max_width: 40, newline_char: '\n' });
  el.textContent = pgn || 'No moves yet.';
  el.scrollTop = el.scrollHeight;
}

// ── INIT ON READY ────────────────────────────────────────────────────
function initArcadeOnReady() {
  if (document.getElementById('gv')) initArcadeView();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initArcadeOnReady);
} else {
  initArcadeOnReady();
}

