# Context

This run is scoped to exactly one issue — do not pick up any other open issue, even if it
looks higher-priority or blocked-free.

## Issue #45 (Guess Groups shown automatically at Reveal)

!`gh issue view 45 --json number,title,body,comments --jq '{number, title, body, comments: [.comments[].body]}'`

This retires the manual "Share Guess Groups" host action added in #42. Read these files first
— they implement the current manual-trigger version you are making automatic:
`src/lib/server/session-room.ts` (the `share_guess_groups` message handler and broadcast
logic), `src/lib/round/session-client.svelte.ts` (the client-side trigger/state), the
"Share Guess Groups" button in `src/routes/host/[code]/+page.svelte`, and
`src/lib/round/guess-groups.ts` (the pure breakdown functions, unchanged by this issue). Also
check `src/lib/server/session-room.spec.ts` for existing coverage of the manual flow that will
need to change.

The redaction rules (own group shows names, every other group shows only a count) stay exactly
as they are — only the *trigger* changes, from a host button click to automatic delivery the
moment the round enters Reveal (alongside whatever already happens automatically at Reveal per
#42, e.g. personal feedback).

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

You are RALPH, an autonomous coding agent. Implement issue #45 fully.

## Workflow

1. **Explore** — read the issue body and the existing manual-trigger implementation listed
   above before writing any code.
2. **Plan** — decide what to change, keep it as small as the issue actually requires.
3. **Execute** — RGR: write a failing test first where the change is unit-testable (the Durable
   Object's phase-transition/broadcast logic), then implement.
4. **Verify** — `npm run typecheck && npm run test` from the repo root before every commit.
   Fix failures before proceeding, never commit red.
5. **Commit** — one commit per logically-complete slice. Message MUST:
   - Start with `RALPH:` prefix
   - Reference issue #45
   - List key decisions made
   - Note any blockers for the next iteration
6. **Close** — once fully implemented and verified, close it:
   `gh issue close 45 --comment "<what was built, in the same style as this repo's other
   closing comments — gh issue view 42 or 43 for the tone/format to match>"`. Also append one
   line to issue #1's "Decisions so far" via `gh issue comment 1` noting it shipped, same
   pattern as the existing entries there.

## Rules

- Do not close the issue until implemented, tested, and committed.
- No commented-out code, no TODOs left in committed code.
- If blocked (missing context, a failing test you can't fix, something that needs a human
  decision), leave a comment on the issue explaining the blocker rather than spinning or
  guessing at the design.

# Done

When #45 is closed (or you are blocked on it), output the completion signal:

<promise>COMPLETE</promise>
