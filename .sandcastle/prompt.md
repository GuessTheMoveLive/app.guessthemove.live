# Context

This run is scoped to exactly one issue — do not pick up any other open issue, even if it
looks higher-priority or blocked-free.

## Issue #50 (Finished phase: full-screen Podium + rankings)

!`gh issue view 50 --json number,title,body,comments --jq '{number, title, body, comments: [.comments[].body]}'`

This adds the final, terminal round-machine phase, reached from the final round's
`opponentResponse` phase (shipped in #48/#49, see
`git log --oneline --grep="(#48)\|(#49)"`) via the host's "Finish" button (already present and
currently a no-op/stub on the final round per #49 — see `src/lib/round/game-data.ts` for
however `isFinalRound` or equivalent is already determined).

Read first: `src/lib/components/podium.svelte` (an existing Podium component — reuse it, don't
rebuild it; check its props/expected data shape), `src/lib/round/round-machine.ts` (the
existing phase chain `lobby -> active -> closed -> reveal -> opponentResponse`; you're adding
a new terminal `finished` state reached from `opponentResponse`), `src/lib/server/session-room.ts`
(how #48 wired the `opponentResponse` phase's server-driven broadcast — follow the exact same
pattern for `finished`), `src/lib/round/session-client.svelte.ts` (client wrapper, follow the
`opponentResponse` client wiring added in #48), and `src/routes/host/[code]/+page.svelte` /
`src/routes/play/[code]/+page.svelte` (where the "Finish" button currently no-ops and where you
add the full-screen Finished rendering). Also check `src/lib/host/host-view.ts` and
`src/lib/components/leaderboard.svelte` for how participant totals/rankings and display names
(captured at join) are already computed — reuse that logic for the point-gap and "full ranking"
logic rather than recomputing scores from scratch.

Three distinct renderings to get right, per the issue:
- Participant in 1st (solo): "You're in the lead!"
- Participant in 1st (tied with at least one other participant): "You're tied for the lead!"
- Every other participant: "You are X points behind <name>" where X is the point gap to the
  next-highest participant immediately above them (not the leader), and `<name>` is that
  participant's display name.
- Host: Podium + full ranking list of all participants, no personal message (host has no
  score).

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

You are RALPH, an autonomous coding agent. Implement issue #50 fully.

## Workflow

1. **Explore** — read the issue body and all files listed above before writing any code. This
   phase transition must be server-driven and broadcast like existing ones.
2. **Plan** — decide what to change, keep it as small as the issue actually requires.
3. **Execute** — RGR: write a failing test first where the change is unit-testable (the
   "points behind next-highest, tie/lead detection" pure function, the round machine's new
   state/transitions, the Durable Object's new message handling), then implement the Svelte UI.
4. **Verify** — `npm run typecheck && npm run test` from the repo root before every commit.
   Fix failures before proceeding, never commit red.
5. **Commit** — one commit per logically-complete slice. Message MUST:
   - Start with `RALPH:` prefix
   - Reference issue #50
   - List key decisions made
   - Note any blockers for the next iteration
6. **Close** — once fully implemented and verified, close it:
   `gh issue close 50 --comment "<what was built, in the same style as this repo's other
   closing comments — gh issue view 48 or 49 for the tone/format to match>"`. Also append one
   line to issue #1's "Decisions so far" via `gh issue comment 1` noting it shipped, same
   pattern as the existing entries there.

## Rules

- Do not close the issue until implemented, tested, and committed.
- No commented-out code, no TODOs left in committed code.
- If blocked (missing context, a failing test you can't fix, something that needs a human
  decision), leave a comment on the issue explaining the blocker rather than spinning or
  guessing at the design.

# Done

When #50 is closed (or you are blocked on it), output the completion signal:

<promise>COMPLETE</promise>
