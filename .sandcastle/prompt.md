# Context

This run is scoped to exactly one issue — do not pick up any other open issue, even if it
looks higher-priority or blocked-free.

## Issue #42 (Guess Group breakdown at Reveal; retire Feedback as a separate phase)

!`gh issue view 42 --json number,title,body,comments --jq '{number, title, body, comments: [.comments[].body]}'`

The design question is already resolved — see the Resolution comment above, and read
`GLOSSARY.md` (Guess Group, Share Guess Groups, the updated Reveal/Variant entries) and
`docs/adr/0003-merge-feedback-into-reveal.md` before writing any code. Don't re-litigate the
design; implement it.

This supersedes issue #36's Feedback phase. The existing Feedback implementation
(`src/lib/round/feedback.ts`, the `give_feedback` message in
`src/lib/server/session-room.ts`, `session-client.svelte.ts`'s `giveFeedback()`/`feedback`
field, and the "Give Feedback" button on the Host Reveal screen) is the thing being replaced,
not duplicated — read it first, then fold its payload into the automatic Reveal path and
remove the separate trigger.

What's needed, per the Resolution:

- **Retire the separate Feedback trigger.** Every Participant's Round Score, whether their
  Guess matched the game move, and the Variant explanation become part of what each
  Participant automatically receives at Reveal — no Host button, no `give_feedback` message.
  Remove the "Give Feedback" button from the Host Reveal screen.
- **Guess Groups**: group the current Round's `participants` by exact-match Guess (SAN).
  Compute a bounded breakdown — at most 7 buckets, one per Round Score from -3 to +3, any
  score nobody got omitted entirely (not shown empty).
- **Host Display at Reveal**: show the full breakdown automatically — every Guess Group,
  every Participant's name in it — no extra click required.
- **New Host action, "Share Guess Groups"**: available instead of advancing straight to the
  next Round (the UI slot "Give Feedback" used to occupy). When triggered, pushes the
  breakdown to every Participant: the <=7-bucket chart, the names of everyone in *their own*
  Guess Group, and only a count (never names) for every other Guess Group. This is a
  broadcast-shaped payload (same breakdown content to everyone), unlike the old Feedback,
  which needs a per-Participant targeted shape only for the "which names are visible to me"
  slice — decide the message shape that fits both needs without leaking other groups' names
  to the wrong socket.
- **Visual**: Kahoot-style diverging bar chart, green for positive Round Scores, red for
  negative, is enough for a first pass. Bar sizing/layout beyond that is intentionally
  unspecified — don't over-invest here, it'll be iterated on separately.
- **Not in scope**: Analysis Tree grouping, and any i18n beyond matching however #41 already
  handles existing copy (new strings get message keys the same way, not hardcoded English).

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

You are RALPH, an autonomous coding agent. Implement issue #42 fully.

## Workflow

1. **Explore** — read the issue's Resolution comment, `GLOSSARY.md`, and ADR 0003 before
   writing any code. They already answer every open design question; don't re-litigate them.
   Then read the existing Feedback implementation you're replacing (listed above).
2. **Plan** — decide what to change, keep it as small as the issue actually requires.
3. **Execute** — RGR: write a failing test first where the change is unit-testable (pure
   functions, the Durable Object's message handling), then implement.
4. **Verify** — `npm run typecheck && npm run test` from the repo root before every commit.
   Fix failures before proceeding, never commit red.
5. **Commit** — one commit per logically-complete slice (not one giant commit for the whole
   issue). Message MUST:
   - Start with `RALPH:` prefix
   - Reference issue #42
   - List key decisions made
   - Note any blockers for the next iteration
6. **Close** — once fully implemented and verified, close it:
   `gh issue close 42 --comment "<what was built, in the same style as this repo's other
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

When #42 is closed (or you are blocked on it), output the completion signal:

<promise>COMPLETE</promise>
