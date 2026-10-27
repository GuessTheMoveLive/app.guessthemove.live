// @ts-nocheck - re-exports @sveltejs/adapter-cloudflare's generated worker, which doesn't
// exist until `vite build` has run and isn't meant to be typechecked by consumers.
import svelteKitWorker from '../.svelte-kit/cloudflare/_worker.js';
export { SessionRoom } from '$lib/server/session-room';

// WebSocket upgrades for session rooms are routed here directly rather than through a
// SvelteKit +server.ts route: SvelteKit's response layer doesn't preserve the special
// `webSocket`-carrying Response Cloudflare uses for the 101 handshake, so a route proxying
// through server.respond() produces a Response that looks like a valid upgrade but whose
// socket is already dead.
const SESSION_ROOM_PATH = /^\/api\/session\/([^/]+)$/;

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

		return svelteKitWorker.fetch(request, env, ctx);
	}
};
