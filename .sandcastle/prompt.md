# Context

This run is scoped to exactly two issues — do not pick up any other open issue, even
if it looks higher-priority or blocked-free. A separate human-directed session is
handling everything else on the v1 map; working outside this list causes conflicts.

## Issue #36 (Feedback phase)

!`gh issue view 36 --json number,title,body,comments --jq '{number, title, body, comments: [.comments[].body]}'`

Groundwork already landed on this branch (commit 48e04b4): `scripts/build-game-data.mjs`'s
`parseAlternative()` now captures each alternative's full precomputed continuation instead of
discarding it, `AnswerKeyAlternative` (in `src/lib/round/scoring.ts`) carries it as
`continuation: string[]`, and `src/lib/round/feedback.ts` + its spec derive a Participant's
Feedback tier and Variant from their stored guess. Read that file first — it's already tested and
should not be redone. What's still missing, per the issue's Resolution comment:

- A `give_feedback` (or similarly named) message in `src/lib/server/session-room.ts`'s
  `webSocketMessage`, Host-only (same tag check pattern as `kick`/`reset`): for every Participant
  in the current Round's `participants`, compute their `ParticipantFeedback` via
  `buildParticipantFeedback` and send it as a **targeted message to that Participant's own
  socket(s)** (`this.ctx.getWebSockets(participantId)`) — not a broadcast. Pick a client message
  shape distinct from the existing broadcast `RoundSnapshot` (e.g. `{ type: 'feedback', feedback:
  ParticipantFeedback }`) so `SessionClient`/the Participant screen can tell it apart from a
  snapshot update.
- `src/lib/round/session-client.svelte.ts`: a `giveFeedback()` sender (Host) and a reactive
  `feedback` field populated when a `feedback`-typed message arrives (Participant).
- Host control screen (`src/routes/host/[code]/+page.svelte`): a second button next to "Next
  Round" on the Reveal screen — "Give Feedback" — calling `client.giveFeedback()`. They are
  alternatives, not sequential steps, per the issue.
- Participant screen (`src/routes/play/[code]/+page.svelte`): render the incoming Feedback
  (tier copy via `explanationText`, plus the Variant's continuation glyph-rendered the same way as
  the score sheet — reuse `sanToGlyph` from `participant-input.ts` — and its end evaluation) when
  present.
- Host also gets the full answer-key breakdown live, during the active Round, not just after
  Reveal (the issue's Resolution explains why: the Host already knows the game per the v1 scope
  decisions, and this gives them talking points). Render every alternative's tier/eval/variant
  somewhere on the Host control screen, visible during `active` and not gated behind any
  Participant action.

## Issue #41 (Internationalization)

!`gh issue view 41 --json number,title,body,comments --jq '{number, title, body, comments: [.comments[].body]}'`

Paraglide JS is already scaffolded in this repo (`project.inlang/`, `messages/*.json`,
`src/lib/paraglide/`, wired into `vite.config.ts`, `src/hooks.ts`,
`src/hooks.server.ts`, and `src/app.html`) but only carries a placeholder
`hello_world` message — no real UI strings have been extracted yet. Do not re-scaffold it.

- `project.inlang/settings.json` lists locales `["en", "de", "fr"]` — drop `"fr"`; only
  English and German ship for v1 (`baseLocale` stays `"en"`).
- Every user-facing string across both Host (`src/routes/host/[code]/+page.svelte`,
  `src/lib/host/host-view.ts`) and Participant (`src/routes/play/[code]/+page.svelte`,
  `src/lib/round/participant-input.ts`) screens, plus `src/routes/+page.svelte` (session
  create/join) and `src/lib/components/leaderboard.svelte` and
  `src/lib/components/score-sheet.svelte` (its "Tournament"/"Date"/"White"/"Black" labels —
  not the chess notation itself, which stays untranslated per the ticket). If issue #36 has landed
  by the time you reach this, its Feedback explanation copy (`explanationText` in
  `src/lib/round/feedback.ts`) needs message keys too; if it hasn't, translate what exists and
  leave a comment on #41 noting the Feedback copy still needs a pass once #36 ships.
  Semantic keys (e.g. `host.scoreboard.title`), not English-source-keyed.
- Add both `messages/en.json` and `messages/de.json` entries for every key (German translations
  are AI-produced — that's expected and accepted for v1, call it out in your closing comment
  rather than trying to get a native speaker's review you don't have access to).
- Add a manual locale switcher in the UI (browser-language auto-detect already happens via
  Paraglide's standard cookie/header detection once `hooks.server.ts`/`hooks.ts` are exercised —
  confirm it still does once you're using real messages, don't rebuild it) — a visible, simple
  toggle/select is enough, doesn't need to be fancy. Use `localizeHref`/`locales` from
  `#lib/paraglide/runtime.js`, the same module `src/routes/+layout.svelte` already imports.
- Chess move notation (SAN/glyphs) is never translated — don't touch `sanToGlyph` or move text.

# Shared ground rules for both issues

- Read `GLOSSARY.md` and issue #1 (`gh issue view 1`) first for full product/domain context if
  anything above is unclear — don't guess at terminology.
- Do **not** touch anything related to Analysis Tree, Plenum Selection Phase, or issues #15, #17,
  #19, #20, #28 — explicitly out of scope, deferred past v1.
- Already shipped on this branch and NOT your job: #37 (Session join/Host Token), #38
  (Reset/Delete), #40 (score-sheet layout) — commits 50cecb1, ebfd164. Don't redo or revert them.
- Run `npm run typecheck` and `npm run test` from the repo root after each piece and keep both
  green before committing.

# Recent RALPH commits (last 10)

!`git log --oneline --grep="RALPH" -10`

# Task

You are RALPH, an autonomous coding agent. Work through the two issues above, in order (#36
first, since #41 should translate its Feedback copy once it exists — but if #36 isn't fully done
by the time you'd naturally move on, don't block #41 on it; translate what's landed and note the
gap as described above).

## Workflow (per issue)

1. **Explore** — read the issue's Resolution comment and the relevant source files/tests before
   writing any code. The Resolution already answers every open design question; don't re-litigate
   it.
2. **Plan** — decide what to change, keep it as small as the issue actually requires.
3. **Execute** — RGR: write a failing test first where the change is unit-testable (pure
   functions, the Durable Object's message handling), then implement.
4. **Verify** — `npm run typecheck && npm run test` from the repo root before every commit. Fix
   failures before proceeding, never commit red.
5. **Commit** — one commit per logically-complete slice of an issue (not one giant commit per
   issue). Message MUST:
   - Start with `RALPH:` prefix
   - Reference the issue number
   - List key decisions made
   - Note any blockers for the next iteration
6. **Close** — once the issue is fully implemented and verified, close it:
   `gh issue close <ID> --comment "<what was built, in the same style as this repo's other
   closing comments — gh issue view 37 or 40 for the tone/format to match>"`. Also append one line
   to issue #1's "Decisions so far" via `gh issue comment 1` noting it shipped, same pattern as
   the existing entries there.

## Rules

- Work on one of the two issues per iteration; don't split attention across both in the same
  iteration unless finishing #36 naturally unblocks a small #41 piece.
- Do not close an issue until implemented, tested, and committed.
- No commented-out code, no TODOs left in committed code.
- If blocked (missing context, a failing test you can't fix, something that needs a human
  decision), leave a comment on the issue explaining the blocker and move to the other issue
  instead of spinning.

# Done

When both #36 and #41 are closed (or you are blocked on both), output the completion signal:

<promise>COMPLETE</promise>
