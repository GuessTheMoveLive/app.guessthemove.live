// @ts-nocheck - re-exports @sveltejs/adapter-cloudflare's generated worker, which doesn't
// exist until `vite build` has run and isn't meant to be typechecked by consumers.
import svelteKitWorker from '../.svelte-kit/cloudflare/_worker.js';
import { generateRoomCode } from '#lib/server/room-code.js';
export { SessionRoom } from '#lib/server/session-room.js';

// WebSocket upgrades for session rooms are routed here directly rather than through a
// SvelteKit +server.ts route: SvelteKit's response layer doesn't preserve the special
// `webSocket`-carrying Response Cloudflare uses for the 101 handshake, so a route proxying
// through server.respond() produces a Response that looks like a valid upgrade but whose
// socket is already dead.
const SESSION_ROOM_PATH = /^\/api\/session\/([^/]+)$/;

/** How many fresh Room Codes to try before giving up on a collision (#37). At ~1 billion
 *  possible codes this should essentially never exhaust. */
const MAX_CREATE_ATTEMPTS = 5;

// Session creation is also handled here rather than through a SvelteKit +server.ts route:
// `platform.env` is unreliably populated for SvelteKit routes in this adapter/dev setup
// (Cloudflare's `cloudflare:workers` ALS-backed env proxy), whereas this handler's own
// `env` parameter is always the real per-request binding.
async function createSession(origin: string, env) {
	for (let attempt = 0; attempt < MAX_CREATE_ATTEMPTS; attempt++) {
		const code = generateRoomCode();
		const id = env.SESSION_ROOM.idFromName(code);
		const token = await env.SESSION_ROOM.get(id).createSession();
		if (token) {
			return Response.redirect(`${origin}/host/${code}?token=${token}`, 303);
		}
	}
	return new Response('Could not allocate a Room Code - please try again', { status: 500 });
}

export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);
		const match = url.pathname.match(SESSION_ROOM_PATH);

		if (match && request.headers.get('Upgrade') === 'websocket') {
			// Room Codes are case-insensitive: people retype them off a projected screen, and
			// idFromName is case-sensitive, so "abc" and "ABC" would otherwise be two rooms.
			const id = env.SESSION_ROOM.idFromName(decodeURIComponent(match[1]).toUpperCase());
			return env.SESSION_ROOM.get(id).fetch(request);
		}

		if (url.pathname === '/create-session' && request.method === 'POST') {
			return createSession(url.origin, env);
		}

		return svelteKitWorker.fetch(request, env, ctx);
	}
};
