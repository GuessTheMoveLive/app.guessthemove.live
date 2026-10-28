// Build step: parses the hand-annotated "answer key" PGN into the flat JSON
// answer-key table the app ships (see src/lib/round/game-data.ts). Run with:
// npm run build:data
import { readFileSync, writeFileSync } from "node:fs";
import { Chess } from "chess.js";

const SRC = "./Capablanca - Marshall (Guess-the-Move key).pgn";
const OUT = "src/lib/data/capablanca-marshall.json";

const raw = readFileSync(SRC, "utf8");

// --- split headers from movetext ---
const headerRe = /^\[(\w+)\s+"(.*)"\]\s*$/gm;
const headers = {};
let m;
while ((m = headerRe.exec(raw))) headers[m[1]] = m[2];

const movetext = raw.replace(headerRe, "").trim();

// --- tokenizer: MOVENUM | SAN | COMMENT({...}) | VARSTART "(" | VAREND ")" | RESULT ---
function tokenize(text) {
  const tokens = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "{") {
      const end = text.indexOf("}", i);
      tokens.push({ type: "COMMENT", value: text.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    if (c === "(") { tokens.push({ type: "VARSTART" }); i++; continue; }
    if (c === ")") { tokens.push({ type: "VAREND" }); i++; continue; }
    // plain token: move number ("5." or "5...") or a SAN move or result
    let j = i;
    while (j < text.length && !/[\s{}()]/.test(text[j])) j++;
    const word = text.slice(i, j);
    i = j;
    if (/^\d+\.(\.\.)?$/.test(word)) { tokens.push({ type: "MOVENUM", value: word }); continue; }
    if (word === "1-0" || word === "0-1" || word === "1/2-1/2" || word === "*") {
      tokens.push({ type: "RESULT", value: word });
      continue;
    }
    tokens.push({ type: "SAN", value: word });
  }
  return tokens;
}

const tokens = tokenize(movetext);

// --- parse a variation's token slice: first SAN (the alternative move) + its comment,
// then the rest of the slice is a precomputed continuation (Feedback's Variant, #36) -
// alternating replies with no further comments, just SAN (and the odd MOVENUM) tokens.
function parseAlternative(slice) {
  let idx = 0;
  if (slice[idx]?.type === "MOVENUM") idx++;
  const sanTok = slice[idx]; idx++;
  const commentTok = slice[idx]; idx++;
  if (!sanTok || sanTok.type !== "SAN" || !commentTok || commentTok.type !== "COMMENT") {
    throw new Error("Malformed variation: " + JSON.stringify(slice.slice(0, 4)));
  }
  const fields = commentTok.value.split(",").map((s) => s.trim());
  const tier = fields[0]; // "+3" | "+2" | "+1" | "0" | "blunder"
  const evalField = fields.find((f) => /^[+-]?\d+\.\d+$/.test(f));
  const materialField = fields.find((f) => /^[+-]\d+p$/.test(f));
  const assessment = fields[fields.length - 1];
  const continuation = slice
    .slice(idx)
    .filter((tok) => tok.type === "SAN")
    .map((tok) => tok.value);
  return {
    san: sanTok.value,
    tier,
    eval: evalField ? parseFloat(evalField) : null,
    material: materialField || null,
    assessment,
    continuation,
  };
}

function parsePlayedComment(commentValue) {
  // e.g. "Played, +0.49, best d4, +=" or "Played, +8.09, best Rb7, +-"
  const fields = commentValue.split(",").map((s) => s.trim());
  const evalField = fields.find((f) => /^[+-]?\d+\.\d+$/.test(f));
  const bestField = fields.find((f) => f.startsWith("best "));
  const assessment = fields[fields.length - 1];
  return {
    eval: evalField ? parseFloat(evalField) : null,
    best: bestField ? bestField.replace(/^best\s+/, "") : null,
    assessment,
  };
}

// --- walk tokens, replay mainline with chess.js, collect steps ---
const chess = new Chess();
const steps = [];
let i = 0;

function skipBalancedVariation() {
  // assumes tokens[i] is VARSTART; returns the inner slice and leaves i past VAREND
  let depth = 1;
  const start = i + 1;
  i++;
  while (i < tokens.length && depth > 0) {
    if (tokens[i].type === "VARSTART") depth++;
    else if (tokens[i].type === "VAREND") depth--;
    if (depth > 0) i++;
  }
  const inner = tokens.slice(start, i);
  i++; // consume VAREND
  return inner;
}

while (i < tokens.length) {
  const tok = tokens[i];
  if (tok.type === "RESULT") { i++; continue; }
  if (tok.type === "MOVENUM") { i++; continue; } // consumed implicitly before SAN below too
  if (tok.type !== "SAN") { i++; continue; }

  const san = tok.value;
  const fenBefore = chess.fen();
  const color = chess.turn(); // 'w' | 'b'
  const moveObj = chess.move(san);
  if (!moveObj) throw new Error(`Illegal mainline move ${san} at ply ${steps.length}`);
  const fenAfter = chess.fen();
  i++;

  let comment = null;
  if (tokens[i]?.type === "COMMENT") { comment = tokens[i].value; i++; }

  const alternatives = [];
  while (tokens[i]?.type === "VARSTART") {
    const inner = skipBalancedVariation();
    alternatives.push(parseAlternative(inner));
  }

  steps.push({
    ply: steps.length + 1,
    color,
    san,
    fenBefore,
    fenAfter,
    moveNumber: moveObj.moveNumber ?? null,
    playedComment: comment ? parsePlayedComment(comment) : null,
    alternatives, // only populated for quizzed White moves
  });
}

const data = {
  headers,
  startFen: new Chess().fen(),
  steps,
};

writeFileSync(OUT, JSON.stringify(data));
console.log(`Wrote ${OUT}: ${steps.length} plies, ${steps.filter((s) => s.alternatives.length).length} quizzed White moves`);
