# Guess the Move

A live, multiplayer chess training format: participants guess the moves of a strong
player from a real game, scored for accuracy rather than speed, while a shared display
runs the event. See `GLOSSARY.md` for domain vocabulary and `AGENTS.md` for how this
repo is organized (issue tracker, domain docs).

SvelteKit + Cloudflare Workers (Durable Objects for session state). Deployed to
`preview.app.guessthemove.live` from the `preview` branch.

## Developing

```sh
npm install
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

Durable Object websockets only work under Wrangler, not plain Vite dev:

```sh
npm run build
npm run preview   # wrangler dev --port 4173
```

## Building & deploying

```sh
npm run build
npm run deploy     # wrangler deploy
```

## Checks

```sh
npm run typecheck
npm run test
```
