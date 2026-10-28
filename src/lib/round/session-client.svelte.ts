import { browser } from '$app/env';
import type { RoundSnapshot } from './snapshot';
import type { ParticipantFeedback } from './feedback';

/** A targeted, per-Participant Feedback message (#36) — distinct from the broadcast
 *  RoundSnapshot by its `type` tag, since it's sent to one Participant's socket only. */
interface FeedbackMessage {
	type: 'feedback';
	feedback: ParticipantFeedback;
}

// A thin reactive wrapper around the SessionRoom WebSocket (`/api/session/:code`),
// reusing the transport already smoke-tested in session-room.ts. Holds the latest
// broadcast snapshot in runes-backed state so Svelte screens can read it directly.
// Shared by the Host control screen (#34) and the Participant input screen (#33).

export interface HostConnectOptions {
	code: string;
	role: 'host';
	/** The Host Token embedded in the Host's own Session URL (#37) - proves control. */
	token: string;
}

export interface ParticipantConnectOptions {
	code: string;
	participantId: string;
}

export type ConnectOptions = HostConnectOptions | ParticipantConnectOptions;

/** The close code SessionRoom uses when the Host kicks a Participant (see session-room.ts). */
const KICK_CLOSE_CODE = 4403;
/** The close code SessionRoom uses when the Host deletes the whole Session (#38). */
const DELETE_CLOSE_CODE = 4410;

export class SessionClient {
	snapshot = $state<RoundSnapshot | null>(null);
	connected = $state(false);
	/** True once the server has closed this connection specifically because the Host
	 *  kicked this Participant — distinct from an ordinary dropped connection, so the
	 *  screen can say so instead of just showing "connecting…". */
	kicked = $state(false);
	/** True once the Host has deleted this Session entirely (#38) — every connection,
	 *  Host included, sees "This session has ended" rather than just retrying. */
	ended = $state(false);
	/** This Participant's personalized Feedback, populated when the Host clicks "Give
	 *  Feedback" (#36) and the server sends a targeted `feedback` message. Null until then. */
	feedback = $state<ParticipantFeedback | null>(null);
	#ws: WebSocket | null = null;

	connect(options: ConnectOptions): void {
		if (!browser || this.#ws) return;

		const query =
			'role' in options
				? `role=${options.role}&token=${encodeURIComponent(options.token)}`
				: `participantId=${encodeURIComponent(options.participantId)}`;
		const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
		const code = encodeURIComponent(options.code);
		const ws = new WebSocket(`${scheme}://${location.host}/api/session/${code}?${query}`);
		this.#ws = ws;

		ws.addEventListener('open', () => (this.connected = true));
		ws.addEventListener('close', (event) => {
			this.connected = false;
			if (event.code === KICK_CLOSE_CODE) this.kicked = true;
			else if (event.code === DELETE_CLOSE_CODE) this.ended = true;
		});
		ws.addEventListener('message', (event) => {
			const data = JSON.parse(event.data as string) as RoundSnapshot | FeedbackMessage;
			// A targeted Feedback message (#36) carries a `type` tag; the broadcast snapshot
			// never does. Route each to its own reactive field so a Feedback push doesn't
			// clobber the live round snapshot.
			if ('type' in data && data.type === 'feedback') {
				this.feedback = data.feedback;
			} else {
				this.snapshot = data as RoundSnapshot;
			}
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

	/** Host sends every Participant their personalized Feedback (#36) — an alternative to
	 *  Next Round, offered on the Reveal screen. */
	giveFeedback(): void {
		this.#send({ type: 'give_feedback' });
	}

	/** Host removes a disruptive Participant; they cannot rejoin under the same name. */
	kick(participantId: string): void {
		this.#send({ type: 'kick', participantId });
	}

	/** Host wipes roster/scores back to the Lobby, same Room Code and Featured Game (#38). */
	reset(): void {
		this.#send({ type: 'reset' });
	}

	/** Host permanently destroys the Session and frees its Room Code for reuse (#38). */
	deleteSession(): void {
		this.#send({ type: 'delete_session' });
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
