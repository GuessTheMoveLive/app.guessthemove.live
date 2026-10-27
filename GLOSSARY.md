# Guess the Move

A live, multiplayer chess training format: participants guess the moves of a strong player from a real game, scored for accuracy rather than speed, while a shared display runs the event.

## Language

**Session**:
One live event instance, identified by a Room Code, running from the Plenum Selection Phase through to a final Leaderboard. Not persisted once it ends; no accounts.
_Avoid_: Game (ambiguous with Featured Game), Room (that's the Room Code, not the Session itself)

**Host**:
The person running the Session from the Host Display. May also join as a separate Participant on their own phone, but the Host role itself never submits Guesses.
_Avoid_: Presenter, moderator

**Host Display**:
The shared screen (driven from a PC, shown on the beamer) a Session's Host uses to run the Plenum Selection Phase, control Reveals, and show the board and Leaderboard to the room. Never shows a Participant's Guess or Analysis Tree before Reveal, including the Host's own if they've joined as a Participant.
_Avoid_: Beamer, projector, control panel

**Participant**:
A phone joined to a Session via its Room Code, identified by a free-typed display name (no account). Submits Guesses and, optionally, Analysis Trees during Rounds.
_Avoid_: Player, user

**Room Code**:
The short code (with accompanying URL) a Session's Host Display shows so Participants can join.

**Plenum Selection Phase**:
The Session's opening phase: the Host enters moves on the Host Display's board as the room verbally agrees on a position, with no Participant device interaction or scoring. Once a position is reached, it's used to search for a Candidate Game.
_Avoid_: Opening phase, game selection

**Candidate Game**:
A real game surfaced by searching on criteria (opening reached, tournament tier, gender, etc.) during the Plenum Selection Phase, carrying a computed Accuracy Score. The Host picks one Candidate Game meeting the minimum Accuracy Score to become the Featured Game.

**Featured Game**:
The Candidate Game chosen to guess through for the rest of the Session, played move by move across successive Rounds.

**Featured Side**:
The color in the Featured Game whose moves Participants guess.

**Scoring Start Move**:
The move in the Featured Game from which Guesses begin to count. Rounds before it are still played in full — a Guess is still submitted, there's still a Reveal — but always score 0, regardless of accuracy. The Leaderboard only starts moving once it's reached.

**Accuracy Score**:
A computed quality gate on a Candidate Game: the Featured Side's average per-move win-probability loss, from the reached position through to the game's end, which must stay below the inaccuracy cutoff, with no single Featured Side move crossing the blunder cutoff. Only the Featured Side's moves count — the side other than the Featured Side is not scored.

**Round**:
One iteration of guessing a single Featured Side move: Participants submit Guesses and may extend Analysis Trees, the Host triggers Reveal, then a Round Score and updated Leaderboard follow. A Round not submitted by its deadline scores -3 for that Participant; there is no no-penalty abstain.

**Guess**:
A Participant's submitted move for the current Round's Featured Side move. Locked in once submitted; hidden from everyone (including the Host Display) until Reveal.
_Avoid_: Answer, pick

**Analysis Tree**:
A Participant's optional, unbounded-depth structure of moves branching off their Guess, extendable until Reveal even after the Guess itself is locked. Each branch point is either an Anticipated Reply or a Wildcard Reply, and each leaf carries an Assessment Symbol.
_Avoid_: Variation, line (use only inside a definition, not as the canonical term)

**Anticipated Reply**:
A branch in an Analysis Tree keyed to one specific opponent move the Participant is planning against.

**Wildcard Reply**:
A branch in an Analysis Tree, written `*`, meaning "whatever the opponent plays instead" — sits alongside a node's Anticipated Replies as a fallback.

**Assessment Symbol**:
The standard chess annotation (`+-`, `±`, `=`, `∓`, `-+`) a Participant chooses at an Analysis Tree leaf to state their own read of that resulting position.
_Avoid_: Eval, evaluation (reserve those for the engine's computed Evaluation, not the Participant's Assessment Symbol)

**Evaluation**:
The engine's own computed assessment of a position or move, produced live and on demand. Distinct from a Participant's Assessment Symbol, which is compared against it for credit.

**Guess Score**:
The -3..+3 points a Guess earns, from win-probability-loss bands computed against the Evaluation of the Featured Side's actual move.

**Soundness Bonus**:
+0.5 earned by an Analysis Tree node beyond the Guess itself — the Guess's own root is never scored for Soundness, since Guess Score already covers it — whose win-probability loss against the best available reply stays under the blunder cutoff (see Accuracy Score). A Wildcard Reply earns no Soundness Bonus of its own, having no specific move to check; only Anticipated Reply nodes do.

**Assessment Bonus**:
Points an Analysis Tree leaf's Assessment Symbol earns against the Evaluation at that leaf, in three tiers: +0.5 for an exact band match, +0.25 for an adjacent band, 0 for the wrong side of the ledger entirely.

**Round Score**:
A Participant's total for one Round: Guess Score plus that Round's Analysis Tree contribution, where the contribution is the sum of all Soundness Bonuses and Assessment Bonuses earned, capped at +3 (one shared cap across both bonus types, not split between them). Every bonus is additive-only — floored at 0 per node/leaf, never subtracting — so nothing about the Analysis Tree can make a Round Score worse than Guess Score alone, and a strong Analysis Tree can carry a negative Guess Score to a net positive Round Score. Effective range: -3 (worst Guess, no tree credit) to +6 (best Guess, tree contribution capped).

**Reveal**:
The Host-triggered moment a Round's Guesses and Analysis Trees become visible to the room and the Leaderboard updates. Nothing is visible to anyone (Participants or the Host Display) before it.

**Leaderboard**:
The running total of Round Scores per Participant, shown after each Reveal alongside that Round's Momentum Highlight. The shared/Host view shows only the top 5; a Participant's own phone always additionally shows their own current score, even outside the top 5.

**Momentum Highlight**:
The Participant with the largest Round Score gain in the Round just revealed.
