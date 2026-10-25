// PROTOTYPE — throwaway. Answers the question: does the core chessgames.com
// "Guess-the-Move" loop (guess the historical winner's move, get scored against
// precomputed tiers, see the reveal, running score) feel right as a single-player
// game, before any of the live-multiplayer spec in CONTEXT.md is built on top of it?
//
// Single Worker, single self-contained HTML page. Game data for one game
// (Capablanca vs Marshall, 1909) is precomputed by scripts/build-game-data.mjs
// from the hand-annotated answer-key PGN and baked in at deploy time.
import gameData from "./data/capablanca-marshall.json";
import vendorChessSource from "./vendor-chess-source.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/vendor/chess.js") {
      return new Response(vendorChessSource, {
        headers: {
          "content-type": "text/javascript; charset=utf-8",
          "cache-control": "public, max-age=86400",
        },
      });
    }

    const environment = env.ENVIRONMENT || "unknown";
    return new Response(renderPage(gameData, environment), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  },
};

function renderPage(data, environment) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Guess the Move — prototype (${environment})</title>
<style>${CSS}</style>
</head>
<body>
<div id="app">Loading…</div>
<script id="game-data" type="application/json">${JSON.stringify(data)}</script>
<script type="module">${CLIENT_JS}</script>
</body>
</html>`;
}

const CSS = `
:root {
  color-scheme: light dark;
  --bg: #faf7f2;
  --panel: #ffffff;
  --ink: #1f1a14;
  --muted: #6b6153;
  --accent: #8a5a2b;
  --accent-2: #2f6b4f;
  --light-sq: #f0d9b5;
  --dark-sq: #b58863;
  --sel: rgba(255, 213, 79, 0.55);
  --target: rgba(47, 107, 79, 0.45);
  --border: #e4dcce;
  --good: #2f6b4f;
  --bad: #a1332a;
  --neutral: #8a5a2b;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink); min-height: 100vh; }
#app { max-width: 1040px; margin: 0 auto; padding: 20px 16px 60px; }

.proto-banner {
  background: #2f2a22; color: #e9dfc9; font-size: 12.5px; padding: 6px 14px;
  text-align: center; letter-spacing: .02em;
}
.proto-banner b { color: #f3c969; }

header.top { display:flex; align-items:baseline; justify-content:space-between; gap: 12px; flex-wrap: wrap; margin: 18px 0 6px; }
header.top h1 { font-size: 22px; margin: 0; }
header.top .env { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: .08em; }

.game-meta { color: var(--muted); font-size: 14px; margin-bottom: 18px; }
.game-meta b { color: var(--ink); }

.layout { display: grid; grid-template-columns: minmax(280px, 520px) 1fr; gap: 24px; align-items: start; }
@media (max-width: 760px) { .layout { grid-template-columns: 1fr; } }

.board-wrap { width: 100%; }
.board {
  display: grid; grid-template-columns: repeat(8, 1fr); width: 100%; aspect-ratio: 1;
  border: 3px solid #4a3523; border-radius: 6px; overflow: hidden; box-shadow: 0 6px 24px rgba(0,0,0,.12);
}
.sq { position: relative; display:flex; align-items:center; justify-content:center; font-size: clamp(22px, 5.2vw, 40px); cursor: default; user-select: none; }
.sq.light { background: var(--light-sq); }
.sq.dark { background: var(--dark-sq); }
.sq.selectable { cursor: pointer; }
.sq.selected { outline: 3px solid #f3c969; outline-offset: -3px; }
.sq.target::after { content: ""; position: absolute; width: 32%; height: 32%; border-radius: 50%; background: var(--target); }
.sq.target.capture::after { width: 86%; height: 86%; background: transparent; border: 5px solid var(--target); border-radius: 10%; }
.sq.lastmove { box-shadow: inset 0 0 0 9999px rgba(255, 213, 79, 0.28); }
.piece-w { color: #fff; text-shadow: 0 0 1.5px #000, 0 0 1.5px #000, 0 1px 2px rgba(0,0,0,.6); }
.piece-b { color: #1a1310; text-shadow: 0 1px 1px rgba(255,255,255,.25); }
.sq.selectable:hover { filter: brightness(1.08); }

.coords { display:flex; justify-content:space-between; font-size:11px; color: var(--muted); padding: 4px 2px 0; }

.panel { background: var(--panel); border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; margin-bottom: 16px; }
.panel h2 { margin: 0 0 10px; font-size: 14px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); }

.score-row { display:flex; align-items:center; justify-content:space-between; }
.score-value { font-size: 30px; font-weight: 700; color: var(--accent); }
.score-sub { font-size: 12px; color: var(--muted); }

.movelist { font-size: 14px; line-height: 1.7; max-height: 180px; overflow-y: auto; }
.movelist .mv-num { color: var(--muted); margin-right: 4px; }
.movelist .mv-cur { background: #f3c96955; border-radius: 3px; padding: 0 3px; }

.prompt { font-size: 16px; margin-bottom: 10px; }
.prompt b { color: var(--accent); }

.guess-input-row { display:flex; gap: 8px; margin: 10px 0; }
.guess-input-row input { flex:1; padding: 9px 10px; border: 1px solid var(--border); border-radius: 6px; font-size: 15px; }

.btn-row { display:flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
button { font: inherit; border: none; border-radius: 7px; padding: 9px 16px; cursor: pointer; font-weight: 600; }
button.primary { background: var(--accent-2); color: white; }
button.primary:disabled { background: #a9bdb2; cursor: not-allowed; }
button.ghost { background: transparent; color: var(--muted); border: 1px solid var(--border); }
button.ghost:hover { background: #00000008; }
button.continue { background: var(--accent); color: white; }

.promo-chooser { display:flex; gap:8px; margin: 8px 0; }
.promo-chooser button { font-size: 22px; padding: 6px 12px; background: var(--panel); border: 1px solid var(--border); }

.reveal { border-top: 1px dashed var(--border); margin-top: 14px; padding-top: 14px; }
.tier-badge { display:inline-flex; align-items:center; gap:6px; font-weight:700; padding: 3px 10px; border-radius: 999px; font-size: 13px; }
.tier-badge.pts-pos { background: #e4f2ea; color: var(--good); }
.tier-badge.pts-zero { background: #f1efe9; color: var(--muted); }
.tier-badge.pts-neg { background: #fbe9e7; color: var(--bad); }
.reveal-line { margin: 6px 0; font-size: 14px; }
.reveal-line .label { color: var(--muted); }
.reveal-line code { background: #00000008; padding: 1px 6px; border-radius: 4px; }

.endscreen h2 { font-size: 20px; margin-top: 0; }
.breakdown { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.breakdown th, .breakdown td { text-align: left; padding: 5px 8px; border-bottom: 1px solid var(--border); }
.breakdown td.pts { text-align: right; font-weight: 700; }
.breakdown tr.pos td.pts { color: var(--good); }
.breakdown tr.neg td.pts { color: var(--bad); }

.muted { color: var(--muted); }
.small { font-size: 12.5px; }
`;

// NOTE: this is plain client-side JS, deliberately split so GameSession (the pure
// logic) could be lifted straight into a real module if this loop survives review.
const CLIENT_JS = `
import { Chess } from "/vendor/chess.js";

const DATA = JSON.parse(document.getElementById("game-data").textContent);

// ---------- pure logic: could be lifted into the real codebase as-is ----------

const TIER_POINTS = { "+3": 3, "+2": 2, "+1": 1, "0": 0 };
const TIER_LABEL = {
  "+3": "Best (or equal to it)",
  "+2": "Almost as good",
  "+1": "Playable, clearly second-best",
  "0": "Not a real contender",
};

function blunderPenalty(step, altEval) {
  const evals = [step.playedComment.eval, ...step.alternatives.map((a) => a.eval)];
  const best = Math.max(...evals);
  const diff = best - altEval;
  if (diff <= 6) return -1;
  if (diff <= 9) return -2;
  return -3;
}

function scoreGuess(step, guessSan) {
  if (!guessSan) {
    return { points: 0, tier: null, label: "Abstained — no penalty", assessment: null, matched: "skip" };
  }
  if (guessSan === step.san) {
    return { points: 3, tier: "+3", label: "Exactly the move played!", assessment: step.playedComment.assessment, matched: "played" };
  }
  const alt = step.alternatives.find((a) => a.san === guessSan);
  if (!alt) {
    return { points: 0, tier: null, label: "Not among the engine's reasonable moves", assessment: null, matched: "unlisted" };
  }
  if (alt.tier === "blunder") {
    const points = blunderPenalty(step, alt.eval);
    return { points, tier: "blunder", label: "Blunder", assessment: alt.assessment, matched: "alt", eval: alt.eval };
  }
  return { points: TIER_POINTS[alt.tier], tier: alt.tier, label: TIER_LABEL[alt.tier], assessment: alt.assessment, matched: "alt", eval: alt.eval };
}

class GameSession {
  constructor(data) {
    this.data = data;
    this.chess = new Chess(data.startFen);
    this.index = 0;
    this.score = 0;
    this.rounds = [];
  }
  get step() { return this.data.steps[this.index]; }
  get done() { return this.index >= this.data.steps.length; }
  get isQuiz() { return !this.done && this.step.color === "w" && this.step.alternatives.length > 0; }

  // Apply every non-quiz step (openings, replies) until a quiz step or the end.
  // Returns the list of steps applied, for animating the board.
  playForwardToQuiz() {
    const played = [];
    while (!this.done && !this.isQuiz) {
      const s = this.step;
      this.chess.move(s.san);
      played.push(s);
      this.index++;
    }
    return played;
  }

  resolveQuiz(guessSan) {
    const s = this.step;
    const result = scoreGuess(s, guessSan);
    this.score += result.points;
    this.rounds.push({ step: s, guess: guessSan, result });
    this.chess.move(s.san);
    this.index++;
    return result;
  }
}

// ---------- DOM layer ----------

const PIECE_GLYPH = { p: "♟", n: "♞", b: "♝", r: "♜", q: "♛", k: "♚" };
const FILES = ["a","b","c","d","e","f","g","h"];

const app = document.getElementById("app");
let session = new GameSession(DATA);
let selected = null; // { square, moves: Move[] }
let pendingMove = null; // Move chosen by click, awaiting promotion choice or submit
let lastQuizReveal = null; // result of the most recent resolveQuiz, shown until Continue
let promoChoice = null; // {from,to} awaiting piece choice

function boardFromFen(fen) { return new Chess(fen); }

function squareColor(file, rank) { return (file + rank) % 2 === 0 ? "dark" : "light"; }

function render() {
  // session.chess.fen() is always the right thing to show: it's the pre-guess
  // position while a quiz step is pending, and the post-reveal position once
  // resolveQuiz() has applied the real move.
  const scratch = boardFromFen(session.chess.fen());

  app.innerHTML = \`
    <div class="proto-banner">🧪 <b>Throwaway prototype</b> — validating the guess → score → reveal loop before anything else gets built. Not production.</div>
    <header class="top">
      <h1>Guess the Move</h1>
      <span class="env">\${escapeHtml(session.data.headers.White)} vs \${escapeHtml(session.data.headers.Black)}, \${session.data.headers.Site}, \${session.data.headers.Date.slice(0,4)}</span>
    </header>
    <div class="game-meta">You are playing as <b>\${escapeHtml(session.data.headers.White)}</b> (White). Guess each of their moves; Black's replies play automatically.</div>
    <div class="layout">
      <div>
        <div class="board-wrap">
          <div class="board" id="board"></div>
          <div class="coords">\${FILES.map((f) => \`<span>\${f}</span>\`).join("")}</div>
        </div>
      </div>
      <div>
        <div class="panel">
          <h2>Score</h2>
          <div class="score-row">
            <div class="score-value">\${session.score > 0 ? "+" : ""}\${session.score}</div>
            <div class="score-sub">\${session.rounds.length} move\${session.rounds.length === 1 ? "" : "s"} guessed</div>
          </div>
        </div>
        <div class="panel">
          <h2>Moves so far</h2>
          <div class="movelist" id="movelist"></div>
        </div>
        <div class="panel" id="action-panel"></div>
      </div>
    </div>
  \`;

  renderBoard(scratch);
  renderMoveList();
  renderActionPanel();
}

function renderBoard(scratch) {
  const boardEl = document.getElementById("board");
  const board = scratch.board(); // rank 8 -> rank 1, each row a-h
  const lastStep = session.index > 0 ? session.data.steps[session.index - 1] : null;
  const lastFromTo = lastStep ? sanToSquares(lastStep) : null;

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const piece = board[r][f];
      const file = f, rank = 8 - r;
      const squareName = FILES[file] + rank;
      const sq = document.createElement("div");
      sq.className = "sq " + squareColor(file, rank);
      if (selected && selected.square === squareName) sq.classList.add("selected");
      const targetMove = selected && selected.moves.find((m) => m.to === squareName);
      if (targetMove) { sq.classList.add("target"); if (targetMove.captured) sq.classList.add("capture"); }
      if (lastFromTo && (squareName === lastFromTo.from || squareName === lastFromTo.to)) sq.classList.add("lastmove");

      if (piece) {
        const span = document.createElement("span");
        span.textContent = PIECE_GLYPH[piece.type];
        span.className = piece.color === "w" ? "piece-w" : "piece-b";
        sq.appendChild(span);
      }

      const clickable = session.isQuiz && !lastQuizReveal && !promoChoice &&
        ((piece && piece.color === "w") || (selected && selected.moves.some((m) => m.to === squareName)));
      if (clickable) {
        sq.classList.add("selectable");
        sq.addEventListener("click", () => onSquareClick(squareName, scratch));
      }
      boardEl.appendChild(sq);
    }
  }
}

function sanToSquares(step) {
  // best-effort from/to for highlighting; derived by diffing fenBefore/fenAfter squares is overkill
  // for a prototype — just re-derive via chess.js from fenBefore.
  try {
    const c = new Chess(step.fenBefore);
    const mv = c.move(step.san);
    return { from: mv.from, to: mv.to };
  } catch { return null; }
}

function onSquareClick(squareName, scratch) {
  if (selected) {
    const move = selected.moves.find((m) => m.to === squareName);
    if (move) {
      if (move.promotion) {
        promoChoice = { from: move.from, to: move.to };
        selected = null;
        render();
        return;
      }
      pendingMove = move;
      selected = null;
      render();
      return;
    }
  }
  const piece = scratch.get(squareName);
  if (piece && piece.color === "w") {
    const moves = scratch.moves({ square: squareName, verbose: true });
    selected = moves.length ? { square: squareName, moves } : null;
  } else {
    selected = null;
  }
  render();
}

function choosePromotion(piece) {
  const scratch = boardFromFen(session.step.fenBefore);
  const mv = scratch.moves({ square: promoChoice.from, verbose: true })
    .find((m) => m.to === promoChoice.to && m.promotion === piece);
  pendingMove = mv;
  promoChoice = null;
  render();
}

function renderMoveList() {
  const el = document.getElementById("movelist");
  if (!el) return;
  const parts = [];
  let i = 0;
  const steps = session.data.steps.slice(0, session.index);
  while (i < steps.length) {
    const w = steps[i];
    const b = steps[i + 1];
    const num = Math.ceil((i + 2) / 2);
    parts.push(\`<span class="mv-num">\${num}.</span> \${escapeHtml(w.san)} \${b ? escapeHtml(b.san) : ""}\`);
    i += 2;
  }
  el.innerHTML = parts.join(" ") || '<span class="muted small">—</span>';
  el.scrollTop = el.scrollHeight;
}

function renderActionPanel() {
  const panel = document.getElementById("action-panel");
  if (!panel) return;

  if (session.done && !lastQuizReveal) {
    panel.innerHTML = renderEndScreen();
    document.getElementById("play-again")?.addEventListener("click", () => {
      session = new GameSession(DATA);
      selected = null; pendingMove = null; lastQuizReveal = null; promoChoice = null;
      boot();
    });
    return;
  }

  if (lastQuizReveal) {
    panel.innerHTML = renderReveal(lastQuizReveal);
    document.getElementById("continue-btn").addEventListener("click", () => {
      lastQuizReveal = null;
      const played = session.playForwardToQuiz();
      render();
      if (played.length) flashAutoPlay();
    });
    return;
  }

  if (promoChoice) {
    panel.innerHTML = \`
      <h2>Promote to…</h2>
      <div class="promo-chooser">
        \${["q","r","b","n"].map((p) => \`<button data-p="\${p}">\${PIECE_GLYPH[p]}</button>\`).join("")}
      </div>\`;
    panel.querySelectorAll("button[data-p]").forEach((b) =>
      b.addEventListener("click", () => choosePromotion(b.dataset.p)));
    return;
  }

  const step = session.step;
  const moveNo = Math.ceil((step.ply) / 2);
  panel.innerHTML = \`
    <h2>Round \${session.rounds.length + 1}</h2>
    <div class="prompt">Guess <b>\${escapeHtml(session.data.headers.White)}</b>'s move \${moveNo}\${pendingMove ? \`: <code>\${escapeHtml(pendingMove.san)}</code>\` : " (click a piece on the board, or type it below)"}</div>
    <div class="guess-input-row">
      <input type="text" id="guess-text" placeholder="e.g. Nf3, exd4, O-O" \${pendingMove ? "disabled" : ""} />
      <button class="ghost" id="guess-text-btn" \${pendingMove ? "disabled" : ""}>Use text</button>
    </div>
    <div class="btn-row">
      <button class="primary" id="submit-btn" \${pendingMove ? "" : "disabled"}>Submit guess</button>
      <button class="ghost" id="clear-btn" \${pendingMove ? "" : "disabled"}>Clear</button>
      <button class="ghost" id="skip-btn">Skip (no points, no penalty)</button>
    </div>
  \`;

  document.getElementById("clear-btn").addEventListener("click", () => { pendingMove = null; render(); });
  document.getElementById("skip-btn").addEventListener("click", () => {
    lastQuizReveal = session.resolveQuiz(null);
    pendingMove = null;
    render();
  });
  document.getElementById("submit-btn").addEventListener("click", () => {
    if (!pendingMove) return;
    lastQuizReveal = session.resolveQuiz(pendingMove.san);
    pendingMove = null;
    render();
  });
  document.getElementById("guess-text-btn").addEventListener("click", () => {
    const text = document.getElementById("guess-text").value.trim();
    if (!text) return;
    const scratch = boardFromFen(step.fenBefore);
    let mv = null;
    try { mv = scratch.move(text); } catch {}
    if (!mv) {
      const uci = text.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/i);
      if (uci) { try { mv = scratch.move({ from: uci[1], to: uci[2], promotion: uci[3] }); } catch {} }
    }
    if (!mv) { alert("Couldn't parse that as a legal move. Try standard notation like Nf3 or e2e4."); return; }
    pendingMove = mv;
    render();
  });
}

function flashAutoPlay() {
  const boardEl = document.getElementById("board");
  if (!boardEl) return;
  boardEl.style.transition = "opacity .15s";
  boardEl.style.opacity = "0.4";
  setTimeout(() => { boardEl.style.opacity = "1"; }, 160);
}

function tierPtsClass(points) { return points > 0 ? "pts-pos" : points < 0 ? "pts-neg" : "pts-zero"; }

function renderReveal(result) {
  const step = session.data.steps[session.index - 1];
  const guess = session.rounds[session.rounds.length - 1].guess;
  return \`
    <h2>Reveal</h2>
    <div class="reveal">
      <span class="tier-badge \${tierPtsClass(result.points)}">\${result.points > 0 ? "+" : ""}\${result.points} pts — \${escapeHtml(result.label)}</span>
      <div class="reveal-line"><span class="label">Your guess:</span> \${guess ? \`<code>\${escapeHtml(guess)}</code>\` : "<i>abstained</i>"}</div>
      <div class="reveal-line"><span class="label">\${escapeHtml(session.data.headers.White)} actually played:</span> <code>\${escapeHtml(step.san)}</code> (eval \${fmtEval(step.playedComment.eval)}\${step.playedComment.best && step.playedComment.best !== step.san ? \`, engine preferred \${escapeHtml(step.playedComment.best)}\` : ""})</div>
      \${result.assessment ? \`<div class="reveal-line"><span class="label">Resulting assessment:</span> \${escapeHtml(result.assessment)}</div>\` : ""}
    </div>
    <div class="btn-row"><button class="continue" id="continue-btn">Continue →</button></div>
  \`;
}

function fmtEval(e) { return (e > 0 ? "+" : "") + e.toFixed(2); }

function renderEndScreen() {
  const rows = session.rounds.map((r, i) => \`
    <tr class="\${r.result.points > 0 ? "pos" : r.result.points < 0 ? "neg" : ""}">
      <td>\${i + 1}</td>
      <td>\${escapeHtml(r.step.san)}</td>
      <td>\${r.guess ? escapeHtml(r.guess) : "<i>skipped</i>"}</td>
      <td>\${escapeHtml(r.result.label)}</td>
      <td class="pts">\${r.result.points > 0 ? "+" : ""}\${r.result.points}</td>
    </tr>\`).join("");
  return \`
    <div class="endscreen">
      <h2>Game over — final score: \${session.score > 0 ? "+" : ""}\${session.score}</h2>
      <p class="muted small">\${escapeHtml(session.data.headers.White)} defeated \${escapeHtml(session.data.headers.Black)}, \${session.data.headers.Site} \${session.data.headers.Date}. ${/* no par score — this is a one-off prototype, not a live database */""}</p>
      <table class="breakdown">
        <thead><tr><th>#</th><th>Played</th><th>Your guess</th><th>Result</th><th>Pts</th></tr></thead>
        <tbody>\${rows}</tbody>
      </table>
      <div class="btn-row"><button class="primary" id="play-again">Play again</button></div>
    </div>
  \`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}

function boot() {
  session.playForwardToQuiz();
  render();
}
boot();
`;
