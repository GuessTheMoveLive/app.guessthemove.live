# Context

This run is scoped to exactly one issue — do not pick up any other open issue, even if it
looks higher-priority or blocked-free.

## Issue #49 (Final round shows the full remaining game)

!`gh issue view 49 --json number,title,body,comments --jq '{number, title, body, comments: [.comments[].body]}'`

This extends the Opponent Response phase just shipped in #48
(`git log --oneline --grep="(#48)"` / `git show 5e8e1f2` for the commit). Read
`src/lib/round/game-data.ts` (`quizSteps`, `getAnswerKeyStep`, and whatever represents the full
game's real mainline/moves — you need the actual end of the game here, not just the next ply)
and wherever #48 added the "single next move" derivation — likely in
`src/routes/host/[code]/+page.svelte` and `src/routes/play/[code]/+page.svelte` (search for the
opponent-move `$derived` added in that commit) and/or `src/lib/round/round-machine.ts` /
`src/lib/server/session-room.ts` if the move was computed server-side. Reuse
`formatNumberedMove` / `formatContinuation` (from #43, in `src/lib/round/participant-input.ts`)
for rendering a full move sequence instead of a single move — `formatContinuation` may already
do exactly this. Determine "final round" generically from the quiz data (e.g. comparing the
current round's quiz-step index to `quizSteps().length`), not by hardcoding a round number.

# Shared ground rules

- Read `GLOSSARY.md` and issue #1 (`gh issue view 1`) first for full product/domain context if
  anything above is unclear — don't guess at terminology.
- Do **not** touch anything related to Analysis Tree, Plenum Selection Phase, or issues #15,
  #17, #19, #20, #28 — explicitly out of scope, deferred past v1.
- Run `npm run typecheck` and `npm run test` from the repo root after each piece and keep both
  green before committing.

# Recent RALPH commits (last 10)

!`git log --oneline --grep="RALPH" -10`

# Task

You are RALPH, an autonomous coding agent. Implement issue #49 fully.

## Workflow

1. **Explore** — read the issue body and the #48 implementation listed above before writing any
   code.
2. **Plan** — decide what to change, keep it as small as the issue actually requires.
3. **Execute** — RGR: write a failing test first where the change is unit-testable (the
   "compute remaining mainline for final round" pure function), then wire it into the UI.
4. **Verify** — `npm run typecheck && npm run test` from the repo root before every commit.
   Fix failures before proceeding, never commit red.
5. **Commit** — one commit per logically-complete slice. Message MUST:
   - Start with `RALPH:` prefix
   - Reference issue #49
   - List key decisions made
   - Note any blockers for the next iteration
6. **Close** — once fully implemented and verified, close it:
   `gh issue close 49 --comment "<what was built, in the same style as this repo's other
   closing comments — gh issue view 47 or 48 for the tone/format to match>"`. Also append one
   line to issue #1's "Decisions so far" via `gh issue comment 1` noting it shipped, same
   pattern as the existing entries there.

## Rules

- Do not close the issue until implemented, tested, and committed.
- No commented-out code, no TODOs left in committed code.
- If blocked (missing context, a failing test you can't fix, something that needs a human
  decision), leave a comment on the issue explaining the blocker rather than spinning or
  guessing at the design.

# Done

When #49 is closed (or you are blocked on it), output the completion signal:

<promise>COMPLETE</promise>
