import { browser } from '$app/env';
import type { RoundSnapshot } from './snapshot';

// A thin reactive wrapper around the SessionRoom WebSocket (`/api/session/:code`),
// reusing the transport already smoke-tested in session-room.ts. Holds the latest
// broadcast snapshot in runes-backed state so Svelte screens can read it directly.
// Shared by the Host control screen (#34) and the Participant input screen (#33).

export interface HostConnectOptions {
	code: string;
	role: 'host';
}

export interface ParticipantConnectOptions {
	code: string;
	participantId: string;
}

export type ConnectOptions = HostConnectOptions | ParticipantConnectOptions;

export class SessionClient {
	snapshot = $state<RoundSnapshot | null>(null);
	connected = $state(false);
	#ws: WebSocket | null = null;

	connect(options: ConnectOptions): void {
		if (!browser || this.#ws) return;

		const query =
			'role' in options
				? `role=${options.role}`
				: `participantId=${encodeURIComponent(options.participantId)}`;
		const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
		const code = encodeURIComponent(options.code);
		const ws = new WebSocket(`${scheme}://${location.host}/api/session/${code}?${query}`);
		this.#ws = ws;

		ws.addEventListener('open', () => (this.connected = true));
		ws.addEventListener('close', () => (this.connected = false));
		ws.addEventListener('message', (event) => {
			this.snapshot = JSON.parse(event.data as string) as RoundSnapshot;
		});
	}

	#send(message: object): void {
		this.#ws?.send(JSON.stringify(message));
	}

	startRound(): void {
		this.#send({ type: 'start_round' });
	}

	/** Shorten (negative) or extend (positive) the running Round clock, in ms (#22). */
	adjustRound(deltaMs: number): void {
		this.#send({ type: 'adjust_round', deltaMs });
	}

	reveal(): void {
		this.#send({ type: 'reveal' });
	}

	submit(guess: string): void {
		this.#send({ type: 'submit', guess });
	}

	disconnect(): void {
		this.#ws?.close();
		this.#ws = null;
		this.connected = false;
	}
}
