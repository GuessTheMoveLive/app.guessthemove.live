# Guess the Move — Feature Catalog

A plain-language inventory of what players and hosts can actually do in the
app today, written for a marketing audience. Every entry cites the code or
doc it was verified against. Where the product's own domain vocabulary
(`GLOSSARY.md`) describes something richer than what's currently live, that
gap is called out explicitly rather than glossed over — see "Named But Not
Yet Built" at the end.

This doc lives at `docs/feature-catalog.md` because the repo keeps its other
research/decision docs under `docs/` (`docs/adr/` for accepted decisions,
`docs/agents/` for how coding agents should read the domain) — no existing
"feature list" convention was found, so this follows that same top-level
`docs/` pattern as a new sibling.

---

## 1. The Live Format

**A real chess game, replayed move by move, for a whole room to guess together.**
Instead of trivia questions, players guess the actual moves played by a
strong player in a real historical game — one move at a time, revealed round
by round — and are scored on how good their guess was, not how fast they
buzzed in.
(source: `GLOSSARY.md` intro; `README.md` — "participants guess the moves of
a strong player from a real game, scored for accuracy rather than speed")

**No app download, no account — just a room code.**
Players join on their own phone by typing a short code (or scanning a QR
code) into a browser. No sign-up, no install. The event itself isn't saved
anywhere once it ends — it's a live, in-the-room experience, not a persistent
account history.
(source: `GLOSSARY.md` "Session"; `src/routes/+page.svelte` — room-code entry
form; `src/routes/host/[code]/+page.svelte` — QR code generation via `qrcode`)

**One person runs the room from a big screen; everyone else plays on their phone.**
The Host drives the session from a shared display (e.g., projected at a
chess club), while every participant guesses privately on their own device.
The Host's screen never leaks a participant's hidden guess early — not even
the Host's own, if they've also joined as a player.
(source: `GLOSSARY.md` "Host", "Host Display"; `src/routes/host/[code]/+page.svelte`)

**Join by scanning a QR code or tapping a link.**
The Host's lobby screen shows a QR code and a plain join URL side by side,
plus a one-tap "copy link" button for pasting into WhatsApp or any chat app
as a fallback to scanning.
(source: `src/routes/host/[code]/+page.svelte` — QR generation, `copyJoinLink`)

**Rejoin seamlessly after a dropped connection or refresh.**
If a player's phone loses signal, the tab is closed, or the page is
refreshed, they land right back in with the same name and running score —
no re-entering, no lost progress.
(source: `src/routes/play/[code]/+page.svelte` — `storageKey` /
auto-rejoin-on-mount comment)

---

## 2. Guessing & Scoring

**Guess the move by tapping the board — no typed notation required.**
Players tap a "from" square, then a "to" square, on a blank, position-hiding
grid; the app resolves it into an actual legal chess move. The real position
on the board is deliberately hidden until the moment of Reveal, so nobody can
peek ahead.
(source: `src/routes/play/[code]/+page.svelte` — tap-to-guess grid;
`docs/adr/0002-chessground-for-reveal-board.md` — "the Play page's grid is a
blank tap-target surface... so the position stays hidden pre-Reveal")

**Guesses are locked in and invisible to everyone — even the Host — until Reveal.**
Once submitted, a guess can't be changed, and nobody (including the person
running the show) can see what anyone guessed until the Host triggers the
big reveal moment.
(source: `GLOSSARY.md` "Guess", "Reveal")

**Scored for chess quality, not speed.**
Points are based on how good the guessed move actually is — compared against
a professional engine's evaluation of the position — not on being first to
answer. A guess scores from -3 up to +3 points per round.
(source: `GLOSSARY.md` "Guess Score"; `src/lib/round/scoring.ts`)

**Guessing the move that was actually played is always a top score.**
No matter how the engine grades it, matching the real, historical move
always earns the maximum, because the whole point of the format is "did you
guess what was actually played."
(source: `GLOSSARY.md` "Guess Score"; `src/lib/round/scoring.ts` —
`scoreGuess`'s fixed +3 override; `docs/adr/0004-...md`)

**A live countdown clock per round, with host control over pacing.**
Each round runs on a visible countdown; the Host can add or remove 30
seconds on the fly to keep the room comfortable, and can reveal early the
moment everyone's answered.
(source: `src/routes/host/[code]/+page.svelte` — `adjustRound`, "+30s/-30s"
buttons, `everyoneAnswered`)

**Missing the deadline costs points — there's no free pass.**
A round not submitted in time scores a fixed penalty, same as a wrong guess
would — there's no option to sit a round out risk-free.
(source: `GLOSSARY.md` "Round" — "A Round not submitted by its deadline
scores -3... there is no no-penalty abstain"; `src/lib/round/scoring.ts` —
`TIMEOUT_PENALTY`)

**Early rounds can be "practice" rounds that don't count.**
A featured game can include warm-up moves before scoring kicks in — players
still guess and still see a reveal, but those rounds are worth zero points
either way, easing the room into the format before anything's on the line.
(source: `GLOSSARY.md` "Scoring Start Move"; `src/lib/round/scoring.ts` —
`isScoringRound` gate)

---

## 3. The Reveal Moment

**Every player instantly gets personal, private feedback the second the Host reveals.**
As soon as the Host hits Reveal, each player's own phone automatically shows
their round score, whether they matched the real move, and a short
explanation of how their guess compares — with no extra step from the Host.
This used to be a separate "Feedback" step the Host had to trigger manually;
it's now automatic for everyone, every time.
(source: `GLOSSARY.md` "Reveal"; `docs/adr/0003-merge-feedback-into-reveal.md`;
`src/routes/play/[code]/+page.svelte` — `feedback` card)

**Plain-English explanations, not just a number.**
Rather than a bare score, players get a sentence like "Better than the move
played — a winning position for you instead of an equal position," comparing
their guess's assessed strength to what was actually played.
(source: `docs/feedback-phrases.md`; `src/lib/round/feedback.ts`)

**A short "what would have happened" preview after a strong alternative guess.**
Some answer-key moves carry a short follow-up line of moves (and a final
assessment) so a player who guessed a strong alternative can see roughly
where that line would have led.
(source: `GLOSSARY.md` "Variant"; `src/routes/play/[code]/+page.svelte` —
`feedback.variant` continuation display)

**A Kahoot-style animated leaderboard that builds suspense.**
Rather than just snapping to new rankings, the leaderboard shows a
multi-stage animation: first everyone's prior standing, then each player's
point gain appears, then rows visually reorder and totals count up to the
new standings — so the room can actually watch the shake-up happen rather
than just read a static result.
(source: `src/lib/components/leaderboard.svelte` — staged reveal comment;
`GLOSSARY.md` "Leaderboard" — "Animated: each row counts up... place changes
animate rather than snap")

**The Host decides when to show the leaderboard each round.**
After a reveal, the Host can choose to show the room-wide leaderboard or
skip straight to the next round — useful for keeping a fast pace when the
rankings aren't the point of that particular round.
(source: `GLOSSARY.md` "Leaderboard" — Host toggle; `src/routes/host/[code]/+page.svelte`
— `showLeaderboard` button)

**Your own score always shows on your own phone — even off the leaderboard.**
The shared leaderboard view only shows the top 5, but every player's own
device always additionally shows their personal running total, so nobody
outside the top ranks feels left in the dark about their own progress.
(source: `GLOSSARY.md` "Leaderboard")

**"Room Statistics": see how the whole room guessed, when the Host chooses to show it.**
Beyond their own result, players can see a chart of how many people guessed
each possible move and how those guesses scored — but only once the Host
turns this on for the round, so it doesn't compete for attention with each
player's own personal result the instant Reveal lands.
(source: `GLOSSARY.md` "Room Statistics", "Guess Group breakdown";
`docs/adr/0005-gate-guess-group-breakdown-behind-room-statistics.md`;
`src/lib/components/guess-group-chart.svelte`)

**See who guessed the same move as you — without snooping on everyone else's answer.**
In that room-wide chart, a player sees the names of everyone who made the
exact same guess they did, but only a headcount (not names) for every other
distinct guess — a light, privacy-respecting way to feel "I wasn't alone" or
"I was the only one" without turning it into a public callout of other
players' answers.
(source: `GLOSSARY.md` "Guess Group breakdown"; `src/routes/play/[code]/+page.svelte`
— `groupBreakdown` card, "guessed with" sentence)

**The Host sees the full breakdown of every answer immediately — no toggle needed.**
Unlike players, the Host's own screen shows every distinct guess, every
name, and the count for each, automatically at Reveal — useful for talking
through the round live without waiting on anything.
(source: `GLOSSARY.md` "Guess Group breakdown" — "The Host Display shows the
full... breakdown... immediately, without needing Room Statistics itself";
`src/routes/host/[code]/+page.svelte` — guess-group card)

**See exactly what the top chess minds considered — and why the actual move was best (or wasn't).**
The Host has access to a full breakdown of every graded alternative at that
position, ranked strongest to weakest, with the engine's evaluation number
and a short explanatory note for cases where the move actually played wasn't
the computer's top pick (acknowledging that strong human players sometimes
have reasons a raw engine evaluation doesn't fully capture).
(source: `GLOSSARY.md`; `src/lib/host/host-view.ts` — `answerKeyBreakdown`,
GM-bonus remark)

**See what happened next — the real game's next move or its entire finish.**
After each round, the room sees the actual next move played in the real
game. On the final round of the featured game, this expands into the whole
remaining sequence of moves to the game's real conclusion — a satisfying,
spoiler-free "here's how it actually ended" moment.
(source: `GLOSSARY.md`-adjacent; `src/lib/round/game-data.ts` —
`opponentResponseSteps`; `src/routes/host/[code]/+page.svelte` and
`src/routes/play/[code]/+page.svelte` — "Opponent Response" screen)

---

## 4. Finishing Strong

**A suspenseful, Kahoot-style podium reveal at the very end.**
Final results don't just appear all at once — third place reveals first,
then second, then first, each with its own little entrance animation and a
medal emoji, building suspense toward the winner.
(source: `src/lib/components/podium.svelte` — staged reveal comments and
timers)

**Every player gets a personal closing message about where they stand.**
At the finish, each player's phone tells them something personal: that
they're (tied for) the winner, or exactly how many points behind the next
player above them they finished — not just an anonymous final leaderboard.
(source: `src/lib/host/host-view.ts` — `finishedMessageFor`;
`src/routes/play/[code]/+page.svelte` — finished-phase message)

**The Host can end the event early — results still make sense.**
If time runs short, the Host can end the session before all rounds are
played; the final standings and the exported record both clearly note that
it ended early and adjust the "maximum possible score" accordingly, so an
early stop never looks like an unexplained anomaly.
(source: `GLOSSARY.md`-adjacent; `src/lib/round/round-machine.ts` —
`END_SESSION`/`earlyEndTotals`; `src/lib/round/pgn.ts` — `endedEarly` handling)

**Take the whole game home as a souvenir file — personalized to you.**
After the event, each player can download a standard chess game file (PGN)
of the entire featured game, annotated move-by-move with their own guesses
and a plain-English performance summary (final score, rank, percentage of
moves guessed exactly right) — openable in any standard chess software or
website.
(source: `src/lib/round/pgn.ts` — `buildParticipantPgn`;
`src/routes/play/[code]/+page.svelte` — `downloadPgn`)

**The Host gets a room-level souvenir too — everyone's guesses, not just one.**
The Host's downloadable game file instead annotates every round with the
full group of distinct guesses the room made and who made them, plus a
room-level summary: the entire final leaderboard, whether it ended early,
and the total time the session ran.
(source: `src/lib/round/pgn.ts` — `buildHostPgn`/`hostFinalMoveSummary`;
`src/routes/host/[code]/+page.svelte` — `downloadHostPgn`)

**A traditional chess "score sheet" view throughout, for a club-paper feel.**
Both the Host and each player can see a running, two-column scoresheet of
the game (event, date, players, and the move list) in the style of a
physical tournament scoresheet — on the player's version, each of their own
past guesses and points earned is layered right onto the move list.
(source: `src/lib/components/score-sheet.svelte`, `src/lib/components/game-sheet.svelte`
— "club-paper-form move list")

---

## 5. Running the Room (Host Tools)

**A persistent roster panel the Host alone can see, every round.**
Unlike the leaderboard (ranked-only, toggle-gated, never shown to players),
the Host has an always-visible scoreboard of literally everyone in the room,
their running score, and — once submitted — their move for the current
round, so the Host always has the full picture even while the leaderboard is
hidden from the room.
(source: `GLOSSARY.md` "Scoreboard"; `src/routes/host/[code]/+page.svelte` —
scoreboard card)

**Remove a disruptive or mistaken player on the spot.**
The Host can kick any participant directly from the live roster at any time;
a kicked player is dropped back to a "removed" screen and won't silently
auto-rejoin on their next refresh.
(source: `src/lib/round/round-machine.ts` — `KICK` event;
`src/routes/host/[code]/+page.svelte` — kick button per row;
`src/routes/play/[code]/+page.svelte` — `client.kicked` handling)

**Reset the whole room back to the lobby, or delete the session outright.**
The Host has a one-click reset (back to the start, same room) and a
confirm-protected delete (ends the session for everyone, with a "are you
sure" second click) — guarding against an accidental tap wiping out a live
event.
(source: `src/routes/host/[code]/+page.svelte` — `reset`, `deleteSession`,
`confirmingDelete`)

**Sticky header keeps the room code and phase visible while scrolling.**
On both the Host and player screens, the room code and current phase stay
pinned at the top even as the page scrolls through a long Reveal screen with
multiple cards — so nobody loses track of which room or round they're in.
(source: `src/lib/round/header-context.svelte.ts`; referenced in recent
commit "Room Statistics toggle, sticky header/footer+version")

---

## 6. Behind the Scenes (for context, not advertised to players)

These aren't user-facing "features" so much as production facts worth
knowing when describing the product honestly:

- **One real historical game per event, chosen ahead of time by whoever sets
  up the session** — not picked live by the room from a search during the
  event itself. The shipped v1 loads a single precomputed game (a 1909
  Capablanca–Marshall game is the bundled example) with its engine analysis
  already baked in. (source: `src/lib/round/game-data.ts` — loads
  `src/lib/data/capablanca-marshall.json`; comment "no live engine")
- **Move evaluations are precomputed offline by a chess engine (Stockfish)**,
  not generated live/on demand during the event. (source:
  `src/lib/data/capablanca-marshall.json` header `"Annotator":"Stockfish 19..."`;
  `src/lib/round/scoring.ts` comment "no live engine")
- **Multi-language support**: the interface ships in English, German,
  Spanish, and French. (source: `messages/en.json`, `de.json`, `es.json`,
  `fr.json`)

---

## Named But Not Yet Built

`GLOSSARY.md` documents a richer vocabulary than what ships today — these
terms describe intended or aspirational product direction, not current
functionality. Flagging them explicitly so marketing copy doesn't promise
something the live app doesn't do:

- **Plenum Selection Phase & Candidate Game search** — the glossary describes
  a live, in-room process where the Host enters moves on the board as the
  room agrees on an opening, then the system searches real games matching
  that position and an "Accuracy Score" quality gate, letting the Host pick
  which real game to feature. None of this exists in code: `scoring.ts`
  explicitly notes "no Plenum Selection in v1," and `game-data.ts` only ever
  loads one fixed, pre-chosen game file. Today, the featured game is chosen
  and prepared entirely offline, before the event starts.
- **Analysis Tree (with Anticipated Replies, Wildcard Replies, Assessment
  Symbols, Soundness Bonus, Assessment Bonus)** — the glossary describes an
  optional, deep system where a player can branch out their own predicted
  continuation beyond their locked guess, annotate it with chess assessment
  symbols, and earn bonus points for sound analysis. No trace of this exists
  in any component, route, or the round state machine. `scoring.ts` states
  outright: "v1 scores a single locked Guess only — no live engine, no
  Analysis Tree — so Round Score == Guess Score." Today, a round's score is
  exactly the Guess Score — nothing more.
- **Live, on-demand Evaluation** — the glossary frames "Evaluation" as
  something "produced live and on demand" by the engine. In the shipped app
  it is precomputed entirely offline ahead of the event (see above).
- **Chessground-rendered Reveal board** — ADR-0002 (accepted) describes
  switching to rendering an actual visual chess board at Reveal using the
  `chessground` library. No reference to `chessground` exists anywhere in
  `src/`; the Reveal screen currently shows text/notation (move lists, the
  answer key, the opponent's next move as plain text), not a rendered board
  diagram. This looks like an accepted-but-not-yet-implemented decision.

These gaps are worth surfacing to whoever owns the roadmap/marketing copy —
some (Analysis Tree, Plenum Selection) are substantial future features, and
describing them as current would overstate the product.
