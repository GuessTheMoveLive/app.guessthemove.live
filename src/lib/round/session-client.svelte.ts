import { browser } from '$app/env';
import type { RoundSnapshot } from './snapshot';

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
	/** Server clock minus this device's own clock, measured off each broadcast snapshot's
	 *  `serverNow` (#92) - add this to a local `Date.now()` reading before comparing it to
	 *  `deadline` so the Round countdown is accurate even when the device's own wall clock
	 *  is off by a few seconds either way. */
	clockOffsetMs = $state(0);
	/** True once the very first connection has opened - distinguishes "still making the
	 *  first connection" from "was connected, then dropped" below, so the connection chip
	 *  (#92) can tell "connecting…" apart from "broken". */
	#hasConnectedOnce = $state(false);
	#ws: WebSocket | null = null;

	/** The connection chip's three states (#92): `connecting` before the first connection
	 *  has ever opened, `live` while connected, `broken` for a connection that opened once
	 *  and has since dropped (and wasn't a kick/delete, which get their own dedicated
	 *  screens instead of this chip). */
	get status(): 'connecting' | 'live' | 'broken' {
		if (this.connected) return 'live';
		return this.#hasConnectedOnce ? 'broken' : 'connecting';
	}

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

		ws.addEventListener('open', () => {
			this.connected = true;
			this.#hasConnectedOnce = true;
		});
		ws.addEventListener('close', (event) => {
			this.connected = false;
			if (event.code === KICK_CLOSE_CODE) this.kicked = true;
			else if (event.code === DELETE_CLOSE_CODE) this.ended = true;
		});
		ws.addEventListener('message', (event) => {
			const snapshot = JSON.parse(event.data as string) as RoundSnapshot;
			this.clockOffsetMs = snapshot.serverNow - Date.now();
			this.snapshot = snapshot;
		});
	}

	#send(message: object): void {
		this.#ws?.send(JSON.stringify(message));
	}

	startRound(): void {
		this.#send({ type: 'start_round' });
	}

	/** Host selects the Featured Game from the Game Catalog, in the Lobby (#93) - freely
	 *  re-selectable any number of times before Start, which SessionRoom refuses to allow
	 *  until some selection has been made. */
	selectGame(gameId: string): void {
		this.#send({ type: 'select_game', gameId });
	}

	/** Shorten (negative) or extend (positive) the running Round clock, in ms (#22). */
	adjustRound(deltaMs: number): void {
		this.#send({ type: 'adjust_round', deltaMs });
	}

	reveal(): void {
		this.#send({ type: 'reveal' });
	}

	/** Host moves every client on from Reveal to the Opponent Response screen (#48). */
	continueRound(): void {
		this.#send({ type: 'continue' });
	}

	/** Host returns every client from the Opponent Response screen back to Reveal (#48). */
	back(): void {
		this.#send({ type: 'back' });
	}

	/** Host moves every client from the final Round's Opponent Response into the
	 *  terminal Finished phase (#50). */
	finish(): void {
		this.#send({ type: 'finish' });
	}

	/** Host advances from a fully revealed Round into the next one (#22's Host-driven pacing). */
	nextRound(): void {
		this.#send({ type: 'next_round' });
	}

	/** Host toggles the Leaderboard on the shared Reveal screen and every Participant's
	 *  phone (#51) — broadcast via the snapshot's `showLeaderboard`. Independent of
	 *  showRoomStatistics below; both can be open at once. */
	showLeaderboard(): void {
		this.#send({ type: 'show_leaderboard' });
	}

	/** Host toggles the Guess Group breakdown card on the shared Reveal screen and every
	 *  Participant's phone (#73) — same toggle shape as showLeaderboard above, broadcast via
	 *  the snapshot's `showRoomStatistics`, and independent of it. */
	showRoomStatistics(): void {
		this.#send({ type: 'show_room_statistics' });
	}

	/** Host removes a disruptive Participant; they cannot rejoin under the same name. */
	kick(participantId: string): void {
		this.#send({ type: 'kick', participantId });
	}

	/** Host clears one Participant's mistaken Guess back to not-submitted so they can
	 *  resubmit before the Round's shared deadline (#90) - no effect on anyone else's
	 *  Guess, score, or remaining time, and no independent timer of its own. */
	resetGuess(participantId: string): void {
		this.#send({ type: 'reset_guess', participantId });
	}

	/** Host wipes roster/scores back to the Lobby, same Room Code and Featured Game (#38). */
	reset(): void {
		this.#send({ type: 'reset' });
	}

	/** Host permanently destroys the Session and frees its Room Code for reuse (#38). */
	deleteSession(): void {
		this.#send({ type: 'delete_session' });
	}

	/** Host stops further Rounds and jumps straight to Final Results using only the
	 *  Rounds actually played — unlike deleteSession, the Session (and its Room Code)
	 *  stays intact afterward (#57). */
	endSessionEarly(): void {
		this.#send({ type: 'end_session_early' });
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
