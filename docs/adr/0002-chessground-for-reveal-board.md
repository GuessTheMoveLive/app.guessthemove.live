# Use chessground to render the Reveal-phase board

**Status**: accepted

Neither the Host Display nor the Participant's Play page currently renders an actual chess position with pieces — the Play page's grid is a blank tap-target surface for submitting a Guess (by design, so the position stays hidden pre-Reveal), and both Reveal screens currently show only the Leaderboard. Showing the real board and the Featured Side's move at Reveal is new functionality, and we decided to render it with lichess's `@lichess-org/chessground` rather than building a bespoke renderer or adopting a less-adopted library. Usage is read-only: fed a FEN, configured `viewOnly` with no `movable`/premove setup, since Participants never input moves by dragging pieces on a visible board (per the existing tap-based Guess flow).

## Considered Options

- **cm-chessboard**: a reasonable alternative with a comparable API, but with meaningfully less adoption and production battle-testing than chessground.
- **chess.js**: not a candidate for rendering at all — it's a rules/move-generation engine, not a board UI. It stays in the repo for FEN parsing and move legality (`participant-input.ts`) and is complementary to, not competing with, chessground.
- **Bespoke SVG/DOM board renderer**: rejected — would duplicate rendering logic (piece placement, orientation, square coloring) that a well-tested library already solves, for a feature that's purely display, not interaction.

## Consequences

Only the Reveal-phase views (Host and Play, once a Round closes) get a chessground instance; the existing tap-to-guess grid in `participant-input.ts`/the Play page's active-Round view is untouched and stays a blank grid, since it must not reveal the position before Reveal.
