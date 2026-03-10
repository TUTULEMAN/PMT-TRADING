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
const BORED_TURN_MS = 30000;

window.boredState = {
  players: [],      // { id, name, wins, money, lastHandType, cards:[], strength:[], folded, handContribution }
  community: [],    // 5 board cards
  revealed: 0,      // how many community cards currently visible (0=preflop, 3=flop, 4=turn, 5=river)
  street: 'preflop',// 'preflop' | 'flop' | 'turn' | 'river'
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
        <div class="arcade-pick-card" onclick="switchToSudoku()">
          <div class="arcade-pick-icon">\u229E 9</div>
          <div class="arcade-pick-name">Sudoku</div>
          <div class="arcade-pick-desc">Classic 9\u00D79 logic puzzle. Beginner, intermediate, and hard levels.</div>
        </div>
        <div class="arcade-pick-card" onclick="switchToMondrian()">
          <div class="arcade-pick-icon">\u25AE\u25AC</div>
          <div class="arcade-pick-name">Mondrian Blocks</div>
          <div class="arcade-pick-desc">Fill a grid with unique rectangles. Bold colors, minimal score wins.</div>
        </div>
      </div>
    </div>`;
}

function switchToPoker() { arcadeGame = 'poker'; initPokerView(); }
function switchToChess() { arcadeGame = 'chess'; initChessView(); }
function switchToSudoku() { arcadeGame = 'sudoku'; initSudokuView(); }
function switchToMondrian() { arcadeGame = 'mondrian'; initMondrianView(); }

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
                Pre-Flop, Flop, Turn, River, then Showdown.</p>
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

  // Deal 5 community cards (face-down; revealed progressively)
  boredState.community = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
  boredState.revealed = 0;
  boredState.street = 'preflop';
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

  const streetLabel = boredState.street.charAt(0).toUpperCase() + boredState.street.slice(1);
  let youText = '';
  if (choice === 'fold') {
    you.folded = true;
    youText = `[${streetLabel}] You fold your hand.`;
  } else if (choice === 'raise') {
    youText = `[${streetLabel}] You raise by $${raiseAmt}.`;
    if (raiseAmt > 0) {
      you.money -= raiseAmt;
      you.handContribution += raiseAmt;
      boredState.pot += raiseAmt;
    }
  } else {
    youText = `[${streetLabel}] You check.`;
  }
  boredState.actions.push(youText);

  boredRunBots(choice, raiseAmt);

  const activePlayers = boredState.players.filter(p => !p.folded && p.money >= 0);
  if (activePlayers.length <= 1 || you.folded) {
    boredState.revealed = 5;
    boredEvaluateHands();
    boredState.phase = 'showdown';
    boredRender();
    return;
  }

  boredAdvanceStreet();
}

function boredAdvanceStreet() {
  const street = boredState.street;
  if (street === 'preflop') {
    boredState.street = 'flop';
    boredState.revealed = 3;
    boredState.actions.push('── Flop dealt ──');
  } else if (street === 'flop') {
    boredState.street = 'turn';
    boredState.revealed = 4;
    boredState.actions.push('── Turn dealt ──');
  } else if (street === 'turn') {
    boredState.street = 'river';
    boredState.revealed = 5;
    boredState.actions.push('── River dealt ──');
  } else {
    boredState.revealed = 5;
    boredEvaluateHands();
    boredState.phase = 'showdown';
    boredRender();
    return;
  }

  boredState.phase = 'yourTurn';
  boredRender();
  boredStartTurn();
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
  const visible = boredState.community.slice(0, boredState.revealed);
  const allCards = p.cards.concat(visible);
  if (allCards.length < 5) {
    return boredEstimatePreflop(p.cards);
  }
  const { rankVec } = boredBestHand(allCards);
  return rankVec;
}

function boredEstimatePreflop(holeCards) {
  const rankVal = c => {
    const r = c[0];
    return r === 'A' ? 14 : r === 'K' ? 13 : r === 'Q' ? 12 : r === 'J' ? 11 : r === 'T' ? 10 : parseInt(r, 10);
  };
  const v1 = rankVal(holeCards[0]);
  const v2 = rankVal(holeCards[1]);
  const paired = v1 === v2;
  const suited = holeCards[0][1] === holeCards[1][1];
  let score = Math.max(v1, v2);
  if (paired) score += 15;
  if (suited) score += 2;
  if (Math.abs(v1 - v2) <= 2) score += 1;
  return [paired ? 1 : 0, score];
}

function boredBestHand(cards) {
  if (cards.length === 5) return { rankVec: boredRank5(cards).rankVec, handType: boredRank5(cards).handType };
  if (cards.length === 6) {
    let best = null, bestType = 'High Card';
    for (let skip = 0; skip < 6; skip++) {
      const hand = cards.filter((_, i) => i !== skip);
      const { rankVec, handType } = boredRank5(hand);
      if (!best || boredCompareRankVec(rankVec, best) > 0) { best = rankVec; bestType = handType; }
    }
    return { rankVec: best, handType: bestType };
  }
  return boredBest5Of7(cards);
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
        Best 5-card hand at showdown wins the pot.</p>
      </div>`;
    return;
  }

  const streetNames = { preflop: 'Pre-Flop', flop: 'Flop', turn: 'Turn', river: 'River' };
  const streetLabel = streetNames[boredState.street] || boredState.street;

  if (boredState.phase === 'yourTurn') {
    ts.textContent = `Hand #${boredState.handCount} · ${streetLabel} · Your turn — Fold, Check, or Raise · Pot: $${boredState.pot}`;
  } else if (boredState.phase === 'showdown') {
    ts.textContent = `Hand #${boredState.handCount} · Showdown · ${boredState.resultText} · Pot: $${boredState.pot}`;
  } else {
    ts.textContent = `Hand #${boredState.handCount} · ${streetLabel} · Pot: $${boredState.pot}`;
  }

  const revealedCards = boredState.community.slice(0, boredState.revealed);
  const hiddenCount = 5 - boredState.revealed;
  const board = revealedCards.map(c => `<div class="card">${_esc(c)}</div>`).join('')
    + Array(hiddenCount).fill('<div class="card hidden">??</div>').join('');

  const rows = boredState.players.map(p => {
    const isYou = p.id === 0;
    const isShowdown = boredState.phase === 'showdown';
    const isBeginner = boredState.mode === 'beginner';

    let cardsHtml = '';
    if (isYou) {
      cardsHtml = p.cards.map(c => `<div class="card">${_esc(c)}</div>`).join('');
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
           <button onclick="boredAct('hold')">Check</button>
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
//  SUDOKU — classic 9×9 logic puzzle
//  Three difficulty levels, runs in-browser
// ════════════════════════════════════

let sudokuBoard = [];
let sudokuSolution = [];
let sudokuGiven = [];
let sudokuSelected = null;
let sudokuDifficulty = 'beginner';
let sudokuTimerId = null;
let sudokuSeconds = 0;

function initSudokuView() {
  const root = document.getElementById('gv');
  if (!root) return;

  root.innerHTML = `
    <div id="bored-root">
      <div class="arcade-header">
        <div class="arcade-title">
          <span>Are You Bored?</span>
          <span class="arcade-pill">Sudoku</span>
          <button class="arcade-back-btn" onclick="showArcadePicker()">\u2190 Back</button>
        </div>
        <div class="arcade-sub">Fill every row, column, and 3\u00D73 box with digits 1\u20139. No repeats. Click a cell, then press a number or use the pad.</div>
      </div>
      <div class="sudoku-layout">
        <div class="sudoku-sidebar">
          <div class="arcade-card">
            <div class="arcade-card-title">Difficulty</div>
            <div class="sudoku-diff-btns">
              <button id="sudoku-diff-beginner" class="on" onclick="sudokuSetDiff('beginner')">Beginner</button>
              <button id="sudoku-diff-intermediate" onclick="sudokuSetDiff('intermediate')">Intermediate</button>
              <button id="sudoku-diff-hard" onclick="sudokuSetDiff('hard')">Hard</button>
            </div>
            <button class="sudoku-new-btn" onclick="sudokuNewGame()">New puzzle</button>
            <div id="sudoku-timer" class="sudoku-timer">0:00</div>
          </div>
          <div class="arcade-card">
            <div class="arcade-card-title">Controls</div>
            <div class="sudoku-numpad" id="sudoku-numpad"></div>
            <button class="sudoku-erase-btn" onclick="sudokuErase()">Erase</button>
          </div>
          <div id="sudoku-msg" class="sudoku-msg"></div>
        </div>
        <div class="sudoku-board-wrap">
          <div id="sudoku-board" class="sudoku-board"></div>
        </div>
      </div>
    </div>`;

  const numpad = document.getElementById('sudoku-numpad');
  if (numpad) {
    let html = '';
    for (let n = 1; n <= 9; n++) html += `<button onclick="sudokuInput(${n})">${n}</button>`;
    numpad.innerHTML = html;
  }
  sudokuNewGame();
}

function sudokuSetDiff(diff) {
  sudokuDifficulty = diff;
  ['beginner', 'intermediate', 'hard'].forEach(d => {
    const btn = document.getElementById('sudoku-diff-' + d);
    if (btn) btn.classList.toggle('on', d === diff);
  });
}

function sudokuNewGame() {
  sudokuSelected = null;
  sudokuSeconds = 0;
  if (sudokuTimerId) { clearInterval(sudokuTimerId); sudokuTimerId = null; }

  sudokuSolution = sudokuGenerate();
  const removals = sudokuDifficulty === 'beginner' ? 38
    : sudokuDifficulty === 'intermediate' ? 48 : 55;
  sudokuBoard = sudokuSolution.map(row => [...row]);
  sudokuGiven = Array.from({ length: 9 }, () => Array(9).fill(true));

  const cells = [];
  for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) cells.push([r, c]);
  sudokuShuffleArr(cells);
  let removed = 0;
  for (const [r, c] of cells) {
    if (removed >= removals) break;
    sudokuBoard[r][c] = 0;
    sudokuGiven[r][c] = false;
    removed++;
  }

  sudokuTimerId = setInterval(() => {
    sudokuSeconds++;
    const el = document.getElementById('sudoku-timer');
    if (el) {
      const m = Math.floor(sudokuSeconds / 60);
      const s = sudokuSeconds % 60;
      el.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }
  }, 1000);

  const msg = document.getElementById('sudoku-msg');
  if (msg) { msg.textContent = ''; msg.className = 'sudoku-msg'; }
  renderSudokuBoard();
}

function sudokuGenerate() {
  const board = Array.from({ length: 9 }, () => Array(9).fill(0));
  sudokuSolveBoard(board);
  return board;
}

function sudokuSolveBoard(board) {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === 0) {
        const nums = [1, 2, 3, 4, 5, 6, 7, 8, 9];
        sudokuShuffleArr(nums);
        for (const n of nums) {
          if (sudokuIsValid(board, r, c, n)) {
            board[r][c] = n;
            if (sudokuSolveBoard(board)) return true;
            board[r][c] = 0;
          }
        }
        return false;
      }
    }
  }
  return true;
}

function sudokuIsValid(board, row, col, num) {
  for (let i = 0; i < 9; i++) {
    if (board[row][i] === num) return false;
    if (board[i][col] === num) return false;
  }
  const br = Math.floor(row / 3) * 3;
  const bc = Math.floor(col / 3) * 3;
  for (let r = br; r < br + 3; r++)
    for (let c = bc; c < bc + 3; c++)
      if (board[r][c] === num) return false;
  return true;
}

function sudokuShuffleArr(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function sudokuClickCell(r, c) {
  if (sudokuGiven[r] && sudokuGiven[r][c]) {
    sudokuSelected = [r, c];
    renderSudokuBoard();
    return;
  }
  sudokuSelected = [r, c];
  renderSudokuBoard();
}

function sudokuInput(n) {
  if (!sudokuSelected) return;
  const [r, c] = sudokuSelected;
  if (sudokuGiven[r][c]) return;
  sudokuBoard[r][c] = n;
  renderSudokuBoard();
  sudokuCheckWin();
}

function sudokuErase() {
  if (!sudokuSelected) return;
  const [r, c] = sudokuSelected;
  if (sudokuGiven[r][c]) return;
  sudokuBoard[r][c] = 0;
  renderSudokuBoard();
}

function sudokuCheckWin() {
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++)
      if (sudokuBoard[r][c] !== sudokuSolution[r][c]) return;
  if (sudokuTimerId) { clearInterval(sudokuTimerId); sudokuTimerId = null; }
  const msg = document.getElementById('sudoku-msg');
  if (msg) {
    const m = Math.floor(sudokuSeconds / 60);
    const s = sudokuSeconds % 60;
    msg.textContent = `Puzzle complete! Time: ${m}:${s < 10 ? '0' : ''}${s}`;
    msg.className = 'sudoku-msg sudoku-win';
  }
}

function renderSudokuBoard() {
  const el = document.getElementById('sudoku-board');
  if (!el) return;
  const selR = sudokuSelected ? sudokuSelected[0] : -1;
  const selC = sudokuSelected ? sudokuSelected[1] : -1;
  const selVal = (selR >= 0 && selC >= 0) ? sudokuBoard[selR][selC] : 0;
  const selBoxR = Math.floor(selR / 3) * 3;
  const selBoxC = Math.floor(selC / 3) * 3;

  let html = '';
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const val = sudokuBoard[r][c];
      const isGiven = sudokuGiven[r][c];
      const isSel = selR === r && selC === c;
      const isError = val !== 0 && !isGiven && val !== sudokuSolution[r][c];
      const inRow = selR === r;
      const inCol = selC === c;
      const inBox = selR >= 0 && r >= selBoxR && r < selBoxR + 3 && c >= selBoxC && c < selBoxC + 3;
      const sameNum = val !== 0 && selVal !== 0 && val === selVal && !isSel;

      let cls = 'sudoku-cell';
      if (isGiven) cls += ' given';
      if (isSel) cls += ' selected';
      if (isError) cls += ' error';
      if (!isSel && (inRow || inCol || inBox)) cls += ' zone';
      if (sameNum) cls += ' highlight';
      if (c % 3 === 0 && c !== 0) cls += ' box-left';
      if (r % 3 === 0 && r !== 0) cls += ' box-top';
      html += `<div class="${cls}" onclick="sudokuClickCell(${r},${c})">${val || ''}</div>`;
    }
  }
  el.innerHTML = html;
}

// ════════════════════════════════════
//  MONDRIAN BLOCKS — fill a grid with unique rectangles
//  Inspired by Piet Mondrian's geometric compositions
// ════════════════════════════════════

const MONDRIAN_SIZE = 8;
const MONDRIAN_PALETTE = ['#D40920', '#1356A2', '#F7D842', '#F58231', '#3CB44B', '#911EB4', '#42D4F4', '#E6194B', '#BFEF45', '#FABED4'];
let mondrianGrid = [];
let mondrianRects = [];
let mondrianStart = null;
let mondrianColorIdx = 0;

function initMondrianView() {
  const root = document.getElementById('gv');
  if (!root) return;

  mondrianRects = [];
  mondrianStart = null;
  mondrianColorIdx = 0;
  mondrianGrid = Array.from({ length: MONDRIAN_SIZE }, () => Array(MONDRIAN_SIZE).fill(-1));

  root.innerHTML = `
    <div id="bored-root">
      <div class="arcade-header">
        <div class="arcade-title">
          <span>Are You Bored?</span>
          <span class="arcade-pill">Mondrian Blocks</span>
          <button class="arcade-back-btn" onclick="showArcadePicker()">\u2190 Back</button>
        </div>
        <div class="arcade-sub">Fill the ${MONDRIAN_SIZE}\u00D7${MONDRIAN_SIZE} grid with rectangles. Click two cells to define opposite corners. No two blocks can share the same dimensions. Most blocks wins!</div>
      </div>
      <div class="mondrian-layout">
        <div class="mondrian-board-wrap">
          <div id="mondrian-board" class="mondrian-board" style="grid-template-columns:repeat(${MONDRIAN_SIZE},1fr);grid-template-rows:repeat(${MONDRIAN_SIZE},1fr)"></div>
        </div>
        <div class="mondrian-sidebar">
          <div class="arcade-card">
            <div class="arcade-card-title">Score</div>
            <div id="mondrian-score" class="mondrian-score">Place rectangles to begin</div>
            <div id="mondrian-filled" class="mondrian-filled"></div>
          </div>
          <div class="arcade-card">
            <div class="arcade-card-title">Blocks placed</div>
            <div id="mondrian-blocks" class="mondrian-blocks"></div>
          </div>
          <div class="arcade-card">
            <div class="arcade-card-title">Actions</div>
            <button class="mondrian-action-btn" onclick="mondrianUndo()">Undo last block</button>
            <button class="mondrian-action-btn mondrian-reset" onclick="mondrianReset()">Reset board</button>
          </div>
          <div class="arcade-card">
            <div class="arcade-card-title">How to play</div>
            <div class="arcade-howto">
              <ol>
                <li>Click a cell to set the first corner.</li>
                <li>Click another cell for the opposite corner.</li>
                <li>Block fills in if no overlap.</li>
                <li>No two blocks can share dimensions (2\u00D73 = 3\u00D72).</li>
                <li>Score = number of unique blocks placed. More blocks = higher score!</li>
              </ol>
              <p>Press Escape to cancel a selection.</p>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  renderMondrianBoard();
}

function mondrianClickCell(r, c) {
  if (mondrianGrid[r][c] !== -1 && !mondrianStart) return;

  if (!mondrianStart) {
    if (mondrianGrid[r][c] !== -1) return;
    mondrianStart = [r, c];
    renderMondrianBoard();
    return;
  }

  if (mondrianStart[0] === r && mondrianStart[1] === c) {
    mondrianStart = null;
    renderMondrianBoard();
    return;
  }

  const r1 = Math.min(mondrianStart[0], r);
  const c1 = Math.min(mondrianStart[1], c);
  const r2 = Math.max(mondrianStart[0], r);
  const c2 = Math.max(mondrianStart[1], c);
  const w = c2 - c1 + 1;
  const h = r2 - r1 + 1;

  for (let rr = r1; rr <= r2; rr++)
    for (let cc = c1; cc <= c2; cc++)
      if (mondrianGrid[rr][cc] !== -1) {
        mondrianStart = null;
        mondrianFlash('Block overlaps an existing rectangle!');
        renderMondrianBoard();
        return;
      }

  const dimKey = Math.min(w, h) + 'x' + Math.max(w, h);
  for (const rect of mondrianRects) {
    const rw = rect.c2 - rect.c1 + 1;
    const rh = rect.r2 - rect.r1 + 1;
    if (Math.min(rw, rh) + 'x' + Math.max(rw, rh) === dimKey) {
      mondrianStart = null;
      mondrianFlash(`A ${dimKey} block already exists!`);
      renderMondrianBoard();
      return;
    }
  }

  const color = MONDRIAN_PALETTE[mondrianColorIdx % MONDRIAN_PALETTE.length];
  mondrianColorIdx++;
  mondrianRects.push({ r1, c1, r2, c2, color });
  const idx = mondrianRects.length - 1;
  for (let rr = r1; rr <= r2; rr++)
    for (let cc = c1; cc <= c2; cc++)
      mondrianGrid[rr][cc] = idx;

  mondrianStart = null;
  renderMondrianBoard();
  mondrianUpdateScore();
}

function mondrianFlash(msg) {
  const el = document.getElementById('mondrian-score');
  if (el) { el.textContent = msg; el.className = 'mondrian-score mondrian-err'; }
}

function mondrianUndo() {
  if (!mondrianRects.length) return;
  const last = mondrianRects.pop();
  for (let r = last.r1; r <= last.r2; r++)
    for (let c = last.c1; c <= last.c2; c++)
      mondrianGrid[r][c] = -1;
  mondrianColorIdx = mondrianRects.length;
  mondrianStart = null;
  renderMondrianBoard();
  mondrianUpdateScore();
}

function mondrianReset() {
  mondrianRects = [];
  mondrianGrid = Array.from({ length: MONDRIAN_SIZE }, () => Array(MONDRIAN_SIZE).fill(-1));
  mondrianStart = null;
  mondrianColorIdx = 0;
  renderMondrianBoard();
  const s = document.getElementById('mondrian-score');
  if (s) { s.textContent = 'Place rectangles to begin'; s.className = 'mondrian-score'; }
  const f = document.getElementById('mondrian-filled');
  if (f) f.textContent = '';
  const b = document.getElementById('mondrian-blocks');
  if (b) b.innerHTML = '';
}

function mondrianUpdateScore() {
  const scoreEl = document.getElementById('mondrian-score');
  const filledEl = document.getElementById('mondrian-filled');
  const blocksEl = document.getElementById('mondrian-blocks');

  if (!mondrianRects.length) {
    if (scoreEl) { scoreEl.textContent = 'Place rectangles to begin'; scoreEl.className = 'mondrian-score'; }
    if (filledEl) filledEl.textContent = '';
    if (blocksEl) blocksEl.innerHTML = '';
    return;
  }

  const score = mondrianRects.length;
  const filled = mondrianGrid.flat().filter(x => x !== -1).length;
  const total = MONDRIAN_SIZE * MONDRIAN_SIZE;

  if (scoreEl) {
    if (filled === total) {
      scoreEl.textContent = `Complete! Final score: ${score} block${score !== 1 ? 's' : ''}`;
      scoreEl.className = 'mondrian-score mondrian-win';
    } else {
      scoreEl.textContent = `Blocks placed: ${score}`;
      scoreEl.className = 'mondrian-score';
    }
  }
  if (filledEl) filledEl.textContent = `${filled}/${total} cells filled`;
  if (blocksEl) {
    blocksEl.innerHTML = mondrianRects.map(rect => {
      const w = rect.c2 - rect.c1 + 1;
      const h = rect.r2 - rect.r1 + 1;
      return `<div class="mondrian-block-tag" style="border-left:3px solid ${rect.color}">${w}\u00D7${h} \u2014 area ${w * h}</div>`;
    }).join('');
  }
}

function renderMondrianBoard() {
  const el = document.getElementById('mondrian-board');
  if (!el) return;
  let html = '';
  for (let r = 0; r < MONDRIAN_SIZE; r++) {
    for (let c = 0; c < MONDRIAN_SIZE; c++) {
      const idx = mondrianGrid[r][c];
      let cls = 'mondrian-cell';
      let style = '';

      if (idx !== -1) {
        const rect = mondrianRects[idx];
        if (rect) {
          style = `background:${rect.color}22;`;
          const borders = [];
          if (r === rect.r1) borders.push(`border-top:2.5px solid ${rect.color}`);
          if (r === rect.r2) borders.push(`border-bottom:2.5px solid ${rect.color}`);
          if (c === rect.c1) borders.push(`border-left:2.5px solid ${rect.color}`);
          if (c === rect.c2) borders.push(`border-right:2.5px solid ${rect.color}`);
          style += borders.join(';');
        }
      }

      if (mondrianStart && mondrianStart[0] === r && mondrianStart[1] === c) cls += ' mondrian-start';
      html += `<div class="${cls}" style="${style}" onclick="mondrianClickCell(${r},${c})" onmouseenter="mondrianPreview(${r},${c})" onmouseleave="mondrianClearPreview()"></div>`;
    }
  }
  el.innerHTML = html;
}

function mondrianPreview(r, c) {
  if (!mondrianStart) return;
  const r1 = Math.min(mondrianStart[0], r);
  const c1 = Math.min(mondrianStart[1], c);
  const r2 = Math.max(mondrianStart[0], r);
  const c2 = Math.max(mondrianStart[1], c);
  const cells = document.querySelectorAll('.mondrian-cell');
  cells.forEach(cell => cell.classList.remove('mondrian-preview'));
  for (let rr = r1; rr <= r2; rr++)
    for (let cc = c1; cc <= c2; cc++) {
      const i = rr * MONDRIAN_SIZE + cc;
      if (cells[i]) cells[i].classList.add('mondrian-preview');
    }
}

function mondrianClearPreview() {
  document.querySelectorAll('.mondrian-cell.mondrian-preview').forEach(c => c.classList.remove('mondrian-preview'));
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

// ── KEYBOARD INPUT ──────────────────────────────────────────────────
document.addEventListener('keydown', function (e) {
  if (arcadeGame === 'sudoku' && sudokuSelected) {
    const key = e.key;
    if (key >= '1' && key <= '9') { sudokuInput(parseInt(key)); e.preventDefault(); }
    else if (key === 'Backspace' || key === 'Delete') { sudokuErase(); e.preventDefault(); }
    else if (key === 'Escape') { sudokuSelected = null; renderSudokuBoard(); }
    else if (key === 'ArrowUp' && sudokuSelected[0] > 0) { sudokuSelected = [sudokuSelected[0] - 1, sudokuSelected[1]]; renderSudokuBoard(); e.preventDefault(); }
    else if (key === 'ArrowDown' && sudokuSelected[0] < 8) { sudokuSelected = [sudokuSelected[0] + 1, sudokuSelected[1]]; renderSudokuBoard(); e.preventDefault(); }
    else if (key === 'ArrowLeft' && sudokuSelected[1] > 0) { sudokuSelected = [sudokuSelected[0], sudokuSelected[1] - 1]; renderSudokuBoard(); e.preventDefault(); }
    else if (key === 'ArrowRight' && sudokuSelected[1] < 8) { sudokuSelected = [sudokuSelected[0], sudokuSelected[1] + 1]; renderSudokuBoard(); e.preventDefault(); }
  }
  if (arcadeGame === 'mondrian' && e.key === 'Escape' && mondrianStart) {
    mondrianStart = null;
    renderMondrianBoard();
  }
});

// ── INIT ON READY ────────────────────────────────────────────────────
function initArcadeOnReady() {
  if (document.getElementById('gv')) initArcadeView();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initArcadeOnReady);
} else {
  initArcadeOnReady();
}

