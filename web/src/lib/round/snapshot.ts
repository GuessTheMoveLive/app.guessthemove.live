import type { RoundContext } from './round-machine';

// The shape SessionRoom broadcasts to every connected client over the WebSocket.
// Kept server-free (type-only imports) so both the Durable Object and the browser
// clients (Host and Participant screens) can share it without pulling in
// `cloudflare:workers`.

/** The round lifecycle machine's flat state value. */
export type RoundStateValue = 'lobby' | 'active' | 'closed' | 'reveal';

export interface RoundSnapshot {
	value: RoundStateValue;
	context: RoundContext;
	/** Epoch ms when the current Round's clock runs out, or null when no Round is running. */
	deadline: number | null;
}
