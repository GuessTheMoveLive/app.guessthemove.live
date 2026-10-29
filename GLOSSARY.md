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
The short code (with accompanying URL/QR) a Session's Host Display shows so Participants can join. Grants Participant entry only — never Host control (see Host Token).
_Avoid_: using this interchangeably with Host Token; they're different credentials with different privileges.

**Host Token**:
The secret credential, embedded only in the Host's own Session URL, that proves control of a Session. Never shown on the shared/QR view. Distinct from the Room Code, which anyone can see and use to join as a Participant.

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
The Host-triggered moment a Round's Guesses and Analysis Trees become visible to the room and the Leaderboard updates. Nothing is visible to anyone (Participants or the Host Display) before it. Automatically delivers each Participant their own Round Score, whether their Guess matched the Featured Side's actual move, and its Variant explanation — no separate Host step needed. The Host Display instead shows the full Guess Group breakdown (every Guess Group, every name) for the Host alone; the Host may optionally extend that to the room via Share Guess Groups.
_Avoid_: Feedback (retired as a separate phase — its explanation is now automatic and part of every Participant's Reveal).

**Leaderboard**:
The running total of Round Scores per Participant, shown after each Reveal alongside that Round's Momentum Highlight. The shared/Host view shows only the top 5; a Participant's own phone always additionally shows their own current score, even outside the top 5.

**Variant** (Reveal):
A short precomputed continuation of moves (with an end Evaluation) attached to an answer-key alternative, authored offline alongside the rest of the answer key and surfaced to a Participant automatically as part of their Reveal. Unrelated to the Analysis Tree's Participant-authored branches — this Variant comes from the answer key itself, not from anything a Participant wrote.

**Momentum Highlight**:
The Participant with the largest Round Score gain in the Round just revealed.

**Guess Group**:
All Participants who submitted the exact same move as their Guess in a Round. Scoped to the Guess only — Analysis Trees are never grouped. Every Participant belongs to exactly one Guess Group per Round (their own move, even if no one else chose it).
_Avoid_: Cluster, category, bucket — those get used loosely in conversation; the canonical term is Guess Group.

**Share Guess Groups**:
The Host's optional action at Reveal, available instead of advancing straight to the next Round, that pushes the Guess Group breakdown out to every Participant's own phone. Once shared, a Participant sees a bar chart with at most seven bars — one per distinct Round Score from -3 to +3, any score nobody got omitted — plus the names of everyone in their own Guess Group; every other Guess Group shows only its count, never its names. The Host Display already shows the full breakdown, every Guess Group and every name, without needing this action.
