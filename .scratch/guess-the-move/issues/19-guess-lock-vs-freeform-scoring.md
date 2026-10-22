Status: open
Type: grilling

## Question

Building the Analysis Tree phone UI prototype ([Analysis Tree phone UI prototype](14-analysis-tree-phone-ui-prototype.md)) surfaced doubt about the Guess-locks-then-tree-grows model itself: "the locking mechanism makes the whole concept very difficult to implement and explain. It might be much easier if users simply write as much as possible and then the whole variation is evaluated against the computer on given points."

Reconsider whether a Participant should submit one locked Guess plus a separately-structured, unbounded Analysis Tree (branching Anticipated/Wildcard Replies) — or instead write a single free-form continuation (no lock, no branch structure) that gets scored holistically against engine Evaluations at chosen points along it.

This isn't a fresh question — it revisits decisions already made and would ripple through them if changed:

- [Move & tree input mechanics](04-move-tree-input-mechanics.md): decided "Guess locks on entry, tree keeps growing until Reveal." A free-form model has no lock moment and no Guess/tree split at all.
- [Move equivalence & scoring bands](01-move-equivalence-scoring-bands.md): the -3..+3 Guess Score is scored specifically against the single locked Guess move. A free-form continuation has no single move to score that way.
- [Round Score composition](13-round-score-composition.md): Round Score = Guess Score + capped Analysis Tree bonus, a formula built entirely on the Guess/tree split this ticket questions.
- [Analysis Tree design](03-analysis-tree-design.md): the branching Anticipated/Wildcard Reply structure may not be needed at all if Participants just write one continuation.

Resolve by deciding: keep the current split (and explain why it's worth the added complexity), or replace it with free-form-continuation-plus-holistic-scoring — and if the latter, what "evaluated at given points" concretely means (which points, what score results, does depth/breadth credit survive in some form). A decision to replace the model invalidates and requires rewriting [Move & tree input mechanics](04-move-tree-input-mechanics.md), [Move equivalence & scoring bands](01-move-equivalence-scoring-bands.md), and [Round Score composition](13-round-score-composition.md) rather than leaving them on the map as stale decisions.
