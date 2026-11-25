# Make Guess Score's +3 rank-based instead of a flat loss band

**Status**: accepted (narrows the '+3' half of [0004](./0004-win-probability-loss-tiers-over-hand-typed.md); '+2' and below are unchanged)

0004 computed every tier, including `+3`, from a flat `loss ≤ 2` win-probability-loss band against the position's best graded move. Live-running Sessions showed this made `+3` too easy to hit by accident: analysis of the two Featured Games already in the app found 41 of 60 scored positions (68%) had at least one alternative independently banding into `+3` alongside the move actually played, 28 of them with two or more such alternatives. In practice this meant the Host routinely had to override the displayed score down to `+2` because the "equally good" alternative was positionally unsound or simply not what a reasonable player would choose — the loss metric couldn't tell "genuinely as good" apart from "happens to fall under 2% loss at this particular position."

We replaced the `+3` band with a rank-based rule: `+3` goes to the move actually played, to anything at least as good as it (tied or strictly better), and to the single next-best-ranked move below it — but only when the played move is already within the old `loss ≤ 2` cutoff of the position's best, and that next-best move's own loss stays within the old `loss ≤ 5` ('+2') floor. Everything else falls through the original `loss`-based cascade for `+2`/`+1`/`0`/blunder, which is untouched.

## Considered Options

- **Tighten the flat threshold** (e.g. `loss ≤ 1` instead of `≤ 2`): simplest change, but still a single global cutoff blind to how many moves cluster near the top of any given position — it would reduce the crowding somewhat but not reliably, and offers no way to still reward a move that's genuinely as good as what was played regardless of the exact loss number.
- **Rank-based ceiling** (chosen): ties `+3` to the position's actual ranking rather than a magnitude cutoff. Reserves the ceiling for the played move, anything that actually matches or beats it, and at most one sound runner-up — directly targeting "too many unrelated moves independently call themselves +3" without guessing at a new magic threshold.

## Consequences

Applies uniformly to every Featured Game, past and future — there's no separate per-game tier data stored to migrate; tier is always derived live from each move's Evaluation (per 0004). A position can still show more than one `+3` (when several moves genuinely tie or beat the played move), but the previous "accidental cluster" case — several independently-banding alternatives with no real claim to being as good as what was played — now lands at `+2` instead.
