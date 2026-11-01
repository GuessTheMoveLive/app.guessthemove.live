# Coding standards

Read during review, not implementation. These are judgement calls no linter or
type check can substitute for — keep this list flat and short.

- **Docstrings name actual callers, not aspirational ones.** A comment like
  "also used by X and Y" is a claim — verify it (grep for the callers) before
  trusting or writing it. A caller that gets refactored away leaves a stale
  claim behind; catch it in review.
- **Don't recompute a value another function in the same call chain already
  computed.** If function A calls function B, and B's result (or an
  intermediate it derived) would let A skip redoing B's work, thread it
  through — a parameter, a returned intermediate, a shared helper both call —
  rather than each calling the same underlying computation independently.
