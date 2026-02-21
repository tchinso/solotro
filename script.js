const STORAGE_KEY = "solotro-state-v1";
const PLAYERS = ["CPU 1", "CPU 2", "CPU 3", "사용자"];
const SUITS = ["spades", "hearts", "diamonds", "clubs"];
const RED_SUITS = ["hearts", "diamonds"];
const BLACK_SUITS = ["spades", "clubs"];
const RANKS = ["ace", "2", "3", "4", "5", "6", "7", "8", "9", "10", "jack", "queen", "king"];

const els = {
  playersContainer: document.getElementById("players-container"),
  phaseText: document.getElementById("phase-text"),
  selectionHelp: document.getElementById("selection-help"),
  logList: document.getElementById("log-list"),
  confirmDiscardBtn: document.getElementById("confirm-discard-btn"),
  skipDiscardBtn: document.getElementById("skip-discard-btn"),
  confirmHandBtn: document.getElementById("confirm-hand-btn"),
  newGameBtn: document.getElementById("new-game-btn"),
  resetBtn: document.getElementById("reset-btn")
};

let state = loadState() || createInitialState();
render();

els.confirmDiscardBtn.addEventListener("click", () => userDiscard(false));
els.skipDiscardBtn.addEventListener("click", () => userDiscard(true));
els.confirmHandBtn.addEventListener("click", userConfirmHand);
els.newGameBtn.addEventListener("click", () => {
  state = createInitialState();
  saveState();
  render();
});
els.resetBtn.addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY);
  state = createInitialState();
  render();
});

function createInitialState() {
  const hands = PLAYERS.map(() => drawCardsWithJokerLimit([], 8));
  return {
    phase: "discard",
    scores: [0, 0, 0, 0],
    hands,
    selected: [[], [], [], []],
    lastResult: PLAYERS.map(() => null),
    logs: ["새 게임 시작: 각 플레이어가 8장을 받았습니다."],
    round: 1
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function drawOne() {
  const deck = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push(makeCard(rank, suit));
    }
  }
  deck.push({ id: crypto.randomUUID(), rank: "joker", suit: "joker", color: "black", file: "Cards/black_joker.svg", label: "블랙 조커" });
  deck.push({ id: crypto.randomUUID(), rank: "joker", suit: "joker", color: "red", file: "Cards/red_joker.svg", label: "레드 조커" });
  return structuredClone(deck[Math.floor(Math.random() * deck.length)]);
}

function drawCards(count) {
  return Array.from({ length: count }, drawOne);
}

function drawCardsWithJokerLimit(existingCards, count, maxJokers = 1) {
  const drawn = [];
  const currentJokers = existingCards.filter((card) => card.rank === "joker").length;
  for (let i = 0; i < count; i++) {
    let card = drawOne();
    const jokerCount = currentJokers + drawn.filter((c) => c.rank === "joker").length;
    if (card.rank === "joker" && jokerCount >= maxJokers) {
      do {
        card = drawOne();
      } while (card.rank === "joker");
    }
    drawn.push(card);
  }
  return drawn;
}

function makeCard(rank, suit) {
  const labelRank = rank === "ace" ? "A" : rank === "jack" ? "J" : rank === "queen" ? "Q" : rank === "king" ? "K" : rank;
  const labelSuit = ({ spades: "♠", hearts: "♥", diamonds: "♦", clubs: "♣" })[suit];
  return {
    id: crypto.randomUUID(),
    rank,
    suit,
    file: `Cards/${rank}_of_${suit}.svg`,
    label: `${labelRank}${labelSuit}`
  };
}

function cardRankNum(card) {
  if (card.rank === "ace") return 1;
  if (card.rank === "jack") return 11;
  if (card.rank === "queen") return 12;
  if (card.rank === "king") return 13;
  if (card.rank === "joker") return 0;
  return Number(card.rank);
}

function cardPoint(card) {
  const n = cardRankNum(card);
  if (n === 1) return 1;
  return Math.min(10, n);
}

function evaluateBestFive(cards) {
  const jokerIdx = [];
  const base = [];
  cards.forEach((c, i) => (c.rank === "joker" ? jokerIdx.push(i) : base.push(c)));
  if (jokerIdx.length === 0) return evaluateConcrete(cards);

  const choices = jokerChoices(cards, jokerIdx.length);
  let best = null;
  for (const option of choices) {
    const hand = [...base, ...option];
    const result = evaluateConcrete(hand);
    if (!best || result.score > best.score) best = result;
  }
  return best;
}

function jokerChoices(cards, count) {
  const jokers = cards.filter((c) => c.rank === "joker");
  const pools = jokers.map((j) => {
    const suits = j.color === "red" ? RED_SUITS : j.color === "black" ? BLACK_SUITS : SUITS;
    const arr = [];
    for (const s of suits) {
      for (const r of RANKS) arr.push(makeCard(r, s));
    }
    return arr;
  });
  if (count === 1) return pools[0].map((a) => [a]);
  const out = [];
  for (const a of pools[0]) for (const b of pools[1]) out.push([a, b]);
  return out;
}

function evaluateConcrete(cards) {
  const ranks = cards.map(cardRankNum);
  const points = cards.map(cardPoint);
  const suitCounts = countMap(cards.map((c) => c.suit));
  const rankCounts = countMap(ranks);
  const sumAll = points.reduce((a, b) => a + b, 0);

  const isFlush = Object.values(suitCounts).some((v) => v === 5);
  const isStraight = checkStraight(ranks);
  const entries = Object.entries(rankCounts).map(([r, c]) => ({ r: Number(r), c, p: rankPoint(Number(r)) }));

  const scores = [];
  if (isFlush && isFullHouse(entries)) scores.push(sc("플러시 하우스", sumAll * 15, `(${sumAll}) × 15`));
  if (entries.some((e) => e.c === 5)) scores.push(sc("파이브카드", sumAll * 12, `(${sumAll}) × 12`));
  if (isFlush && isStraight) scores.push(sc("스트레이트 플러시", sumAll * 10, `(${sumAll}) × 10`));

  const four = entries.filter((e) => e.c >= 4).sort((a, b) => b.p - a.p)[0];
  if (four) scores.push(sc("포카드", four.p * 4 * 7, `(${four.p} + ${four.p} + ${four.p} + ${four.p}) × 7`));

  if (isFullHouse(entries)) scores.push(sc("풀하우스", sumAll * 5, `(${sumAll}) × 5`));
  if (isFlush) scores.push(sc("플러시", sumAll * 4, `(${sumAll}) × 4`));
  if (isStraight) scores.push(sc("스트레이트", sumAll * 3, `(${sumAll}) × 3`));

  const triple = entries.filter((e) => e.c >= 3).sort((a, b) => b.p - a.p)[0];
  if (triple) scores.push(sc("트리플", triple.p * 3 * 3, `(${triple.p} + ${triple.p} + ${triple.p}) × 3`));

  const pairs = entries.filter((e) => e.c >= 2).sort((a, b) => b.p - a.p);
  if (pairs.length >= 2) {
    const [a, b] = pairs;
    scores.push(sc("투페어", (a.p * 2 + b.p * 2) * 2, `(${a.p} + ${a.p} + ${b.p} + ${b.p}) × 2`));
  }
  if (pairs.length >= 1) {
    const a = pairs[0];
    scores.push(sc("페어", a.p * 2 * 2, `(${a.p} + ${a.p}) × 2`));
  }

  const high = Math.max(...ranks);
  scores.push(sc("하이카드", rankPoint(high), `${rankPoint(high)}`));
  return scores.sort((x, y) => y.score - x.score)[0];
}

function sc(name, score, formula) {
  return { name, score, formula };
}

function isFullHouse(entries) {
  return entries.some((e) => e.c === 3) && entries.some((e) => e.c === 2);
}

function checkStraight(ranks) {
  const variants = [0, 1];
  for (const a of variants) for (const b of variants) for (const c of variants) for (const d of variants) for (const e of variants) {
    const mapped = [ranks[0] + 13 * a, ranks[1] + 13 * b, ranks[2] + 13 * c, ranks[3] + 13 * d, ranks[4] + 13 * e];
    mapped.sort((x, y) => x - y);
    const unique = new Set(mapped);
    if (unique.size !== 5) continue;
    let ok = true;
    for (let i = 1; i < mapped.length; i++) if (mapped[i] !== mapped[0] + i) ok = false;
    if (ok) return true;
  }
  return false;
}

function rankPoint(rankNum) {
  if (rankNum === 1) return 1;
  return Math.min(10, rankNum > 13 ? rankNum - 13 : rankNum);
}

function countMap(arr) {
  const m = {};
  arr.forEach((v) => (m[v] = (m[v] || 0) + 1));
  return m;
}

function combinations(arr, k) {
  const out = [];
  const pick = (idx, chosen) => {
    if (chosen.length === k) return out.push([...chosen]);
    for (let i = idx; i < arr.length; i++) {
      chosen.push(arr[i]);
      pick(i + 1, chosen);
      chosen.pop();
    }
  };
  pick(0, []);
  return out;
}

function bestHandFromEight(cards) {
  let best = null;
  for (const hand of combinations(cards, 5)) {
    const evaled = evaluateBestFive(hand);
    if (!best || evaled.score > best.score) best = { hand, result: evaled };
  }
  return best;
}

function cpuDiscardDecision(cards, maxMs = 1200) {
  const start = performance.now();
  const idx = cards.map((_, i) => i);
  const candidates = [[], ...idx.map((i) => [i]), ...combinations(idx, 2)];
  const sums = candidates.map(() => ({ sum: 0, n: 0 }));
  let ptr = 0;

  while (performance.now() - start < maxMs - 10) {
    const c = candidates[ptr % candidates.length];
    const kept = cards.filter((_, i) => !c.includes(i));
    const refill = drawCards(c.length);
    const simulated = [...kept, ...refill];
    const { result } = bestHandFromEight(simulated);
    sums[ptr % candidates.length].sum += result.score;
    sums[ptr % candidates.length].n += 1;
    ptr += 1;
  }

  let bestI = 0;
  let bestAvg = -1;
  sums.forEach((s, i) => {
    const avg = s.n ? s.sum / s.n : -1;
    if (avg > bestAvg) {
      bestAvg = avg;
      bestI = i;
    }
  });
  return candidates[bestI];
}

function render() {
  const isDiscard = state.phase === "discard";
  const isHand = state.phase === "hand";
  els.phaseText.textContent = isDiscard ? `라운드 ${state.round} - 버릴 카드(최대 2장) 선택` : `라운드 ${state.round} - 핸드카드 5장 선택`;
  els.confirmDiscardBtn.disabled = !isDiscard;
  els.skipDiscardBtn.disabled = !isDiscard;
  els.confirmHandBtn.disabled = !isHand;
  els.selectionHelp.textContent = isDiscard ? "사용자 카드 최대 2장 선택 후 확정하세요." : "사용자 카드 5장을 선택해 핸드카드를 확정하세요.";

  els.playersContainer.innerHTML = "";
  PLAYERS.forEach((name, pIdx) => {
    const panel = document.createElement("article");
    panel.className = "player-panel";
    const handHtml = state.hands[pIdx].map((card) => {
      const selected = state.selected[pIdx].includes(card.id);
      const selectable = pIdx === 3 && ((isDiscard && state.selected[pIdx].length <= 2) || isHand);
      return `<img class="card ${selected ? "selected" : ""} ${selectable ? "selectable" : ""}" data-card-id="${card.id}" data-player="${pIdx}" src="${card.file}" alt="${card.label}" title="${card.label}">`;
    }).join("");

    const last = state.lastResult[pIdx];
    panel.innerHTML = `
      <h3>${name}</h3>
      <p><strong>누적 점수:</strong> ${state.scores[pIdx]}</p>
      <p class="muted">현재 패 (${state.hands[pIdx].length}장)</p>
      <div class="cards-row">${handHtml}</div>
      <p class="muted">최근 족보: ${last ? `${last.name} (${last.score}점)` : "없음"}</p>
      <p class="muted">계산식: ${last ? last.formula : "-"}</p>
    `;
    els.playersContainer.appendChild(panel);
  });

  els.playersContainer.querySelectorAll(".card.selectable").forEach((img) => {
    img.addEventListener("click", () => toggleUserSelect(img.dataset.cardId));
  });

  els.logList.innerHTML = state.logs.slice().reverse().map((l) => `<li>${l}</li>`).join("");
  saveState();
}

function toggleUserSelect(cardId) {
  const selected = state.selected[3];
  const isDiscard = state.phase === "discard";
  if (selected.includes(cardId)) {
    state.selected[3] = selected.filter((id) => id !== cardId);
  } else {
    const max = isDiscard ? 2 : 5;
    if (selected.length >= max) return;
    if (!isDiscard) {
      const pickedCard = state.hands[3].find((card) => card.id === cardId);
      const selectedCards = state.hands[3].filter((card) => selected.includes(card.id));
      const selectedJokers = selectedCards.filter((card) => card.rank === "joker").length;
      if (pickedCard?.rank === "joker" && selectedJokers >= 1) return;
    }
    state.selected[3].push(cardId);
  }
  render();
}

function userDiscard(skip) {
  if (state.phase !== "discard") return;
  if (!skip && state.selected[3].length > 2) return;

  if (!skip) {
    const selectedIds = new Set(state.selected[3]);
    const kept = state.hands[3].filter((c) => !selectedIds.has(c.id));
    state.hands[3] = [...kept, ...drawCardsWithJokerLimit(kept, state.selected[3].length)];
  }

  state.selected[3] = [];
  state.phase = "hand";
  state.logs.push(`라운드 ${state.round}: 사용자 버리기 단계 완료 (CPU는 버리지 않음)`);
  render();
}

function userConfirmHand() {
  if (state.phase !== "hand") return;
  if (state.selected[3].length !== 5) return;

  const userHand = state.hands[3].filter((c) => state.selected[3].includes(c.id));
  if (userHand.filter((card) => card.rank === "joker").length > 1) return;

  for (let i = 0; i < 3; i++) {
    const { hand, result } = bestHandFromEight(state.hands[i]);
    finishOnePlayer(i, hand, result);
  }

  const userEval = evaluateBestFive(userHand);
  finishOnePlayer(3, userHand, userEval);

  applyRoundPenalty();

  state.round += 1;
  state.phase = "discard";
  state.selected[3] = [];
  state.logs.push(`라운드 ${state.round - 1}: 핸드카드 점수 계산 완료`);
  render();
}

function applyRoundPenalty() {
  if (state.round % 4 !== 0) return;

  const userScore = state.scores[3];
  const rank = state.scores.filter((score) => score > userScore).length + 1;
  const penaltyByRank = { 1: 300, 2: 250, 3: 200, 4: 150 };
  const penalty = penaltyByRank[rank] || 0;
  if (!penalty) return;

  state.scores[3] -= penalty;
  state.logs.push(`라운드 ${state.round}: 사용자 ${rank}위 패널티 -${penalty}점`);
}

function finishOnePlayer(idx, hand, result) {
  state.scores[idx] += result.score;
  state.lastResult[idx] = result;
  const ids = new Set(hand.map((c) => c.id));
  const remain = state.hands[idx].filter((c) => !ids.has(c.id));
  state.hands[idx] = [...remain, ...drawCardsWithJokerLimit(remain, 5)];
  state.logs.push(`${PLAYERS[idx]}: ${result.name} ${result.score}점 (${result.formula})`);
}
