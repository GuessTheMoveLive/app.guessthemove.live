# Guess the Move — map

## Destination

A product/technical spec for a single-event, live "guess-the-move" chess trainer in a Kahoot-style multiplayer format: Participants guess a Featured Game's moves from their phones, scored for accuracy and depth of thought rather than speed, while a Host runs a shared beamer display and a Leaderboard updates after each Reveal. The spec should be complete enough to hand off to implementation planning as its own effort.

## Notes

- Domain vocabulary lives in [CONTEXT.md](../../CONTEXT.md) — read it before working any ticket; update it inline if a ticket sharpens or renames a term.
- Settled scope parameters (framing decisions made while naming the destination, not separately ticketed): single livestreamed event, no accounts or persistence across Sessions; cloud-hosted; Participant client is a mobile web PWA (no native app); target scale is small, up to ~30 concurrent Participants.
- For a `grilling` ticket, call the Skill tool for both `grilling` and `domain-modeling`. For `research`, call `research`. For `prototype`, call `prototype`.
- Explicitly out of scope: the "train an opening against a human-like computer" mode (see below) — don't let it bleed back into tickets on this map.

## Decisions so far

- [Move equivalence & scoring bands](issues/01-move-equivalence-scoring-bands.md): win-probability, not centipawns — a Guess is scored by win-probability lost vs the move played, mapped to the +3..-3 scale.
- [Engine execution architecture](issues/02-engine-execution-architecture.md): cloud-hosted, internet-facing; engine evaluation happens live, on-demand, server-side, once per submitted move.
- [Analysis Tree design](issues/03-analysis-tree-design.md): unbounded-depth tree off the Guess, Anticipated Reply / Wildcard Reply (`*`) branches, per-leaf Assessment Symbol; scored via engine-checked Soundness Bonus (nodes) and graduated Assessment Bonus (leaves).
- [Move & tree input mechanics](issues/04-move-tree-input-mechanics.md): tap origin/destination square for a Guess and for extending the Analysis Tree; Guess locks on entry, tree keeps growing until Reveal.
- [Round visibility & pacing](issues/05-round-visibility-pacing.md): everything hidden (from other Participants and the Host Display) until Reveal; Host-paced manual Reveal/advance, no timers.
- [Leaderboard model](issues/06-leaderboard-model.md): running Round Score total per Participant plus a Momentum Highlight (biggest gainer of the Round just revealed).
- [Session join mechanic](issues/07-session-join-mechanic.md): Room Code + URL/QR shown on the Host Display, no accounts.
- [Game curation & plenum flow](issues/08-game-curation-plenum-flow.md): live Plenum Selection Phase (Host enters moves as the room verbally agrees, no Participant device involvement) → search Candidate Games by criteria → Host picks one meeting a minimum Accuracy Score as the Featured Game; whole game, every move by the Featured Side.
- [Host dual role & display parity](issues/09-host-dual-role-display-parity.md): Host Display is control-only, never a Participant; the Host-person may separately join as an ordinary Participant on their own phone; the Host Display must never show more than a Participant sees.
- [Chess engine choice & hosting](issues/17-chess-engine-choice-hosting.md): self-host the native Stockfish binary as a spawned UCI process on a single small cloud instance (scale-to-zero between events) — WASM builds and managed analysis APIs (e.g. Lichess cloud-eval, which is a read-only cache that 404s on uncached positions) were both ruled out.
- [Win-probability model & band cutpoints](issues/11-win-probability-model-research.md): use Lichess's own formula, `winProb(cp) = 100 / (1 + exp(-0.00368208 * cp))` (cp clamped to ±1000; verified straight from `lichess-org/scalachess` source), and their real inaccuracy/mistake/blunder cutpoints of 5/10/15 percentage points of win-probability lost (not the commonly-misquoted 10/20/30). Mate scores collapse to a flat ±1000cp ceiling — noted as an inconsistency in Lichess's own code, not something to blindly copy. Chess.com's formula is confirmed non-public.
- [Games database/API research](issues/10-games-database-api-research.md): use Lichess's Masters DB Opening Explorer for live reached-position search (fast enough, `fen`/`since`/`until` lookups). Neither it nor anything else surveyed supports tournament-tier or gender filtering server-side, or gives ready-made per-move evals for arbitrary games — see the new [Tournament-tier & gender metadata enrichment](issues/18-tier-gender-enrichment.md) ticket and the Accuracy Score ticket's added latency concern.
- [Accuracy Score metric & threshold](issues/12-accuracy-score-metric-threshold.md): Featured-Side-only average per-move win-probability loss from the reached position to the game's end, gated at < 5pp average and < 15pp worst move (reusing the inaccuracy/blunder cutpoints); scored lazily per-candidate on Host selection with a lighter ~100ms/position budget, not all 15 candidates up front.
- [Round Score composition](issues/13-round-score-composition.md): Round Score = Guess Score + min(3, Soundness + Assessment Bonuses), a shared +3 tree cap; Soundness is flat +0.5/node (not the Guess root, not Wildcards), Assessment is +0.5/+0.25/0 across three tiers; all additive-only floored at 0, no sign floor — a strong tree can carry a negative Guess to net positive.

## Not yet specified

- Real-time transport and backend tech stack for pushing Round state to ~30 phones and the Host Display with low latency (websockets vs alternatives, specific framework) — not yet sharp enough to ticket until the engine-hosting and games-database research land.
- Reconnection/disconnection handling for a Participant's phone mid-Round or mid-Session.
- Anti-cheat/trust model beyond hidden-until-Reveal — e.g. a Participant consulting their own engine on a second device. May end up as an accepted limitation rather than a solved problem, but worth a deliberate line in the spec either way.
- Cost/ops model for running a Session — who provisions/pays for cloud hosting and engine compute, how a Host actually stands up a new Session.
- Accessibility/venue considerations for the Host Display at beamer distance (text sizing, colorblind-safe treatment of Assessment Symbols and Leaderboard deltas).

## Out of scope

- "Train an opening against a human-like computer" mode (a decisive-result training format against a non-optimal, human-like move generator, with no fixed source game): ruled out while naming the destination — different enough in requirements (no Featured Game, needs a human-like move generator and decisive-result detection) to warrant its own future effort rather than folding into this spec.
