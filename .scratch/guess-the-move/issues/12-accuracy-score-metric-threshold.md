Status: resolved
Type: grilling
Blocked by: 11

## Question

What exact metric is the Accuracy Score (e.g. average win-probability loss per move by the Featured Side across the game, worst single-move loss, something else), and what minimum threshold gates a Candidate Game into being featurable? Does the threshold apply only to the Featured Side, or to both sides of the Candidate Game?

Blocked on [Win-probability model & band cutpoints](11-win-probability-model-research.md) so the metric can be defined in the same win-probability terms as Guess Score, rather than picking an unrelated formula.

Also factor in a feasibility finding from [Games database/API research](10-games-database-api-research.md): no source provides ready-made per-move evaluations for arbitrary games, so computing a Candidate Game's Accuracy Score means running a full Stockfish pass over its PGN after fetching it — for a ~40-move game at the ~0.5–2s/position budget from [Chess engine choice & hosting](17-chess-engine-choice-hosting.md), that's tens of seconds to a couple of minutes per candidate, live, during the Plenum Selection Phase while the room waits. Decide whether that's acceptable as-is, needs parallelizing across candidates, needs a lighter/faster analysis budget just for Accuracy Score (vs the per-Guess evaluation budget), or needs candidates pre-filtered by something cheaper before committing to a full analysis pass.

## Answer

**Metric**: average per-move win-probability loss by the **Featured Side only** (the side other than the Featured Side is not scored — only the Featured Side's moves are ever guessed), computed from the **reached opening position through to the game's end** (not the pre-position moves the room already agreed on live during the Plenum Selection Phase).

**Threshold**: reuses the inaccuracy/mistake/blunder cutpoints already established in [Win-probability model & band cutpoints](11-win-probability-model-research.md) rather than inventing new numbers — a Candidate Game is featurable only if:
- average per-move loss < 5 percentage points (below the "inaccuracy" cutpoint), **and**
- worst single Featured Side move < 15 percentage points (below the "blunder" cutpoint — no outright blunder).

**Feasibility**: [Games database/API research](10-games-database-api-research.md) established that a single search query can return up to 15 Candidate Games, none with ready-made per-move evals. Scoring all 15 up front at per-Guess-quality precision (0.5–2s/position) would be tens of minutes — dead on arrival live. Resolved two ways together:
1. **Lazy, on-demand scoring**: never score all candidates up front. Only run the Stockfish pass for a candidate when the Host selects/hovers it as a serious contender; show a spinner while it computes.
2. **Lighter analysis budget just for Accuracy Score**: a fixed ~100ms/position budget (vs 0.5–2s for per-Guess evaluation) — Accuracy Score only needs to clear a threshold, not be precise to the centipoint, and the 5pp/15pp gaps are coarse enough that shallow-search noise won't flip the gate. For a ~20–30 move tail from a mid-game reached position, that's ~2–3s total per candidate — effectively instant from the Host's perspective.

CONTEXT.md's Accuracy Score entry has been sharpened to reflect this (Featured-Side-only, reached-position-to-end scope, inaccuracy/blunder cutoff gate). The exact 100ms budget and lazy-trigger mechanics are implementation detail, not glossary material, and are captured here instead.
