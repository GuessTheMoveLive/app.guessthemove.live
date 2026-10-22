Status: resolved
Type: research

## Question

What's a standard, implementable formula for converting a chess engine's centipawn (or mate-in-N) Evaluation into a win-probability, suitable for grounding the Guess Score's win-probability-loss bands and the Analysis Tree's Assessment Bonus? (See [Move equivalence & scoring bands](../issues/01-move-equivalence-scoring-bands.md), which decided to use win-probability rather than raw centipawns, but left the formula and band cutpoints open.)

Look at how established tools do this (e.g. Lichess's and chess.com's centipawn-to-win% logistic conversions used for their accuracy/blunder classification) and surface the actual constants/formula so band cutpoints can be picked with real numbers rather than guessed.

## Answer

Lichess's real, currently-live conversion (read directly from `lichess-org/scalachess`'s
`eval.scala`) is a plain logistic: `winProb(cp) = 100 / (1 + exp(-0.00368208 * cp))`, with `cp`
clamped to ±1000 first — algebraically the same function as the commonly-quoted
`50 + 50*(2/(1+exp(-0.00368208*cp))-1)` form. Any mate score, regardless of distance, is treated as
exactly ±1000cp (≈97.54%/2.46% win probability, not ≈100%/0%) — confirmed from source, though
Lichess's own move-judgement code (`Advice.scala`) actually ignores this for mate transitions and
uses separate raw-centipawn heuristics instead, and doesn't penalize a mate that's merely slower.
Lichess's real Inaccuracy/Mistake/Blunder cutpoints are `.1/.2/.3` deltas on its internal `[-1,+1]`
"winningChances" scale, which is **5/10/15 percentage points** of win-probability lost on the normal
0–100 scale (not 10/20/30 — several secondary sources get this wrong by skipping the ×50 scale
conversion between the two internal representations). Chess.com's actual formula is not public and
not confirmed anywhere; official chess.com docs disclose no formula or thresholds, and any specific
numbers attributed to chess.com online are third-party speculation using raw centipawn cutoffs, not
win%-loss. The general/academic logistic-in-centipawns form is corroborated independently by
`python-chess`'s own vendored Lichess constant, and Stockfish ships a more sophisticated, ply-
dependent WDL model that's likely overkill for this project. Full detail, exact source citations
(file/commit), the mate-handling discrepancy across tools, and a starting-point extrapolation to a
full ±3 band scale are in
[`research/win-probability-model.md`](../research/win-probability-model.md).
