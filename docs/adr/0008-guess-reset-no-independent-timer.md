# Guess Reset rides the Round's one shared clock, never its own timer

**Status**: accepted

[#90](https://github.com/GuessTheMoveLive/app.guessthemove.live/issues/90) gives the Host a per-Participant Guess Reset: clearing one mistaken Guess back to not-submitted so that Participant can resubmit. The obvious-looking alternative was a per-participant correction timer — e.g. "give this one Participant 30 more seconds to resubmit" — scoped to just the reset Participant rather than the whole room. We rejected it: the Round already has exactly one shared clock (the Durable Object's `ctx.storage` alarm, scheduled by `scheduleRoundTimeout`/`adjust_round`), and a second, per-participant clock would mean two sources of truth for "when does this Round actually end" — one of which only exists for whichever Participants happen to have been reset. Guess Reset instead only ever flips that one Participant's `round-machine.ts` state back to `{ status: 'pending' }`; it is guarded to the `active` state and neither reads nor writes the shared alarm. If the Host judges the reset Participant (or the room) needs more time, they reach for the existing `adjust_round` (+30s/-30s) control separately, in whichever order relative to the reset they like, since the two touch entirely disjoint pieces of context.

## Considered Options

- **Per-participant correction timer**: a second alarm (or in-memory deadline) scoped to one Participant, extending only their own window to resubmit past the Round's otherwise-shared deadline. Gives the Host a more surgical tool, but doubles the amount of time-tracking state per Round, raises the question of what happens if that Participant's extension outlives the Round closing for everyone else (a second Reveal-readiness condition to reconcile), and was never asked for in grilling beyond "could this be nice to have."
- **Shared clock only** (chosen): Guess Reset clears the Guess; the Host's existing Round-clock controls are the only lever for more time, for everyone. A Participant who doesn't resubmit before the shared deadline falls through to the ordinary timeout path and scores the standard -3 — the same outcome as if they'd never been reset at all.

## Consequences

Guess Reset can never become a way to dodge the Round's deadline — there is no state that survives past it. It also means a reset is not "free" lenience if the deadline is imminent: the Host must explicitly extend the clock (for the whole room) if they want to buy the corrected Participant more time, same as they would for anyone else. A future per-participant timer, if ever wanted, is a separate and materially larger change (introducing a second kind of deadline the Round-close logic would need to account for), not an incremental extension of this feature.
