# Centipawn/Mate → Win-Probability Model Research

Research for [issue 11](../issues/11-win-probability-model-research.md). Goal: a concrete,
implementable centipawn (and mate-in-N) → win-probability conversion, plus real cutpoints
established tools use to turn win-probability loss into move-quality bands, to ground the
Guess Score's -3..+3 bands and the Assessment Bonus.

## TL;DR — recommended formula

```
winProb(cp)  = 100 / (1 + exp(-0.00368208 * cp))         // cp = centipawns from the side-to-move's POV, clamp to [-1000, 1000] first
winProbLoss  = winProb(bestMoveCp) - winProb(guessedMoveCp)   // both evaluated from the same side's POV, after clamping
```

- This is the exact formula live on Lichess today (verified by reading source, not a repost of a
  blog claim — see below). It is algebraically identical to the commonly-quoted
  `Win% = 50 + 50 * (2 / (1 + exp(-0.00368208 * centipawns)) - 1)` form; that expression simplifies
  to the plain logistic `100 / (1 + exp(-0.00368208 * cp))` (confirmed against source, not just
  simplified on paper — see "Confirmation" below).
- Mate scores: the current, live Lichess implementation collapses **any** mate score (mate-in-1
  through mate-in-N) to the same value as a centipawn score at the ceiling (±1000cp), regardless of
  N. This is a real, if surprising, decision — see the Mate section below for the exact code and the
  resulting number (≈97.54% / 2.46%, not ≈100%/0%).
- Confidence: **high** for the Lichess formula and constant — read directly from
  `lichess-org/scalachess` source, not inferred from secondary sources. **High** for the mate
  handling too, also read directly from source, but flagged as an open design question because
  a well-known adjacent tool (python-chess) implements Lichess's mate case differently (see below).
- Chess.com's actual formula is **not public** and could not be confirmed from any primary source.
  Anything specific quoted for chess.com below is explicitly marked as third-party/unconfirmed.

---

## 1. Lichess: primary source, read directly

Lichess's engine-analysis code is open source across two repos: `lichess-org/scalachess` (chess
domain logic, includes the win-probability model) and `lichess-org/lila` (the web app, includes the
move-judgement/accuracy logic that *uses* scalachess's model). I fetched and read the actual files
(via GitHub's contents API, decoding the blobs myself) rather than trusting search-engine summaries,
because summarized/AI-search results for this exact question were subtly wrong in two places (see
"Corrections to common claims" below).

### 1a. The centipawn → win-probability conversion

File: `core/src/main/scala/eval.scala` in
[`lichess-org/scalachess`](https://github.com/lichess-org/scalachess/blob/4765295c1cd366eec50050569b9ce14320f4f883/core/src/main/scala/eval.scala)
(commit `4765295`, current `master` as of 2026-09-23):

```scala
opaque type Cp = Int
object Cp extends OpaqueInt[Cp]:
  val CEILING = Cp(1000)
  val initial = Cp(15)
  inline def ceilingWithSignum(signum: Int) = CEILING.invertIf(signum < 0)
  extension (cp: Cp)
    inline def ceiled: Cp =
      if cp.value > Cp.CEILING then Cp.CEILING
      else if cp.value < -Cp.CEILING then -Cp.CEILING
      else cp
    ...

// How likely one is to win a position, based on subjective Stockfish centipawns
opaque type WinPercent = Double
object WinPercent extends OpaqueDouble[WinPercent]:

  def fromScore(score: Score): WinPercent = score.fold(fromCentiPawns, fromMate)

  def fromMate(mate: Eval.Mate) = fromCentiPawns(Eval.Cp.ceilingWithSignum(mate.signum))

  // [0, 100]
  def fromCentiPawns(cp: Eval.Cp) = WinPercent:
    50 + 50 * winningChances(cp.ceiled)

  // [-1, +1]
  def winningChances(cp: Eval.Cp) = {
    val MULTIPLIER = -0.00368208 // https://github.com/lichess-org/lila/pull/11148
    2 / (1 + Math.exp(MULTIPLIER * cp.value)) - 1
  }.atLeast(-1).atMost(+1)
```

Key facts, straight from this file:

- The centipawn value is **ceiled to ±1000** (`Cp.CEILING = 1000`) before conversion. Anything at or
  beyond ±10 pawns is treated identically.
- `winningChances(cp)` lives on **[-1, +1]**, not [0, 100]. `WinPercent.fromCentiPawns` then maps
  that to **[0, 100]** via `50 + 50 * winningChances`.
- The multiplier `-0.00368208` is cited in-source to
  [`lichess-org/lila#11148`](https://github.com/lichess-org/lila/pull/11148) — the PR where it was
  fit by regression against real Lichess game outcomes (a logistic fit of centipawns → observed
  game result), not an arbitrary constant.
- Algebraic simplification: `50 + 50*(2/(1+e^{-kx}) - 1) = 100/(1+e^{-kx})` — i.e. the "50 + 50*(2/(1+exp)-1)"
  form and the plain logistic `100/(1+exp(-kx))` are the same function. **Confirmed by direct
  substitution of the source code**, not assumed.

**Ready-to-implement form** (cp already from the mover's POV, positive = good for the mover):

```
clampedCp = clamp(cp, -1000, 1000)
winProb   = 100 / (1 + exp(-0.00368208 * clampedCp))     // 0..100
```

### 1b. Move-quality judgement thresholds (Inaccuracy / Mistake / Blunder)

File: `modules/tree/src/main/Advice.scala` in
[`lichess-org/lila`](https://github.com/lichess-org/lila/blob/cd921677f6083fbc3bc4c2c2521544e4b727894f/modules/tree/src/main/Advice.scala)
(commit `cd92167`):

```scala
private val winningChanceJudgements = List(
  .3 -> Advice.Judgement.Blunder,
  .2 -> Advice.Judgement.Mistake,
  .1 -> Advice.Judgement.Inaccuracy
)

def apply(prev: Info, info: Info): Option[CpAdvice] =
  for
    cp <- prev.cp
    infoCp <- info.cp
    prevWinningChances = WinPercent.winningChances(cp)
    currentWinningChances = WinPercent.winningChances(infoCp)
    delta = (currentWinningChances - prevWinningChances).pipe(d => info.color.fold(-d, d))
    judgement <- winningChanceJudgements.find((d, _) => d <= delta)._2F
  yield CpAdvice(judgement, info, prev)
```

**Important, non-obvious correction to common claims:** the `.3 / .2 / .1` thresholds are deltas on
the **`winningChances` [-1,+1] scale**, not on the `WinPercent` [0,100] scale that most blog posts
and even AI-search summaries describe them as. Since `WinPercent = 50 + 50 * winningChances`, a
`winningChances` delta of `d` corresponds to a **`WinPercent` (percentage-point) delta of `50 * d`**.
So the real cutpoints, expressed in win-percentage-points lost (the unit this project actually wants
for the Guess Score), are:

| Judgement  | `winningChances` delta | **WinPercent-points lost** |
|---|---|---|
| Inaccuracy | ≥ 0.1 | **≥ 5 pp** |
| Mistake    | ≥ 0.2 | **≥ 10 pp** |
| Blunder    | ≥ 0.3 | **≥ 15 pp** |

This matters directly for this project: if Guess the Move's win-probability-loss is computed on the
natural 0–100 `WinPercent` scale (as the TL;DR formula above produces), the equivalent Lichess-style
cutpoints to reuse are **5 / 10 / 15 percentage points**, not the "10/20/30" figure that appears in
several secondary sources (those sources appear to have read the `.1/.2/.3` constants and assumed
they were already in 0–100 percentage points, skipping the `× 50` from the `winningChances → WinPercent`
mapping).

### 1c. Mate handling — the surprising part

There are actually **two different, inconsistent treatments of mate scores** in Lichess's own
codebase, both read directly from source:

**(i) The `WinPercent` conversion itself** (`eval.scala`, above): any mate score, of any depth, is
converted via `fromMate(mate) = fromCentiPawns(Cp.ceilingWithSignum(mate.signum))` — i.e. it's
treated as exactly `+1000` or `-1000` centipawns (the ceiling), **regardless of how many moves the
mate takes**. Plugging into the formula:

```
winProb(±1000cp) = 100 / (1 + exp(∓0.00368208 * 1000)) ≈ 97.54% (winning side) / 2.46% (losing side)
```

So under Lichess's own `WinPercent` model, a forced mate is **not** ~100%/0% — it saturates at
~97.5%/2.5%, same as any other position ≥10 pawns "ahead."

**(ii) The move-judgement logic** (`Advice.scala`, `MateAdvice`, same file as above) does **not**
use `WinPercent`/`winningChances` at all for transitions into or out of mate. Instead it has bespoke
logic keyed on the pre-mate centipawn evaluation:

```scala
judgement <- sequence match
  case MateCreated if prevPovCpOrZero < -999 => Some(Advice.Judgement.Inaccuracy)
  case MateCreated if prevPovCpOrZero < -700 => Some(Advice.Judgement.Mistake)
  case MateCreated                            => Some(Advice.Judgement.Blunder)
  case MateLost    if povCpOrZero > 999       => Some(Advice.Judgement.Inaccuracy)
  case MateLost    if povCpOrZero > 700       => Some(Advice.Judgement.Mistake)
  case MateLost                                => Some(Advice.Judgement.Blunder)
  case MateDelayed                             => None   // no penalty at all
```

And critically: a move that keeps an existing forced mate winning but changes the mate distance
(`MateDelayed`, e.g. mate-in-3 → mate-in-7) produces **no judgement whatsoever** — Lichess does not
penalize "slower" mates as inaccuracies/mistakes/blunders at all. `MateSequence` is only detected for
Cp→Mate, Mate→Cp, and Mate(winning)→Mate(losing) transitions; same-sign mate→mate transitions fall
through and yield `None`.

**Implication for this project:** Lichess's real production behavior does not use one clean
win-probability-based rule for mate scores; it special-cases them with raw-centipawn heuristics for
classification, while using a flat ±1000cp ceiling for the WinPercent number itself. If Guess the
Move wants a single, principled rule (which seems preferable for a from-scratch design), the cleanest
option consistent with Lichess's actual `WinPercent` conversion is: **map any mate score to the same
±1000cp ceiling used for large centipawn evals**, accept that this saturates around 97.5%/2.5% (not
100%/0%), and then apply the *same* win-probability-loss bands uniformly to mate and non-mate moves
alike — which avoids needing Lichess's separate, more complicated `MateAdvice` special-casing. This
also naturally means "mate-in-1 missed for mate-in-5" only registers as a loss if it also crosses out
of the ~97.5% ceiling band, which is a reasonable simplification for a training/quiz format.

### Corrections to common claims (things AI/web search got subtly wrong)

1. Several search summaries described the "0.1/0.2/0.3" judgement thresholds as if they were already
   0–100 win-percentage-point cutoffs (implying 10/20/30 pp). Reading the source shows they are
   `winningChances` (±1 scale) deltas, i.e. **5/10/15 pp** on the 0–100 `WinPercent` scale used
   elsewhere. Always divide/multiply carefully between the two scales in this codebase.
2. Some third-party summaries assume mate scores map to ~100%/0% win probability on Lichess. The
   actual `WinPercent.fromMate` saturates at the same ±1000cp ceiling as huge centipawn evals, which
   computes to **≈97.54%/2.46%**, not 100%/0%.

---

## 2. Chess.com: what's actually confirmed vs speculated

Chess.com's Accuracy/move-classification methodology is **not open source and not formally
documented with a formula**. I checked the official support article and the official 2022 "Game
Review" relaunch announcement; neither discloses a conversion formula or centipawn/win% thresholds:

- Official support article, ["How does Game Review work?"](https://support.chess.com/en/articles/8584089-how-does-game-review-work):
  states only that Accuracy is "a score from 0 to 100 representing how accurately you played
  according to the engine's evaluations," and lists move labels (Brilliant, Great, Best, Excellent,
  Good, Book, Inaccuracy, Mistake, Miss, Blunder) with one-line, non-technical descriptions. No
  formula, no thresholds, no mention of "win percentage" as the underlying unit.
- Official news post, ["Game Review Now Available For All Chess.com Members"](https://www.chess.com/news/view/chesscom-releases-new-game-review)
  (Nov 2022), describes a *methodology change* (the old accuracy score was "heavily weighted by best
  moves played" and felt too harsh/too easy to inflate; the new one produces a wider, more intuitive
  spread, mostly 50–95) but again gives no formula.

Everything more specific than that is third-party speculation/reverse-engineering, and should be
treated as unconfirmed:

- A widely circulated fan blog post (chess.com/blog, DucTrung1702, "Chess.com chess analysis
  principles") gives a table of raw centipawn-loss cutoffs (Excellent <50cp, Good <100cp, Inaccuracy
  ~100–300cp, Mistake ~300–500cp, Blunder >500cp) and accuracy-score bands (90–100% "Grandmaster
  level," etc). This is explicitly the blogger's own estimate, not chess.com documentation, and it's
  a **raw-centipawn** model (not win-probability-based), which is exactly the kind of model Lichess's
  own accuracy docs argue against (a 300cp swing in a lost position is irrelevant; the same swing in
  an equal position is a blunder — hence win% instead of raw cp).
- Independent reverse-engineering write-ups (e.g. a GitHub PR discussion on an unofficial
  `Chess-Game-Analyzer` project) converge on the idea that chess.com's accuracy is *also* ultimately
  win%-loss-based and decays similarly to Lichess's per-move accuracy curve, but none of these are
  primary sources and none produced a constant with any confirmed provenance from chess.com itself.

**Bottom line for this project:** do not borrow chess.com "constants" — there are none confirmed.
Chess.com is useful only as evidence that (a) a major competitor also moved from raw-cp to a
win%-loss-style model and found raw-cp classification “felt wrong,” and (b) even they don't publish
exact numbers, so there's no expectation Guess the Move needs to match either tool exactly — picking
defensible cutpoints from Lichess's disclosed math (which we *can* verify) is the more rigorous path.

---

## 3. General/academic treatment of centipawn → win-probability

- The classical reference is the Chessprogramming Wiki article
  ["Pawn Advantage, Win Percentage, and Elo"](https://www.chessprogramming.org/Pawn_Advantage,_Win_Percentage,_and_Elo)
  (analysis by Sune Fischer and Pradu Kannan, 2007), which fits winning probability `W` to pawn
  advantage `P` with a logistic ("sigmoid") model, and separately derives an equivalent Elo-rating
  relationship. The exact numeric fit in that article is presented as images rather than machine-
  readable text (I could not pull literal digits from the page), but the qualitative result — that
  the win-probability curve is well modeled by a logistic function of centipawns, matching the same
  functional family as Lichess's constant — is confirmed from that source and is the origin of the
  general approach every tool below uses. Treat this as **confirmed for form** (logistic-in-cp) but
  **unconfirmed for exact constants**, since I could not extract the fitted numbers.
- **Stockfish's own WDL model** is the most rigorous alternative, and worth knowing about even if not
  adopted: Stockfish (from around version 12 onward) ships an internal, empirically-fit model that
  converts `(centipawns, ply/move-number)` to a Win/Draw/Loss percentage per mille, fit from millions
  of Stockfish self-play games, and it explicitly depends on ply (a `+200cp` advantage means
  different things at move 10 vs move 60). Source, read via `python-chess`'s `engine.py` (which
  vendors Stockfish's published formula verbatim with a citation to Stockfish's own `uci.cpp`), e.g.
  for SF14:
  ```python
  # https://github.com/official-stockfish/Stockfish/blob/sf_14/src/uci.cpp#L200-L220
  def _sf14_wins(cp, *, ply):
      m = min(240, max(ply, 0)) / 64
      a = (((-3.68389304*m + 30.07065921)*m + -60.52878723)*m) + 149.53378557
      b = (((-2.01818570*m + 15.85685038)*m + -29.83452023)*m) + 47.59078827
      x = min(2000, max(cp, -2000))
      return int(0.5 + 1000 / (1 + math.exp((a - x) / b)))
  ```
  This is materially more complex (ply-dependent `a`/`b` coefficients, refit release-to-release) than
  Lichess's single fixed constant. **Not recommended to adopt** for this project — it's tuned to a
  specific Stockfish version's own self-play distribution, changes across Stockfish releases, and
  the added ply-dependence is unlikely to be worth the complexity for a scoring band system — but
  worth recording as the more "correct" academic approach if higher fidelity is ever wanted later.
- `python-chess` (a widely-used, well-maintained chess library) ships both the Stockfish WDL models
  above **and** its own `"lichess"` model option (`chess.engine.py`, function `_lichess_raw_wins`),
  which cites the exact same Lichess PR and file we read directly:
  ```python
  def _lichess_raw_wins(cp: int) -> int:
      # https://github.com/lichess-org/lila/pull/11148
      # https://github.com/lichess-org/lila/blob/.../modules/analyse/src/main/WinPercent.scala#L26-L30
      return round(1000 / (1 + math.exp(-0.00368208 * cp)))
  ```
  This corroborates (from a second, independent codebase) both the exact constant `0.00368208` and
  the plain-logistic simplified form used in the TL;DR above.

---

## 4. Mate-in-N handling — survey of approaches, and the open question

Three different conventions were found across the sources above; they disagree, so this is flagged
as an explicit open question rather than a settled fact:

1. **Lichess (`scalachess`, actual production code)**: flat ceiling. Any mate, any distance, becomes
   exactly ±1000cp → ≈97.54%/2.46% win probability. Simple, but "mate in 1" and "mate in 40" are
   indistinguishable, and (per §1c) Lichess's own move-judgement code doesn't even use this value for
   mate transitions — it uses separate raw-cp heuristics instead.
2. **`python-chess`'s own `"lichess"` WDL approximation** (not itself a Lichess source — this is
   python-chess's own modeling choice, just labeled "lichess" and citing the same constant): scales
   with mate distance, `cp = (21 - min(10, abs(moves))) * 100`, so mate-in-1 → 2000cp (clamped to the
   ±1000 ceiling in the actual win% formula it feeds, so effectively still capped) while mate-in-10+
   → 1100cp. This is **not** the same rule as scalachess's own `fromMate` and should not be cited as
   "the Lichess formula" — it's a third-party approximation inspired by it. Confirmed by reading
   `python-chess`'s `engine.py` directly; the discrepancy with scalachess's real `fromMate` is my own
   observation from comparing the two sources, not something either project documents.
3. **Stockfish / most engines' native UCI convention**: mate scores are reported as a distinct field
   from centipawns entirely (`score mate N` vs `score cp N` in the UCI protocol) precisely because
   they're not commensurable with a centipawn count without an arbitrary convention — engines don't
   themselves define a "right" cp-equivalent for mate.

**Recommendation for Guess the Move** (a recommendation, not a settled decision — the ticket asks
for real numbers to choose bands from, not a final ruling): adopt convention (1), the real Lichess
behavior — clamp any mate score to ±1000cp equivalent (≈97.54%/2.46% win probability) and run it
through the *same* win-probability-loss band logic used for centipawn evaluations, rather than
Lichess's own bespoke `MateAdvice` special-casing. This is simpler to implement and test, is
consistent with how `Evaluation` values are compared elsewhere in this project's domain model, and
avoids the "slower mate = no penalty at all" edge case in Lichess's real logic, which seems like an
accident of implementation (mate-move ordering not mattering for accuracy purposes) rather than a
deliberate product decision worth reproducing for a training format.

**Open question left for the team:** whether "mate in 1 missed for mate in 5" should register *any*
Guess Score penalty at all under a flat-ceiling model — since both stay within the same ~97.5%
win-probability band, a flat-ceiling approach would score them identically (no loss), which may or
may not match the intuition Guess the Move wants for judging a Participant's Guess against a
Featured Side's move in a clearly-won mating position.

---

## 5. Suggested band cutpoints (data point, not a final decision)

Purely as a concrete anchor grounded in real numbers (per the ticket's ask — "so band cutpoints can
be picked with real numbers rather than guessed"), Lichess's own three real cutpoints on the
`WinPercent` (0–100) scale are **5 / 10 / 15 percentage points lost**. This project's Guess Score
needs seven bands (-3..+3) rather than Lichess's four (Best/Inaccuracy/Mistake/Blunder), so those
three numbers under-determine a full ±3 scale. One plausible extrapolation, reusing Lichess's real
cutpoints for the bands they actually cover and linearly extending for the rest:

| Guess Score | Win%-loss vs best/actual move |
|---|---|
| +3 | 0 pp (matches engine-best, or ties within an implementation-chosen noise floor) |
| +2 | > 0 – 5 pp |
| +1 | 5 – 10 pp |
| 0  | 10 – 15 pp |
| -1 | 15 – 25 pp |
| -2 | 25 – 40 pp |
| -3 | > 40 pp |

This is offered as a starting point only — the -1/-2/-3 cutpoints beyond Lichess's real 15pp blunder
threshold are extrapolated, not sourced, since Lichess's own scale stops distinguishing severity of
blunder beyond that point. Deciding the exact bands (and whether they should be symmetric, and how
"noise floor" for a tie at +3 is defined) is a product/design decision for a follow-up ticket, not
something a literature/source review can settle.

---

## Sources

- `lichess-org/scalachess`, `core/src/main/scala/eval.scala`, commit `4765295c1cd366eec50050569b9ce14320f4f883` — https://github.com/lichess-org/scalachess/blob/4765295c1cd366eec50050569b9ce14320f4f883/core/src/main/scala/eval.scala
- `lichess-org/lila`, `modules/tree/src/main/Advice.scala`, commit `cd921677f6083fbc3bc4c2c2521544e4b727894f` — https://github.com/lichess-org/lila/blob/cd921677f6083fbc3bc4c2c2521544e4b727894f/modules/tree/src/main/Advice.scala
- `lichess-org/lila`, `modules/analyse/src/main/AccuracyPercent.scala`, commit `1d57abcb62f5d3788314313605a7a2aac66b5f45` — https://github.com/lichess-org/lila/blob/1d57abcb62f5d3788314313605a7a2aac66b5f45/modules/analyse/src/main/AccuracyPercent.scala
- `lichess-org/lila` PR #11148 (origin of the `0.00368208` constant) — https://github.com/lichess-org/lila/pull/11148
- Lichess, "Accuracy" help page — https://lichess.org/page/accuracy
- `niklasf/python-chess`, `chess/engine.py` (`_lichess_raw_wins`, `_sf14_wins`, `Mate.wdl`) — https://github.com/niklasf/python-chess/blob/master/chess/engine.py
- Chess.com support, "How does Game Review work?" — https://support.chess.com/en/articles/8584089-how-does-game-review-work
- Chess.com news, "Game Review Now Available For All Chess.com Members" (Nov 2022) — https://www.chess.com/news/view/chesscom-releases-new-game-review
- Chess.com blog (fan post, explicitly not official), "Chess.com chess analysis principles" — https://www.chess.com/blog/DucTrung1702/chess-com-chess-analysis-principles
- Chessprogramming Wiki, "Pawn Advantage, Win Percentage, and Elo" — https://www.chessprogramming.org/Pawn_Advantage,_Win_Percentage,_and_Elo
