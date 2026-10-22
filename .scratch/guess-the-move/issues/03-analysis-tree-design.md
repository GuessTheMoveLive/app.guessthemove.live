Status: resolved
Type: grilling

## Question

What does a Participant's optional "additional analysis" submission look like structurally, and how is it scored?

## Answer

It's a single **Analysis Tree** rooted at the Participant's Guess: unbounded depth (the user's choice, not a fixed ply limit), where each node is a move and each branch point offers either an **Anticipated Reply** (a specific opponent move the Participant is planning against) or a **Wildcard Reply** (`*`, meaning "whatever else the opponent plays") sitting alongside the specific branches as a fallback — not replacing them, and not restricted to the tree's root.

Each leaf carries a Participant-chosen **Assessment Symbol** (`+-`, `±`, `=`, `∓`, `-+`, standard chess annotation) stating the Participant's own read of that resulting position.

Scoring has two engine-checked components per node/leaf, not flat participation credit:
- **Soundness Bonus**: per Analysis Tree node, checked against the engine's Evaluation there (rewards plausible, non-blundering branches).
- **Assessment Bonus**: per leaf, graduated credit comparing the chosen Assessment Symbol against the engine's actual Evaluation band there — full credit for an exact match, partial credit for an adjacent band, nothing for being on the wrong side of the ledger entirely.

How these combine with the Guess Score into a single Round Score (weights/caps) is deferred to [Round score composition](../issues/13-round-score-composition.md).
