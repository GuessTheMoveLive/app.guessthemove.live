# Gate the Guess Group breakdown behind Room Statistics

**Status**: accepted (supersedes the Guess Group breakdown half of [0003](./0003-merge-feedback-into-reveal.md))

0003 made the Guess Group breakdown automatic at Reveal, retiring the old "Share Guess Groups" host button, because in practice the Host always clicked it anyway — it was a redundant extra step, not a real choice point. We're reintroducing that gate under a new name, **Room Statistics**, for a different reason: live-testing showed Participants reading the room-wide breakdown chart at the same time as their own Round's score/match/Variant explanation, competing for attention on a small screen right when they most want to focus on their own move. Room Statistics is a Host-broadcast toggle (same shape as the Leaderboard's "Show leaderboard" toggle) that reveals the Guess Group breakdown card for the whole room at once, once the Host judges the room is ready to move past personal feedback. The automatic, per-Participant part of Reveal — Round Score, actual-move match, Variant explanation — is unaffected and still requires no Host action.

## Consequences

The Host now has a second optional per-Round click (after the already-optional Leaderboard toggle) if they want the room to see aggregate stats; skipping it does not block anyone's personal feedback, which still arrives automatically. A Host running a fast-paced session can ignore Room Statistics entirely, same as they already could with the Leaderboard toggle.
