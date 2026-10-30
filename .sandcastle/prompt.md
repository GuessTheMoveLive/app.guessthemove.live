# Context

This run is scoped to exactly one issue — do not pick up any other open issue, even if it
looks higher-priority or blocked-free.

## Issue #48 (Opponent Response phase)

!`gh issue view 48 --json number,title,body,comments --jq '{number, title, body, comments: [.comments[].body]}'`

This is a server-driven phase-transition change, the biggest of this chain so far. Read these
first:

- `src/lib/round/round-machine.ts` — the per-round XState machine (`lobby` -> `active` ->
  `closed` -> `reveal`, terminal today). You are almost certainly adding a new terminal-replacing
  state here (e.g. `opponentResponse`) reached from `reveal`, plus the events/actions for
  "Back" (-> `reveal`) and "Next round" (-> advances to the *next round's* `active`, which is
  owned one level up — see below).
- `src/lib/server/session-room.ts` — the Durable Object that owns round-to-round progression
  (which round is current, broadcasting state to all connected sockets) and already sends
  `{ type: 'REVEAL' }` into the round actor (around line 155). This is where you'll likely add
  the new message handler(s) for the host's "Continue"/"Back"/"Next round" actions and the
  server-driven broadcast, following the exact same pattern used for existing phase
  transitions (lobby/active/closed/reveal) — do not let any client decide this phase
  independently.
- `src/lib/round/session-client.svelte.ts` — the client-side state/actions wrapper; add
  whatever's needed here for the new phase, following existing patterns (e.g. how `REVEAL` or
  the #45 auto-delivery is surfaced to the client today).
- `src/routes/host/[code]/+page.svelte` — the "Continue" button added in #47 is currently a
  stub/no-op; wire it to actually trigger this new phase.
- `src/routes/play/[code]/+page.svelte` — participants need the same new screen rendered, with
  inert/no controls.
- Whatever module currently formats a single move in correct numbered notation (see #43's
  `formatNumberedMove` in `src/lib/round/participant-input.ts`) — reuse it for "show the single
  next move in the game large on screen", don't reimplement move-number formatting.
- `src/lib/server/session-room.spec.ts` and `src/lib/round/round-machine` specs for the existing
  test patterns around phase transitions — follow them for the new phase's tests.

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

You are RALPH, an autonomous coding agent. Implement issue #48 fully.

## Workflow

1. **Explore** — read the issue body and all files listed above before writing any code. This
   phase transition must be server-driven and broadcast like existing ones — understand exactly
   how `lobby`/`active`/`closed`/`reveal` already propagate from the Durable Object to every
   connected socket before adding a new one.
2. **Plan** — decide what to change, keep it as small as the issue actually requires.
3. **Execute** — RGR: write a failing test first where the change is unit-testable (the round
   machine's new state/transitions, the Durable Object's new message handling), then implement
   the Svelte UI.
4. **Verify** — `npm run typecheck && npm run test` from the repo root before every commit.
   Fix failures before proceeding, never commit red.
5. **Commit** — one commit per logically-complete slice (e.g. round-machine state first, then
   server wiring, then UI). Message MUST:
   - Start with `RALPH:` prefix
   - Reference issue #48
   - List key decisions made
   - Note any blockers for the next iteration
6. **Close** — once fully implemented and verified, close it:
   `gh issue close 48 --comment "<what was built, in the same style as this repo's other
   closing comments — gh issue view 46 or 47 for the tone/format to match>"`. Also append one
   line to issue #1's "Decisions so far" via `gh issue comment 1` noting it shipped, same
   pattern as the existing entries there.

## Rules

- Do not close the issue until implemented, tested, and committed.
- No commented-out code, no TODOs left in committed code.
- If blocked (missing context, a failing test you can't fix, something that needs a human
  decision), leave a comment on the issue explaining the blocker rather than spinning or
  guessing at the design.

# Done

When #48 is closed (or you are blocked on it), output the completion signal:

<promise>COMPLETE</promise>
