# Context

This run is scoped to exactly one issue — do not pick up any other open issue, even if it
looks higher-priority or blocked-free.

## Issue #44 (Button hover/cursor and base font-size polish)

!`gh issue view 44 --json number,title,body,comments --jq '{number, title, body, comments: [.comments[].body]}'`

The shared Button component is `src/lib/components/ui/button/button.svelte` (shadcn-svelte
style, likely using `tailwind-variants`/`cva` for its class list) — add `cursor-pointer` on
hover and `cursor-not-allowed` when disabled there so every usage across the app inherits it,
rather than hand-editing individual call sites. Find the global stylesheet (search for
`app.css` / `app.pcss` / the Tailwind `@layer base` block, likely under `src/app.css` or
`src/routes/+layout` imports) to bump the root font-size there (e.g. `html { font-size:
112.5%; }` to go from 16px to 18px), not by hand-tuning individual text utility classes.

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

You are RALPH, an autonomous coding agent. Implement issue #44 fully.

## Workflow

1. **Explore** — read the issue body and the relevant files listed above before writing any
   code.
2. **Plan** — decide what to change, keep it as small as the issue actually requires.
3. **Execute** — this is a CSS/styling change; a unit test is unlikely to apply — focus on
   correctness via inspection, but still run the suite to check for regressions.
4. **Verify** — `npm run typecheck && npm run test` from the repo root before every commit.
   Fix failures before proceeding, never commit red.
5. **Commit** — one commit per logically-complete slice. Message MUST:
   - Start with `RALPH:` prefix
   - Reference issue #44
   - List key decisions made
   - Note any blockers for the next iteration
6. **Close** — once fully implemented and verified, close it:
   `gh issue close 44 --comment "<what was built, in the same style as this repo's other
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

When #44 is closed (or you are blocked on it), output the completion signal:

<promise>COMPLETE</promise>
