Status: resolved
Type: grilling

## Question

What counts as a "correct"/"equivalent" Guess when it isn't the exact move the Featured Side played, and how does the +3..-3 Guess Score scale map onto engine results?

## Answer

Move equivalence and Guess Score both use **win-probability**, not raw centipawns: convert the engine's Evaluation to a win-probability, and score a Guess by how much win-probability it costs relative to the move actually played. This is more consistent across quiet vs sharp positions than a fixed centipawn threshold or a top-N-moves rule, and it lets the -3..+3 scale be defined as win-probability-loss bands (near-zero loss = +3, down through mid-range losses, to a winning-to-losing swing = -3), which also gives -3 the "blew away a won position" meaning the user wanted.

Superseded by: exact band cutpoints and the underlying centipawn-to-win% formula are deferred to [Win-probability model & band cutpoints](../issues/11-win-probability-model-research.md) (research) and folded into [Round score composition](../issues/13-round-score-composition.md) (grilling).
