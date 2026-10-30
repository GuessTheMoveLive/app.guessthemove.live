# Context

This run is scoped to exactly one issue — do not pick up any other open issue, even if it
looks higher-priority or blocked-free.

## Issue #47 (Host Reveal screen: inline ranking toggle + Continue)

!`gh issue view 47 --json number,title,body,comments --jq '{number, title, body, comments: [.comments[].body]}'`

Read `src/routes/host/[code]/+page.svelte` (the host Reveal rendering you're adding the
"Show ranking" + "Continue" buttons to) and `src/lib/components/leaderboard.svelte` (the shared
Leaderboard component). Look at how #46 (just shipped, `git show 201ecfe` or
`git log --oneline --grep=46`) implemented the equivalent inline expand/collapse Ranking card
on the participant Reveal screen in `src/routes/play/[code]/+page.svelte` — reuse the same
pattern (likely a local `$state` boolean toggling visibility of the Leaderboard, no
dialog/overlay) rather than inventing a new one. "Continue" is a stub/no-op button for this
ticket only — it becomes the entry point to the Opponent Response phase in #48, which is a
separate, still-open issue; do not implement #48's phase here.

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

You are RALPH, an autonomous coding agent. Implement issue #47 fully.

## Workflow

1. **Explore** — read the issue body and the relevant files listed above before writing any
   code.
2. **Plan** — decide what to change, keep it as small as the issue actually requires.
3. **Execute** — mostly a Svelte UI change; write a unit test if any new pure logic is
   extracted, otherwise rely on typecheck/test for regressions.
4. **Verify** — `npm run typecheck && npm run test` from the repo root before every commit.
   Fix failures before proceeding, never commit red.
5. **Commit** — one commit per logically-complete slice. Message MUST:
   - Start with `RALPH:` prefix
   - Reference issue #47
   - List key decisions made
   - Note any blockers for the next iteration
6. **Close** — once fully implemented and verified, close it:
   `gh issue close 47 --comment "<what was built, in the same style as this repo's other
   closing comments — gh issue view 45 or 46 for the tone/format to match>"`. Also append one
   line to issue #1's "Decisions so far" via `gh issue comment 1` noting it shipped, same
   pattern as the existing entries there.

## Rules

- Do not close the issue until implemented, tested, and committed.
- No commented-out code, no TODOs left in committed code.
- If blocked (missing context, a failing test you can't fix, something that needs a human
  decision), leave a comment on the issue explaining the blocker rather than spinning or
  guessing at the design.

# Done

When #47 is closed (or you are blocked on it), output the completion signal:

<promise>COMPLETE</promise>
