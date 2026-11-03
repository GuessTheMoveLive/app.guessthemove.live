# Context

This run works through the repo's `ready-for-agent` backlog, one issue per iteration, lowest
issue number first. Issue numbers happen to already be in dependency order for the current
backlog (#51 is an explicit prefactor for #53/#54/#58; #52 feeds #58; #57 is referenced by the
Final-Results gating in #59/#60; #59's PGN-writing utility is reused by #60) — but always
re-derive the target from the live label state below rather than assuming a fixed list, since
issues get closed as the run progresses.

## This iteration's target issue

!`N=$(gh issue list --label ready-for-agent --state open --json number --jq 'sort_by(.number) | .[0].number'); if [ -z "$N" ] || [ "$N" = "null" ]; then echo "NO_OPEN_READY_FOR_AGENT_ISSUES"; else gh issue view "$N" --json number,title,body,comments --jq '{number, title, body, comments: [.comments[].body]}'; fi`

Work on exactly this one issue this iteration, even if another open issue looks higher-priority
or easier. If the command above printed `NO_OPEN_READY_FOR_AGENT_ISSUES`, the backlog is empty —
do nothing and skip straight to the Done section below.

# Shared ground rules

- Read `GLOSSARY.md` and issue #1 (`gh issue view 1`) first for full product/domain context if
  anything in the issue is unclear — don't guess at terminology.
- Do **not** touch anything related to Analysis Tree, Plenum Selection Phase, or issues #15,
  #17, #19, #20, #28 — explicitly out of scope, deferred past v1.
- Before implementing, check `git log --oneline --grep="RALPH"` (below) for whether issues this
  one depends on have already shipped. If a stated prerequisite hasn't landed yet, don't block
  indefinitely — note the gap in your closing comment and implement as defensively as the issue
  allows, or flag it as a blocker (see Rules) if it's genuinely not implementable without it.
- Run `npm run lint`, `npm run typecheck`, and `npm run test` from the repo root after each piece
  and keep all three green before committing.
- Playwright's Chromium browser and its system libraries are baked into this sandbox's image
  already (`npx playwright install chromium` is a no-op here) — for UI-affecting changes, drive
  the real app with it directly rather than reaching for an SSR-render or raw-WebSocket
  workaround.

# Recent RALPH commits (last 15)

!`git log --oneline --grep="RALPH" -15`

# Task

You are RALPH, an autonomous coding agent. Implement the issue picked above fully.

## Workflow

1. **Explore** — read the issue body and comments above in full. Find and read the relevant
   source files yourself (grep for the feature/component names mentioned in the issue, follow
   imports) rather than guessing. Check `src/lib/components/`, `src/lib/round/`,
   `src/lib/server/`, `src/lib/host/`, and the relevant `src/routes/host|play/[code]/+page.svelte`
   as starting points — most features in this codebase touch a Svelte component, the round
   machine or session-room server logic, and the host/participant pages.
2. **Plan** — decide what to change, keep it as small as the issue actually requires.
3. **Execute** — RGR: write a failing test first where the change is unit-testable (pure
   helpers, round-machine transitions, Durable Object message handling), then implement the
   Svelte UI.
4. **Verify** — `npm run lint && npm run typecheck && npm run test` from the repo root before
   every commit. Fix
   failures before proceeding, never commit red.
5. **Commit** — one commit per logically-complete slice. Message MUST:
   - Start with `RALPH:` prefix
   - Reference the issue number
   - List key decisions made
   - Note any blockers for the next iteration
6. **Close** — once fully implemented and verified, close it:
   `gh issue close <N> --comment "<what was built, in the same style as this repo's other
closing comments — gh issue view 48, 49, or 50 for the tone/format to match>"`. Also append
   one line to issue #1's "Decisions so far" via `gh issue comment 1`, same pattern as the
   existing entries there.

## Rules

- Do not close the issue until implemented, tested, and committed.
- No commented-out code, no TODOs left in committed code.
- If genuinely blocked (missing context, a failing test you can't fix, something that needs a
  human decision): leave a comment on the issue explaining the blocker, then
  `gh issue edit <N> --remove-label ready-for-agent` so the next iteration skips it instead of
  retrying the same blocker — but leave the issue **open** (do not close a blocked issue).

# Done

`<promise>COMPLETE</promise>` stops the **entire multi-issue run**, not just this iteration — do
**not** emit it merely because you closed or blocked this iteration's issue. Once this
iteration's issue is closed (or blocked and unlabeled), just end your turn normally; the
orchestrator will start a fresh iteration for the next backlog issue on its own.

Only emit the completion signal in the one case where there is truly nothing left for the next
iteration to pick up — i.e. this iteration's target-issue command above printed
`NO_OPEN_READY_FOR_AGENT_ISSUES`:

<promise>COMPLETE</promise>
