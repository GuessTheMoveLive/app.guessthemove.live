# Context

This run is scoped to exactly one issue — do not pick up any other open issue, even if it
looks higher-priority or blocked-free.

## Issue #43 (Correct, color-aware feedback phrasing with move numbers)

!`gh issue view 43 --json number,title,body,comments --jq '{number, title, body, comments: [.comments[].body]}'`

Read `src/lib/round/feedback.ts` and `src/lib/round/feedback.spec.ts` first — this is the
existing feedback-phrase logic you are replacing/extending. Also check
`src/routes/play/[code]/+page.svelte` for where the feedback text, "Your move" / "Played" /
"Continuation" strings are rendered, and how move numbers / SAN are currently formatted
elsewhere in the codebase (reuse existing move-number formatting helpers if any exist, don't
duplicate chess notation logic). Check `src/lib/paraglide/messages/en.d.ts` and the
`messages/*.json` sources for how existing copy is keyed for i18n — new strings need message
keys the same way, not hardcoded English.

The issue requires a deliverable Markdown table of all 98 phrases "for manual review" before
wiring in. Since this is an unattended autonomous run with no human available to review
mid-task, produce that table as a committed artifact (e.g. a doc under `docs/` or a code
comment/fixture referenced by the implementation) in its own commit, then proceed to wire it in
within the same run — do not block waiting for a review that cannot happen here.

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

You are RALPH, an autonomous coding agent. Implement issue #43 fully.

## Workflow

1. **Explore** — read the issue body, `GLOSSARY.md`, and the existing feedback implementation
   listed above before writing any code.
2. **Plan** — decide what to change, keep it as small as the issue actually requires.
3. **Execute** — RGR: write a failing test first where the change is unit-testable (pure
   functions), then implement.
4. **Verify** — `npm run typecheck && npm run test` from the repo root before every commit.
   Fix failures before proceeding, never commit red.
5. **Commit** — one commit per logically-complete slice (not one giant commit for the whole
   issue). Message MUST:
   - Start with `RALPH:` prefix
   - Reference issue #43
   - List key decisions made
   - Note any blockers for the next iteration
6. **Close** — once fully implemented and verified, close it:
   `gh issue close 43 --comment "<what was built, in the same style as this repo's other
   closing comments — gh issue view 36 or 40 for the tone/format to match>"`. Also append one
   line to issue #1's "Decisions so far" via `gh issue comment 1` noting it shipped, same
   pattern as the existing entries there.

## Rules

- Do not close the issue until implemented, tested, and committed.
- No commented-out code, no TODOs left in committed code.
- If blocked (missing context, a failing test you can't fix, something that needs a human
  decision), leave a comment on the issue explaining the blocker rather than spinning or
  guessing at the design.

# Done

When #43 is closed (or you are blocked on it), output the completion signal:

<promise>COMPLETE</promise>
