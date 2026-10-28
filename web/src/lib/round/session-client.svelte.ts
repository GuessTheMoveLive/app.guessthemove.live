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

/** The close code SessionRoom uses when the Host kicks a Participant (see session-room.ts). */
const KICK_CLOSE_CODE = 4403;

export class SessionClient {
	snapshot = $state<RoundSnapshot | null>(null);
	connected = $state(false);
	/** True once the server has closed this connection specifically because the Host
	 *  kicked this Participant — distinct from an ordinary dropped connection, so the
	 *  screen can say so instead of just showing "connecting…". */
	kicked = $state(false);
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
		ws.addEventListener('close', (event) => {
			this.connected = false;
			if (event.code === KICK_CLOSE_CODE) this.kicked = true;
		});
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

	/** Host advances from a fully revealed Round into the next one (#22's Host-driven pacing). */
	nextRound(): void {
		this.#send({ type: 'next_round' });
	}

	/** Host removes a disruptive Participant; they cannot rejoin under the same name. */
	kick(participantId: string): void {
		this.#send({ type: 'kick', participantId });
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
