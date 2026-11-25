---
name: run-guessthemove-live
description: Build, run, and drive guessthemove.live (the "Guess the Move" live-quiz web app). Use when asked to start the app, run its tests, build it, take a screenshot of the Host or Participant screen, or interact with a running Host/Participant session.
---

A SvelteKit app deployed as a Cloudflare Worker, with session state held in a
Durable Object (`SESSION_ROOM`). Because of that DO, `npm run dev` (plain
`vite dev`) **cannot** serve the live multiplayer session — only
`wrangler dev` runs the Durable Object locally. Drive it via
`.claude/skills/run-guessthemove-live/driver.mjs` (graduated to
`e2e/host-participant-flow.mjs` — see below), which spins up a real
`wrangler dev` instance and a headless Chromium (via the `playwright` npm
package, already a devDependency — no separate browser-automation CLI here)
to click through a full Host → Start Round → Participant session.

All paths below are relative to the repo root.

## Prerequisites

Node 24 (`node --version`; CI pins `node-version: 24`). `npm ci` installs
everything needed, including Playwright's bundled Chromium via the
`playwright` devDependency's postinstall. If `chromium.launch()` ever fails
with "Executable doesn't exist", run `npx playwright install chromium`.

## Build

Required before `wrangler dev` will serve anything (it serves the
`.svelte-kit/cloudflare` build output as static assets, plus the worker):

```bash
npm run build
```

## Run (agent path)

The driver lives at `e2e/host-participant-flow.mjs` (graduated out of the
skill directory because the project's own smoke-test npm script calls it
directly — see `package.json`'s `test:e2e`). It is a self-contained Node
script, not a long-lived REPL: each run builds nothing itself, launches its
own `wrangler dev` on port 4174, drives one full session, asserts the board
orientation, tears the server down, and exits — point-and-shoot rather than
interactive.

```bash
npm run build                        # once per change you want reflected
node e2e/host-participant-flow.mjs   # launches wrangler dev, drives a session, exits
```

Or, as the committed smoke test (build + run in one step):

```bash
npm run test:e2e
```

What it does, in order: POSTs `/create-session` as the Host, extracts the
Room Code from the resulting `/host/<code>?token=...` URL, opens a second
page and joins as Participant `"E2E"`, clicks the Host's "Start Round"
button, then reads the tap-to-guess grid's rank/file label DOM
(`div.w-5` for rank cells, the trailing row's `div.flex-1` for file
labels) and asserts it matches the expected orientation for the bundled
Featured Game.

To **look at** the running app instead of (or in addition to) asserting
against it, set `SCREENSHOT_DIR` — it saves `host.png` and
`participant.png` right after the Round starts:

```bash
SCREENSHOT_DIR=/tmp/shots node e2e/host-participant-flow.mjs
```

To drive a different flow (Reveal, a specific Round, a tap-to-guess move),
copy `host-participant-flow.mjs` as a starting point — it already has the
`wrangler dev` launch/teardown and the Host/Participant page handles; swap
out the block between `hostPage.locator('button:has-text("Start Round")')`
and the final assertions for whatever you need to click or read next.
Useful Host button labels (English locale, the base locale): `Start Round`,
`Reveal`, `Next Round`, `Finish`.

## Run (human path)

```bash
npm run build
npm run preview   # wrangler dev --port 4173 - open http://127.0.0.1:4173
```

Home page (`/`) has a room-code join form and a "Host a Game" button
(`POST /create-session`) that redirects straight to `/host/<code>?token=...`.
Share `/play/<code>` for Participants. Ctrl-C to stop.

## Test

```bash
npm run test        # vitest unit suite - 258 tests, fast
npm run check        # svelte-check + wrangler types - 0 errors expected
npm run lint          # prettier --check + eslint
npm run test:e2e    # the driver above, as a smoke test (not in CI)
```

## Gotchas

- **`npm run check` deletes the build output** (its first step is
  `scripts/clean-build-output.mjs`, which empties `.svelte-kit/cloudflare`).
  Running `wrangler dev`/`npm run preview` right after `npm run check`
  fails with `"assets.directory" field ... does not exist` — rebuild
  (`npm run build`) first if you've run `check` since the last build.
- **`vite dev` silently can't do live sessions.** `/api/session/<code>`'s
  WebSocket needs the `SESSION_ROOM` Durable Object, which only
  `wrangler dev` (or deployed Cloudflare) provides. Always use
  `npm run preview` / `wrangler dev`, never `npm run dev`, when a session
  needs to actually run.
- **`wrangler dev`'s process tree outlives a plain `.kill()` on Windows.**
  It's launched with `shell: true` (needed to resolve `npx` on Windows), so
  killing just that PID leaves the wrapped `wrangler`/`workerd` processes
  bound to the port. The driver's `killTree()` helper uses a Windows
  `taskkill` with its "kill the whole tree" flag, and a process-group
  `SIGKILL` on POSIX — reuse it rather than calling `.kill()` directly if
  you extend the script.
- **Piping the driver's output through `tail -N` hides all progress until
  the whole run finishes** (`tail` buffers until EOF), which looks
  identical to a hang for the several minutes a build + wrangler-dev
  startup + browser flow takes. Run it unpiped, or background it and poll
  the output file.
- **Host button text is locale-dependent.** The driver's selectors
  (`button:has-text("Start Round")`, etc.) match the English strings in
  `messages/en.json`; `project.inlang`'s `strategy` falls back to the base
  locale (`en`) with no cookie/`Accept-Language` override, so a fresh
  browser profile (as Playwright launches) gets English by default.

## Troubleshooting

- **`page.goto` times out / nothing responds**: a previous run's
  `wrangler dev` is still bound to the port (seen after manually
  interrupting a run instead of letting it finish and tear itself down).
  Find and kill it: on Windows,
  `Get-NetTCPConnection -LocalPort 4174 | Select OwningProcess`, then
  `Stop-Process -Id <pid> -Force` (you may need to kill both the `wrangler`
  node process and the child `workerd` process it spawned).
