# Fix piece-glyph color without implementing the chessground board

**Status**: accepted

A post-session bug report found every rendered move glyph (Game Sheet, Score Sheet, Reveal feedback, Guess Group breakdown, Host answer-key breakdown) was wrong half the time: `sanToGlyph` in `participant-input.ts` maps piece letters to a single hardcoded Unicode set (`♚♛♜♝♞♟`, the conventionally-black glyphs) regardless of which side actually made the move, so White's moves render with black-looking pieces too.

[0002](./0002-chessground-for-reveal-board.md) separately accepted rendering an actual visual chess board (via `@lichess-org/chessground`) at Reveal, but — per `docs/feature-catalog.md`'s "Named But Not Yet Built" — that was never implemented; Reveal still shows text/notation only, and `chessground` isn't even in `package.json`.

We fixed the glyph-color bug on its own, without implementing 0002: every call site of `sanToGlyph` already has the mover's color available (`step.color`, or derivable from `ply` via the existing `isWhitePly()` helper), so the fix is a same-shaped function taking a color and picking between a white-glyph and black-glyph Unicode set — no new dependency, no board renderer.

## Considered Options

- **Implement 0002's chessground board now, as the fix**: would fix piece color as a side effect of rendering a real board, but turns a small, isolated bug fix into a much larger feature (new dependency, new component, new layout decisions on both Host and Participant Reveal screens) that was never requested as part of this fix.
- **Minimal glyph-color fix (chosen)**: fixes exactly the reported bug, using color data every call site already has, with no new dependency.

## Consequences

The bug is fixed everywhere `sanToGlyph` is used. 0002's chessground-rendered Reveal board remains a separate, still-open, still-unimplemented decision — this ADR does not supersede or resolve it, and a future reader should not infer from this fix that 0002 was acted on.
