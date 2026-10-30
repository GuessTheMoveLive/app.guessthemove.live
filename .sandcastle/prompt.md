# Context

This run is scoped to exactly one issue — do not pick up any other open issue, even if it
looks higher-priority or blocked-free.

## Issue #46 (Participant Reveal screen: three-card layout + bar chart labels)

!`gh issue view 46 --json number,title,body,comments --jq '{number, title, body, comments: [.comments[].body]}'`

Read `src/routes/play/[code]/+page.svelte` (the participant Reveal rendering you're
restructuring into three cards), `src/lib/components/leaderboard.svelte` (the shared
Leaderboard component — reuse it, don't duplicate it), and
`src/lib/components/guess-group-chart.svelte` (the shared bar chart, used by both host and
participant views — the label change here must not break the host's rendering of the same
component, see `src/routes/host/[code]/+page.svelte` for that usage). Check
`src/lib/components/ui/card` for the shadcn Card component to use for the three sections.
Check `src/lib/paraglide/messages` for how existing pluralized copy (e.g. elsewhere in the app)
is keyed, and add new message keys the same way for "N participant(s)" / "+N points" / "-N
points" rather than hardcoding English or hand-rolling pluralization.

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

You are RALPH, an autonomous coding agent. Implement issue #46 fully.

## Workflow

1. **Explore** — read the issue body and the relevant files listed above before writing any
   code.
2. **Plan** — decide what to change, keep it as small as the issue actually requires.
3. **Execute** — RGR: write a failing test first where the change is unit-testable (e.g. a
   pluralization/label-formatting helper), then implement the Svelte layout.
4. **Verify** — `npm run typecheck && npm run test` from the repo root before every commit.
   Fix failures before proceeding, never commit red.
5. **Commit** — one commit per logically-complete slice. Message MUST:
   - Start with `RALPH:` prefix
   - Reference issue #46
   - List key decisions made
   - Note any blockers for the next iteration
6. **Close** — once fully implemented and verified, close it:
   `gh issue close 46 --comment "<what was built, in the same style as this repo's other
   closing comments — gh issue view 42, 43, or 45 for the tone/format to match>"`. Also append
   one line to issue #1's "Decisions so far" via `gh issue comment 1` noting it shipped, same
   pattern as the existing entries there.

## Rules

- Do not close the issue until implemented, tested, and committed.
- No commented-out code, no TODOs left in committed code.
- If blocked (missing context, a failing test you can't fix, something that needs a human
  decision), leave a comment on the issue explaining the blocker rather than spinning or
  guessing at the design.

# Done

When #46 is closed (or you are blocked on it), output the completion signal:

<promise>COMPLETE</promise>
