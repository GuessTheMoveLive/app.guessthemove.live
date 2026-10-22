Status: resolved
Type: grilling

## Question

How do Guess Score, Soundness Bonus, and Assessment Bonus numerically combine into a single Round Score? Are there caps (e.g. can Analysis Tree bonuses outweigh a poor Guess Score, or exceed the main +3), relative weights between the three components, and is Round Score ever negative overall (e.g. a -3 Guess plus zero Analysis Tree)?

Depends conceptually on [Move equivalence & scoring bands](01-move-equivalence-scoring-bands.md) and [Analysis Tree design](03-analysis-tree-design.md), both already resolved; this ticket is specifically about the weighting/composition formula that combines them, which those left open.

## Answer

**Formula**: Round Score = Guess Score + Analysis Tree contribution, where the contribution is `min(3, sum of all Soundness Bonuses + Assessment Bonuses earned that Round)` — one shared +3 cap covering both bonus types combined, not split between them.

**Soundness Bonus**: flat +0.5 per Analysis Tree node beyond the Guess itself (the Guess's own root is never scored for Soundness — Guess Score already covers it) whose win-probability loss against the best available reply stays under the existing 15pp blunder cutoff ([Win-probability model & band cutpoints](11-win-probability-model-research.md)), reusing that cutpoint rather than inventing a new one. A Wildcard Reply node itself earns no Soundness Bonus — it names no specific move to check plausibility against — only Anticipated Reply nodes do; a Wildcard's own leaf can still earn its Assessment Bonus once Reveal shows what was actually played.

**Assessment Bonus**: per leaf, three tiers against the engine's Evaluation band there — full match +0.5, adjacent band +0.25, wrong side of the ledger entirely 0. (Sharpens [Analysis Tree design](03-analysis-tree-design.md)'s "graduated credit" into concrete numbers.)

**Additivity**: every bonus is additive-only, floored at 0 per node/leaf — no branch or Assessment Symbol can ever subtract from Round Score, only fail to add.

**Sign/floor**: no floor ties Round Score's sign to Guess Score's sign — a strong Analysis Tree can carry a negative-Guess-Score Round to a net positive Round Score, rewarding depth of thought even when the actual Guess was wrong. Effective Round Score range: -3 (worst Guess, no tree credit) to +6 (best Guess, tree contribution capped at +3).

CONTEXT.md's Round Score, Soundness Bonus, and Assessment Bonus entries have been sharpened to record this formula precisely, since it's the actual scoring rule rather than implementation detail.
